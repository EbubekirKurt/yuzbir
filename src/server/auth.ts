// Hesaplar ve oturumlar.
// Şifreler scrypt ile (kullanıcıya özel salt) hash'lenir; düz şifre hiçbir yerde tutulmaz.
// Oturum anahtarı httpOnly çerezde durur, veritabanında yalnızca SHA-256 özeti saklanır.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { ObjectId, type Collection, type Db } from 'mongodb';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'yuzbir_sid';
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await scrypt(password, salt, keylen, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// ---------- kullanıcı deposu ----------

export interface User {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  avatar: { data: Buffer; type: string } | null;
  avatarVersion: number;
  createdAt: Date;
  /** Radyoda yıldızlanan istasyonların kimlikleri (eklenme sırasıyla). */
  radioFavorites: string[];
  /** Şifre sıfırlama için; eski hesaplarda yok. Başkalarına hiçbir zaman gösterilmez. */
  email: string | null;
  emailVerified: boolean;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Sadece kullanıcının kendisine dönen bilgi (e-posta dahil). */
export function selfUser(u: User) {
  return { ...publicUser(u), email: u.email, emailVerified: u.emailVerified };
}

export type TokenKind = 'verify' | 'reset';
interface EmailToken {
  tokenHash: string;
  userId: string;
  kind: TokenKind;
  /** Token hangi adres için üretildi; adres sonradan değişirse token geçersiz olur. */
  email: string;
  expiresAt: Date;
}

export function publicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: avatarUrl(u),
  };
}

export function avatarUrl(u: Pick<User, 'id' | 'avatar' | 'avatarVersion'>): string | null {
  return u.avatar ? `/api/avatar/${u.id}?v=${u.avatarVersion}` : null;
}

interface Store {
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(u: Omit<User, 'id'>): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  update(id: string, patch: Partial<Omit<User, 'id' | 'username' | 'createdAt'>>): Promise<User | null>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findSession(tokenHash: string): Promise<{ userId: string; expiresAt: Date } | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  /** Aynı kullanıcının aynı türdeki eski token'larını siler, yenisini kaydeder. */
  putToken(t: EmailToken): Promise<void>;
  /** Token'ı bulur ve siler (tek kullanımlık). */
  takeToken(tokenHash: string, kind: TokenKind): Promise<EmailToken | null>;
}

/** MONGODB_URI tanımlı değilse (yerel deneme) kullanılır; sunucu kapanınca hesaplar silinir. */
class MemoryStore implements Store {
  private users = new Map<string, User>();
  private sessions = new Map<string, { userId: string; expiresAt: Date }>();
  async findByUsername(username: string) {
    const lower = username.toLowerCase();
    return [...this.users.values()].find((u) => u.username.toLowerCase() === lower) ?? null;
  }
  async findById(id: string) {
    return this.users.get(id) ?? null;
  }
  async findByEmail(email: string) {
    const lower = email.toLowerCase();
    return [...this.users.values()].find((u) => u.email?.toLowerCase() === lower) ?? null;
  }
  async create(u: Omit<User, 'id'>) {
    if (u.email && (await this.findByEmail(u.email))) throw Object.assign(new Error('dup'), { code: 11000, keyPattern: { emailLower: 1 } });
    const user = { ...u, id: new ObjectId().toHexString() };
    this.users.set(user.id, user);
    return user;
  }
  private tokens = new Map<string, EmailToken>();
  async deleteUserSessions(userId: string) {
    for (const [k, s] of this.sessions) if (s.userId === userId) this.sessions.delete(k);
  }
  async putToken(t: EmailToken) {
    for (const [k, x] of this.tokens) if (x.userId === t.userId && x.kind === t.kind) this.tokens.delete(k);
    this.tokens.set(t.tokenHash, t);
  }
  async takeToken(tokenHash: string, kind: TokenKind) {
    const t = this.tokens.get(tokenHash);
    if (!t || t.kind !== kind) return null;
    this.tokens.delete(tokenHash);
    return t;
  }
  async update(id: string, patch: Partial<User>) {
    const u = this.users.get(id);
    if (!u) return null;
    Object.assign(u, patch);
    return u;
  }
  async createSession(userId: string, tokenHash: string, expiresAt: Date) {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }
  async findSession(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }
  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
}

interface UserDoc {
  _id: ObjectId;
  username: string;
  usernameLower: string;
  displayName: string;
  passwordHash: string;
  avatar: { data: { buffer: ArrayBuffer } | Buffer; type: string } | null;
  avatarVersion: number;
  createdAt: Date;
  radioFavorites?: string[];
  email?: string | null;
  /** Benzersizlik için küçük harfli kopya; e-postası olmayan hesaplarda alan hiç yok. */
  emailLower?: string;
  emailVerified?: boolean;
}

class MongoStore implements Store {
  private users: Collection<UserDoc>;
  private sessions: Collection<{ tokenHash: string; userId: string; expiresAt: Date; createdAt: Date }>;
  private tokens: Collection<EmailToken>;
  constructor(db: Db) {
    this.users = db.collection('users');
    this.sessions = db.collection('sessions');
    this.tokens = db.collection('email_tokens');
  }
  async init() {
    await this.users.createIndex({ usernameLower: 1 }, { unique: true });
    // Aynı e-posta iki hesapta olmasın (e-postası olmayan eski hesaplar hariç)
    await this.users.createIndex({ emailLower: 1 }, { unique: true, partialFilterExpression: { emailLower: { $type: 'string' } } });
    await this.sessions.createIndex({ tokenHash: 1 }, { unique: true });
    await this.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await this.sessions.createIndex({ userId: 1 });
    await this.tokens.createIndex({ tokenHash: 1 }, { unique: true });
    await this.tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await this.tokens.createIndex({ userId: 1, kind: 1 });
  }
  async findByEmail(email: string) {
    const d = await this.users.findOne({ emailLower: email.toLowerCase() });
    return d ? this.toUser(d) : null;
  }
  async deleteUserSessions(userId: string) {
    await this.sessions.deleteMany({ userId });
  }
  async putToken(t: EmailToken) {
    await this.tokens.deleteMany({ userId: t.userId, kind: t.kind });
    await this.tokens.insertOne({ ...t });
  }
  async takeToken(tokenHash: string, kind: TokenKind) {
    return this.tokens.findOneAndDelete({ tokenHash, kind });
  }
  private toUser(d: UserDoc): User {
    const raw = d.avatar?.data as unknown;
    const data = raw
      ? Buffer.isBuffer(raw)
        ? raw
        : Buffer.from((raw as { buffer: ArrayBuffer }).buffer)
      : null;
    return {
      id: d._id.toHexString(),
      username: d.username,
      displayName: d.displayName,
      passwordHash: d.passwordHash,
      avatar: data && d.avatar ? { data, type: d.avatar.type } : null,
      avatarVersion: d.avatarVersion ?? 0,
      createdAt: d.createdAt,
      radioFavorites: d.radioFavorites ?? [],
      email: d.email ?? null,
      emailVerified: !!d.emailVerified,
    };
  }
  async findByUsername(username: string) {
    const d = await this.users.findOne({ usernameLower: username.toLowerCase() });
    return d ? this.toUser(d) : null;
  }
  async findById(id: string) {
    if (!ObjectId.isValid(id)) return null;
    const d = await this.users.findOne({ _id: new ObjectId(id) });
    return d ? this.toUser(d) : null;
  }
  async create(u: Omit<User, 'id'>) {
    const _id = new ObjectId();
    const doc = { ...u, _id, usernameLower: u.username.toLowerCase() } as UserDoc;
    if (u.email) doc.emailLower = u.email.toLowerCase();
    await this.users.insertOne(doc);
    return { ...u, id: _id.toHexString() };
  }
  async update(id: string, patch: Partial<User>) {
    const set = { ...patch } as Partial<UserDoc>;
    const unset: Record<string, ''> = {};
    if ('email' in patch) {
      if (patch.email) set.emailLower = patch.email.toLowerCase();
      else unset.emailLower = '';
    }
    const d = await this.users.findOneAndUpdate(
      { _id: new ObjectId(id) },
      Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set },
      { returnDocument: 'after' },
    );
    return d ? this.toUser(d) : null;
  }
  async createSession(userId: string, tokenHash: string, expiresAt: Date) {
    await this.sessions.insertOne({ tokenHash, userId, expiresAt, createdAt: new Date() });
  }
  async findSession(tokenHash: string) {
    return this.sessions.findOne({ tokenHash });
  }
  async deleteSession(tokenHash: string) {
    await this.sessions.deleteOne({ tokenHash });
  }
}

let store: Store | null = null;
let storeError: string | null = null;

/** db: bağlantı varsa Mongo, MONGODB_URI hiç yoksa bellek. Bağlantı başarısızsa hesaplar kapalı. */
export async function initAuth(db: Db | null, hasUri: boolean) {
  if (db) {
    const s = new MongoStore(db);
    await s.init();
    store = s;
  } else if (!hasUri) {
    console.warn('[auth] MONGODB_URI yok: hesaplar geçici bellekte tutuluyor (sadece yerel deneme için).');
    store = new MemoryStore();
  } else {
    storeError = 'Veritabanına bağlanılamadı. Biraz sonra tekrar dene.';
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function getStore(): Store {
  if (!store) throw new AuthError(storeError ?? 'Hesap sistemi hazır değil.', 503);
  return store;
}

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;

export function cleanDisplayName(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 16);
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@.]{2,}$/;
const EMAIL_TAKEN = 'Bu e-posta başka bir hesapta kullanılıyor.';

function cleanEmail(raw: unknown): string {
  const email = String(raw ?? '').trim();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new AuthError('Geçerli bir e-posta adresi yaz.');
  return email;
}

function checkPassword(password: string) {
  if (password.length < 6 || password.length > 100) throw new AuthError('Şifre en az 6 karakter olmalı.');
}

const isDup = (err: unknown) => (err as { code?: number }).code === 11000;
const dupIsEmail = (err: unknown) => !!(err as { keyPattern?: Record<string, unknown> }).keyPattern?.emailLower;

export async function register(usernameRaw: unknown, passwordRaw: unknown, emailRaw: unknown) {
  const username = String(usernameRaw ?? '').trim();
  const password = String(passwordRaw ?? '');
  if (!USERNAME_RE.test(username))
    throw new AuthError('Kullanıcı adı 3-20 karakter olmalı; harf, rakam, nokta ve alt çizgi kullanılabilir.');
  checkPassword(password);
  const email = cleanEmail(emailRaw);
  const s = getStore();
  if (await s.findByUsername(username)) throw new AuthError('Bu kullanıcı adı alınmış.', 409);
  if (await s.findByEmail(email)) throw new AuthError(EMAIL_TAKEN, 409);
  try {
    return await s.create({
      username,
      displayName: username.slice(0, 16),
      passwordHash: await hashPassword(password),
      avatar: null,
      avatarVersion: 0,
      radioFavorites: [],
      email,
      emailVerified: false,
      createdAt: new Date(),
    });
  } catch (err) {
    if (isDup(err)) throw new AuthError(dupIsEmail(err) ? EMAIL_TAKEN : 'Bu kullanıcı adı alınmış.', 409);
    throw err;
  }
}

// ---------- e-posta doğrulama ve şifre sıfırlama ----------

const TOKEN_TTL: Record<TokenKind, number> = { verify: 48 * 60 * 60_000, reset: 30 * 60_000 };

/** Tek kullanımlık link anahtarı üretir; veritabanında sadece özeti durur. */
export async function createEmailToken(user: User, kind: TokenKind): Promise<string> {
  if (!user.email) throw new AuthError('Hesabında e-posta yok.');
  const token = randomBytes(32).toString('base64url');
  await getStore().putToken({ tokenHash: sha256(token), userId: user.id, kind, email: user.email.toLowerCase(), expiresAt: new Date(Date.now() + TOKEN_TTL[kind]) });
  return token;
}

async function useToken(tokenRaw: unknown, kind: TokenKind): Promise<User> {
  const token = String(tokenRaw ?? '');
  const bad = new AuthError(kind === 'verify' ? 'Doğrulama linki geçersiz ya da süresi dolmuş.' : 'Şifre sıfırlama linki geçersiz ya da süresi dolmuş.', 400);
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw bad;
  const s = getStore();
  const t = await s.takeToken(sha256(token), kind);
  if (!t || t.expiresAt.getTime() < Date.now()) throw bad;
  const user = await s.findById(t.userId);
  // Link gönderildikten sonra e-posta değiştiyse eski adrese giden link işe yaramaz.
  if (!user || user.email?.toLowerCase() !== t.email) throw bad;
  return user;
}

export async function setEmail(userId: string, emailRaw: unknown): Promise<User> {
  const email = cleanEmail(emailRaw);
  const s = getStore();
  const current = await s.findById(userId);
  if (!current) throw new AuthError('Kullanıcı bulunamadı.', 404);
  if (current.email?.toLowerCase() === email.toLowerCase() && current.emailVerified) return current;
  const other = await s.findByEmail(email);
  if (other && other.id !== userId) throw new AuthError(EMAIL_TAKEN, 409);
  try {
    return (await s.update(userId, { email, emailVerified: false }))!;
  } catch (err) {
    if (isDup(err)) throw new AuthError(EMAIL_TAKEN, 409);
    throw err;
  }
}

export async function verifyEmail(tokenRaw: unknown): Promise<User> {
  const user = await useToken(tokenRaw, 'verify');
  return (await getStore().update(user.id, { emailVerified: true }))!;
}

export async function findUserByEmail(emailRaw: unknown): Promise<User | null> {
  const email = String(emailRaw ?? '').trim();
  if (!EMAIL_RE.test(email)) throw new AuthError('Geçerli bir e-posta adresi yaz.');
  return getStore().findByEmail(email);
}

/** Linkle yeni şifre belirler; diğer bütün oturumları kapatır. Link maile geldiği için e-posta da doğrulanmış olur. */
export async function resetPassword(tokenRaw: unknown, passwordRaw: unknown): Promise<User> {
  const password = String(passwordRaw ?? '');
  checkPassword(password);
  const user = await useToken(tokenRaw, 'reset');
  const s = getStore();
  const updated = (await s.update(user.id, { passwordHash: await hashPassword(password), emailVerified: true }))!;
  await s.deleteUserSessions(user.id);
  return updated;
}

export async function login(usernameRaw: unknown, passwordRaw: unknown) {
  const username = String(usernameRaw ?? '').trim();
  const password = String(passwordRaw ?? '');
  const user = await getStore().findByUsername(username);
  // Kullanıcı yoksa da aynı süreyi harcamak için sahte bir doğrulama yapılır.
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : (await hashPassword(password), false);
  if (!user || !ok) throw new AuthError('Kullanıcı adı ya da şifre hatalı.', 401);
  return user;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await getStore().createSession(userId, sha256(token), new Date(Date.now() + SESSION_MAX_AGE * 1000));
  return token;
}

export async function userFromToken(token: string | undefined): Promise<User | null> {
  if (!token || !store) return null;
  const s = await store.findSession(sha256(token));
  if (!s || s.expiresAt.getTime() < Date.now()) return null;
  return store.findById(s.userId);
}

export async function destroySession(token: string | undefined) {
  if (token && store) await store.deleteSession(sha256(token));
}

export async function findUserByUsername(username: string) {
  return store ? store.findByUsername(String(username ?? '').trim()) : null;
}

export async function findUser(id: string) {
  return store ? store.findById(id) : null;
}

const AVATAR_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function updateProfile(userId: string, body: { displayName?: unknown; avatar?: unknown }) {
  const s = getStore();
  const current = await s.findById(userId);
  if (!current) throw new AuthError('Kullanıcı bulunamadı.', 404);
  const patch: Partial<User> = {};
  if (body.displayName !== undefined) {
    const name = cleanDisplayName(body.displayName);
    if (!name) throw new AuthError('Görünen ad boş olamaz.');
    patch.displayName = name;
  }
  if (body.avatar === null) {
    patch.avatar = null;
    patch.avatarVersion = current.avatarVersion + 1;
  } else if (body.avatar !== undefined) {
    const m = AVATAR_RE.exec(String(body.avatar));
    if (!m) throw new AuthError('Profil fotoğrafı JPEG, PNG ya da WebP olmalı.');
    const data = Buffer.from(m[2], 'base64');
    if (data.length > 200 * 1024) throw new AuthError('Profil fotoğrafı çok büyük.');
    patch.avatar = { data, type: m[1] };
    patch.avatarVersion = current.avatarVersion + 1;
  }
  return (await s.update(userId, patch))!;
}

const STATION_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
export const MAX_RADIO_FAVORITES = 60;

/** İstasyonu favorilere ekler (on) ya da çıkarır; güncel listeyi döndürür. */
export async function setRadioFavorite(userId: string, stationId: string, on: boolean): Promise<string[]> {
  if (!STATION_ID_RE.test(stationId)) throw new AuthError('Geçersiz istasyon.');
  const s = getStore();
  const current = await s.findById(userId);
  if (!current) throw new AuthError('Kullanıcı bulunamadı.', 404);
  const list = current.radioFavorites.filter((id) => id !== stationId);
  if (on) {
    if (list.length >= MAX_RADIO_FAVORITES) throw new AuthError(`En fazla ${MAX_RADIO_FAVORITES} favori kanal eklenebilir.`);
    list.push(stationId);
  }
  const updated = await s.update(userId, { radioFavorites: list });
  return updated?.radioFavorites ?? list;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

// Arkadaşlıklar: istek gönderme, kabul/ret, listeleme, silme.
// Her çift için tek kayıt (a < b), status: pending | accepted. Mongo yoksa bellekte tutulur.
import type { Collection, Db } from 'mongodb';
import { AuthError } from './auth';

export interface Friendship {
  a: string;
  b: string;
  requester: string;
  status: 'pending' | 'accepted';
  createdAt: Date;
}

const MAX_FRIENDS = 100;
const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
export const otherOf = (f: Friendship, me: string) => (f.a === me ? f.b : f.a);

interface Store {
  list(userId: string): Promise<Friendship[]>;
  get(x: string, y: string): Promise<Friendship | null>;
  save(f: Friendship): Promise<void>;
  remove(x: string, y: string): Promise<void>;
}

class MemoryStore implements Store {
  private items: Friendship[] = [];
  async list(id: string) {
    return this.items.filter((f) => f.a === id || f.b === id);
  }
  async get(x: string, y: string) {
    const [a, b] = pair(x, y);
    return this.items.find((f) => f.a === a && f.b === b) ?? null;
  }
  async save(f: Friendship) {
    await this.remove(f.a, f.b);
    this.items.push(f);
  }
  async remove(x: string, y: string) {
    const [a, b] = pair(x, y);
    this.items = this.items.filter((f) => !(f.a === a && f.b === b));
  }
}

class MongoStore implements Store {
  constructor(private col: Collection<Friendship>) {}
  async init() {
    await this.col.createIndex({ a: 1, b: 1 }, { unique: true });
    await this.col.createIndex({ b: 1 });
  }
  async list(id: string) {
    return this.col.find({ $or: [{ a: id }, { b: id }] }, { projection: { _id: 0 } }).toArray();
  }
  async get(x: string, y: string) {
    const [a, b] = pair(x, y);
    return this.col.findOne({ a, b }, { projection: { _id: 0 } });
  }
  async save(f: Friendship) {
    await this.col.updateOne({ a: f.a, b: f.b }, { $set: f }, { upsert: true });
  }
  async remove(x: string, y: string) {
    const [a, b] = pair(x, y);
    await this.col.deleteOne({ a, b });
  }
}

let store: Store = new MemoryStore();

export async function initFriends(db: Db | null) {
  if (!db) return;
  const s = new MongoStore(db.collection<Friendship>('friendships'));
  await s.init();
  store = s;
}

export function listFriendships(userId: string) {
  return store.list(userId);
}

export async function areFriends(x: string, y: string) {
  return (await store.get(x, y))?.status === 'accepted';
}

/** İstek gönderir. Karşı taraf zaten istek göndermişse doğrudan arkadaş olunur. */
export async function requestFriend(from: string, to: string): Promise<'sent' | 'accepted'> {
  if (from === to) throw new AuthError('Kendini arkadaş olarak ekleyemezsin.');
  const existing = await store.get(from, to);
  if (existing?.status === 'accepted') throw new AuthError('Zaten arkadaşsınız.');
  if (existing?.status === 'pending') {
    if (existing.requester === from) throw new AuthError('İsteğin zaten gönderildi, cevap bekleniyor.');
    await store.save({ ...existing, status: 'accepted' });
    return 'accepted';
  }
  const mine = (await store.list(from)).filter((f) => f.status === 'accepted').length;
  if (mine >= MAX_FRIENDS) throw new AuthError(`En fazla ${MAX_FRIENDS} arkadaşın olabilir.`);
  const [a, b] = pair(from, to);
  await store.save({ a, b, requester: from, status: 'pending', createdAt: new Date() });
  return 'sent';
}

/** Gelen isteği kabul eder ya da reddeder. */
export async function respondFriend(me: string, other: string, accept: boolean) {
  const f = await store.get(me, other);
  if (!f || f.status !== 'pending' || f.requester === me) throw new AuthError('Böyle bir istek yok.', 404);
  if (accept) await store.save({ ...f, status: 'accepted' });
  else await store.remove(me, other);
}

/** Arkadaşlıktan çıkarır ya da gönderilen isteği geri çeker. */
export async function removeFriend(me: string, other: string) {
  await store.remove(me, other);
}

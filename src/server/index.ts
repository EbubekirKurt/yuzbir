// Yüzbir sunucusu: Express (hesap API'si + istemci dosyaları) + Socket.IO (oyun).
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { REACTIONS, type FriendInfo, type FriendsData, type GameAction, type Settings, type TableInvite } from '../shared/types';
import {
  AuthError,
  avatarUrl,
  createSession,
  destroySession,
  findUser,
  findUserByUsername,
  initAuth,
  login,
  parseCookies,
  publicUser,
  register,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  updateProfile,
  userFromToken,
  type User,
} from './auth';
import { connectDb, dbReady, loadTableSnapshots, recentGames } from './db';
import { startDiscordScheduler } from './discord';
import { radioCategories, streamSource } from './radio';
import { Readable } from 'node:stream';
import { areFriends, initFriends, listFriendships, otherOf, removeFriend, requestFriend, respondFriend } from './friends';
import { sanitizeSettings, Table, type TableSnapshot } from './tables';

try {
  process.loadEnvFile();
} catch {
  // .env yoksa ortam değişkenleri doğrudan kullanılır (ör. canlı sunucuda).
}

const PORT = Number(process.env.PORT) || 3001;
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, '../../dist/client');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '400kb' }));

const httpServer = createServer(app);
const io = new Server(httpServer);

interface PlayerInfo {
  playerId: string; // kullanıcı id
  name: string;
  avatar: string | null;
  socketId: string | null;
  tableId: string | null;
}

const players = new Map<string, PlayerInfo>();
const tables = new Map<string, Table>();

// ---------- hesap API'si ----------

type Handler = (req: Request, res: Response) => Promise<unknown>;
const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch((err) => {
    if (err instanceof AuthError) res.status(err.status).json({ error: err.message });
    else next(err);
  });
};

const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(req: Request) {
  const key = req.ip ?? 'x';
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return;
  }
  if (++a.count > 30) throw new AuthError('Çok fazla deneme yaptın. Birkaç dakika sonra tekrar dene.', 429);
}

const tokenOf = (req: Request) => parseCookies(req.headers.cookie)[SESSION_COOKIE];

async function requireUser(req: Request): Promise<User> {
  const user = await userFromToken(tokenOf(req));
  if (!user) throw new AuthError('Giriş yapmalısın.', 401);
  return user;
}

function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_MAX_AGE * 1000,
    path: '/',
  });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, db: dbReady() });
});

app.get(
  '/api/me',
  route(async (req, res) => {
    res.json(publicUser(await requireUser(req)));
  }),
);

app.post(
  '/api/register',
  route(async (req, res) => {
    rateLimit(req);
    const user = await register(req.body?.username, req.body?.password);
    setSessionCookie(req, res, await createSession(user.id));
    res.status(201).json(publicUser(user));
  }),
);

app.post(
  '/api/login',
  route(async (req, res) => {
    rateLimit(req);
    const user = await login(req.body?.username, req.body?.password);
    setSessionCookie(req, res, await createSession(user.id));
    res.json(publicUser(user));
  }),
);

app.post(
  '/api/logout',
  route(async (req, res) => {
    const user = await userFromToken(tokenOf(req));
    await destroySession(tokenOf(req));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    if (user) io.in(`user:${user.id}`).disconnectSockets(true);
    res.json({ ok: true });
  }),
);

app.put(
  '/api/profile',
  route(async (req, res) => {
    const user = await requireUser(req);
    const updated = await updateProfile(user.id, req.body ?? {});
    const p = players.get(updated.id);
    if (p) {
      p.name = updated.displayName;
      p.avatar = avatarUrl(updated);
      const t = p.tableId ? tables.get(p.tableId) : undefined;
      if (t) {
        t.updateProfile(p.playerId, p.name, p.avatar);
        broadcastTable(t);
      }
    }
    res.json(publicUser(updated));
  }),
);

app.get(
  '/api/avatar/:id',
  route(async (req, res) => {
    const u = await findUser(String(req.params.id));
    if (!u?.avatar) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', u.avatar.type);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.send(u.avatar.data);
  }),
);

app.get(
  '/api/tables/:id',
  route(async (req, res) => {
    await requireUser(req);
    const t = tables.get(String(req.params.id));
    if (!t) throw new AuthError('Masa bulunamadı. Masa kapanmış ya da link yanlış olabilir.', 404);
    res.json(t.peek());
  }),
);

// ---------- arkadaşlar ----------

async function friendInfo(userId: string): Promise<FriendInfo | null> {
  const u = await findUser(userId);
  if (!u) return null;
  const p = players.get(userId);
  const t = p?.tableId ? tables.get(p.tableId) : undefined;
  return {
    ...publicUser(u),
    online: !!p?.socketId,
    tableId: t?.id ?? null,
    tableName: t?.name ?? null,
    tableStatus: t?.status ?? null,
  };
}

/** Listesi değişen kullanıcılara haber verir (istemci listeyi yeniden çeker). */
const notifyFriends = (...ids: string[]) => ids.forEach((id) => io.to(`user:${id}`).emit('friends:update'));

/** Kullanıcının kabul edilmiş arkadaşlarına "durumum değişti" der (çevrimiçi/masa). */
async function notifyPresence(userId: string) {
  try {
    const list = await listFriendships(userId);
    notifyFriends(...list.filter((f) => f.status === 'accepted').map((f) => otherOf(f, userId)));
  } catch {
    // önemli değil: listeler zaten düzenli yenileniyor
  }
}

app.get(
  '/api/friends',
  route(async (req, res) => {
    const me = await requireUser(req);
    const data: FriendsData = { friends: [], incoming: [], outgoing: [] };
    for (const f of await listFriendships(me.id)) {
      const info = await friendInfo(otherOf(f, me.id));
      if (!info) continue;
      if (f.status === 'accepted') data.friends.push(info);
      else if (f.requester === me.id) data.outgoing.push(info);
      else data.incoming.push(info);
    }
    // Çevrimiçi olanlar önce, sonra ada göre
    data.friends.sort((a, b) => Number(b.online) - Number(a.online) || a.displayName.localeCompare(b.displayName, 'tr'));
    res.json(data);
  }),
);

app.post(
  '/api/friends/request',
  route(async (req, res) => {
    const me = await requireUser(req);
    rateLimit(req);
    const other = await findUserByUsername(String(req.body?.username ?? ''));
    if (!other) throw new AuthError('Bu kullanıcı adıyla bir oyuncu bulunamadı.', 404);
    const result = await requestFriend(me.id, other.id);
    notifyFriends(me.id, other.id);
    res.json({ result, user: publicUser(other) });
  }),
);

app.post(
  '/api/friends/respond',
  route(async (req, res) => {
    const me = await requireUser(req);
    const other = String(req.body?.userId ?? '');
    await respondFriend(me.id, other, !!req.body?.accept);
    notifyFriends(me.id, other);
    res.json({ ok: true });
  }),
);

app.delete(
  '/api/friends/:userId',
  route(async (req, res) => {
    const me = await requireUser(req);
    const other = String(req.params.userId);
    await removeFriend(me.id, other);
    notifyFriends(me.id, other);
    res.json({ ok: true });
  }),
);

app.get(
  '/api/radio',
  route(async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json(await radioCategories());
  }),
);

// Sadece HTTP yayını olan istasyonları HTTPS sitede çalabilmek için aktarır.
// Yalnızca listedeki istasyonlar; aynı anda en fazla 40 yayın.
let activeStreams = 0;
const MAX_STREAMS = 40;
app.get('/api/radio/stream/:id', async (req, res) => {
  const url = streamSource(String(req.params.id));
  if (!url) {
    res.status(404).end();
    return;
  }
  if (activeStreams >= MAX_STREAMS) {
    res.status(503).end();
    return;
  }
  const ac = new AbortController();
  req.on('close', () => ac.abort());
  try {
    const up = await fetch(url, {
      // Eski SHOUTcast sunucuları tarayıcı olmayan istemcilere HTTP yerine "ICY" yanıtı veriyor.
      headers: { 'User-Agent': 'Mozilla/5.0 (Yuzbir radio relay)' /* başlıkta sadece ASCII olabilir */, 'Icy-MetaData': '0' },
      signal: ac.signal,
      redirect: 'follow',
    });
    if (!up.ok || !up.body) {
      res.status(502).end();
      return;
    }
    activeStreams++;
    res.on('close', () => {
      activeStreams--;
      ac.abort();
    });
    res.setHeader('Content-Type', up.headers.get('content-type') ?? 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    Readable.fromWeb(up.body as never)
      .on('error', () => res.end())
      .pipe(res);
  } catch {
    if (!res.headersSent) res.status(502).end();
  }
});

app.get(
  '/api/history',
  route(async (req, res) => {
    const user = await requireUser(req);
    res.json(await recentGames(user.id));
  }),
);

if (existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get(/^\/(?!socket\.io|api\/).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

// ---------- oyun (Socket.IO) ----------

function broadcastTable(t: Table) {
  t.persistSoon();
  for (const pid of t.humanIds()) {
    const p = players.get(pid);
    if (p?.socketId && p.tableId === t.id) io.to(p.socketId).emit('table', t.viewFor(pid));
  }
}

function broadcastLobby() {
  io.to('lobby').emit('lobby', [...tables.values()].map((t) => t.lobbyInfo()));
}

const onTableChange = (tbl: Table) => {
  broadcastTable(tbl);
  broadcastLobby();
};

function createTable(name: string, settings: Settings, hostId: string) {
  const t = new Table(name, settings, hostId, onTableChange);
  tables.set(t.id, t);
  return t;
}

/** Sunucu açılırken kayıtlı masaları geri yükler; oyuncular yeniden bağlanınca koltuklarına döner. */
async function restoreTables() {
  const snaps = await loadTableSnapshots<TableSnapshot>();
  for (const s of snaps) {
    try {
      const t = Table.restore(s, onTableChange);
      tables.set(t.id, t);
      for (const seat of t.seats) {
        if (seat && !seat.isBot && seat.playerId) {
          players.set(seat.playerId, { playerId: seat.playerId, name: seat.name, avatar: seat.avatar, socketId: null, tableId: t.id });
        }
      }
      t.schedule();
    } catch (err) {
      console.error(`[masa] ${s.id} geri yüklenemedi:`, (err as Error).message);
    }
  }
  if (snaps.length) console.log(`[masa] ${tables.size} masa geri yüklendi.`);
}

// Render yeniden başlatmadan önce SIGTERM gönderir: son durumu kaydet.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[sunucu] ${signal} alındı, masalar kaydediliyor…`);
  await Promise.allSettled([...tables.values()].map((t) => t.persistNow()));
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

function leaveCurrentTable(p: PlayerInfo) {
  if (!p.tableId) return;
  const t = tables.get(p.tableId);
  p.tableId = null;
  if (!t) return;
  t.leave(p.playerId);
  if (t.humanIds().length === 0 || (!t.game && t.seats.every((s) => !s || s.isBot))) {
    t.dispose();
    tables.delete(t.id);
  } else {
    broadcastTable(t);
  }
}

/** Masadaki oyuncu, çevrimiçi arkadaşlarını masaya davet eder. Gönderilen davet sayısını döner. */
async function sendInvites(from: PlayerInfo, t: Table, raw: unknown): Promise<number> {
  if (t.seatOf(from.playerId) < 0) return 0;
  const ids = [...new Set(Array.isArray(raw) ? raw.map(String) : [])].slice(0, 10);
  let sent = 0;
  for (const id of ids) {
    const target = players.get(id);
    if (!target?.socketId || t.seatOf(id) >= 0) continue;
    if (!(await areFriends(from.playerId, id))) continue;
    const invite: TableInvite = {
      id: Date.now() + Math.random(),
      tableId: t.id,
      tableName: t.name,
      fromName: from.name,
      fromAvatar: from.avatar,
      settings: t.settings,
    };
    io.to(`user:${id}`).emit('invite', invite);
    sent++;
  }
  return sent;
}

function cleanTableName(raw: unknown, fallback: string) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 16);
  return s || fallback.slice(0, 16);
}

// Sadece giriş yapmış kullanıcılar bağlanabilir.
io.use(async (socket, next) => {
  try {
    const user = await userFromToken(parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE]);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket: Socket) => {
  const user = socket.data.user as User;
  const me: PlayerInfo = players.get(user.id) ?? {
    playerId: user.id,
    name: user.displayName,
    avatar: avatarUrl(user),
    socketId: null,
    tableId: null,
  };
  me.name = user.displayName;
  me.avatar = avatarUrl(user);
  me.socketId = socket.id;
  players.set(user.id, me);
  socket.join('lobby');
  socket.join(`user:${user.id}`);
  socket.emit('lobby', [...tables.values()].map((t) => t.lobbyInfo()));
  void notifyPresence(user.id);

  // Yeniden bağlanma: masadaki koltuğuna geri döner.
  const current = me.tableId ? tables.get(me.tableId) : undefined;
  if (current && current.seatOf(me.playerId) >= 0) {
    current.sit(me.playerId, me.name, me.avatar);
    current.schedule();
    broadcastTable(current);
  } else {
    me.tableId = null;
    socket.emit('table', null);
  }

  const toast = (msg: string) => socket.emit('toast', msg);

  socket.on('table:create', async (data: { name?: string; settings?: Partial<Settings>; invite?: string[] }) => {
    leaveCurrentTable(me);
    const t = createTable(cleanTableName(data?.name, `${me.name} masası`), sanitizeSettings(data?.settings), me.playerId);
    t.sit(me.playerId, me.name, me.avatar, 0);
    me.tableId = t.id;
    broadcastTable(t);
    broadcastLobby();
    void notifyPresence(me.playerId);
    if (data?.invite?.length) {
      const n = await sendInvites(me, t, data.invite);
      toast(n ? `${n} arkadaşına davet gönderildi.` : 'Davet edilecek çevrimiçi arkadaş bulunamadı.');
    }
  });

  socket.on('table:invite', async (data: { userIds?: string[] }) => {
    const t = me.tableId ? tables.get(me.tableId) : undefined;
    if (!t) return toast('Önce bir masada olmalısın.');
    if (t.tooFast(`inv:${me.playerId}`, 1500)) return toast('Biraz bekle, davetler çok hızlı gidiyor.');
    const n = await sendInvites(me, t, data?.userIds);
    toast(n ? 'Davet gönderildi.' : 'Davet gönderilemedi: arkadaşın çevrimdışı ya da zaten masada.');
  });

  socket.on('table:join', (data: { tableId?: string; seat?: number }) => {
    const t = tables.get(String(data?.tableId ?? ''));
    if (!t) return toast('Masa bulunamadı.');
    if (me.tableId && me.tableId !== t.id) leaveCurrentTable(me);
    const err = t.sit(me.playerId, me.name, me.avatar, typeof data?.seat === 'number' ? data.seat : undefined);
    if (err) return toast(err);
    me.tableId = t.id;
    broadcastTable(t);
    broadcastLobby();
  });

  socket.on('table:leave', () => {
    leaveCurrentTable(me);
    socket.emit('table', null);
    broadcastLobby();
  });

  socket.on('table:bot', (data: { seat: number; add: boolean }) => {
    const t = me.tableId ? tables.get(me.tableId) : undefined;
    if (!t) return;
    const err = t.setBot(me.playerId, Number(data?.seat), !!data?.add);
    if (err) return toast(err);
    broadcastTable(t);
    broadcastLobby();
  });

  socket.on('table:start', () => {
    const t = me.tableId ? tables.get(me.tableId) : undefined;
    if (!t) return;
    const err = t.start(me.playerId);
    if (err) return toast(err);
    broadcastTable(t);
    broadcastLobby();
  });

  socket.on('table:restart', () => {
    const t = me.tableId ? tables.get(me.tableId) : undefined;
    if (!t) return;
    const err = t.restart(me.playerId);
    if (err) return toast(err);
    broadcastTable(t);
    broadcastLobby();
  });

  socket.on('game:action', (action: GameAction) => {
    const t = me.tableId ? tables.get(me.tableId) : undefined;
    if (!t) return;
    const err = t.act(me.playerId, action);
    if (err) toast(err);
    broadcastTable(t);
  });

  socket.on('table:chat', (data: { text?: string }) => {
    const t = me.tableId ? tables.get(me.tableId) : undefined;
    if (!t) return;
    const res = t.addChat(me.playerId, data?.text);
    if (typeof res === 'string') return toast(res);
    broadcastTable(t);
  });

  socket.on('table:react', (data: { emoji?: string }) => {
    const t = me.tableId ? tables.get(me.tableId) : undefined;
    const seat = t ? t.seatOf(me.playerId) : -1;
    if (!t || seat < 0) return;
    const emoji = String(data?.emoji ?? '');
    if (!(REACTIONS as readonly string[]).includes(emoji) || t.tooFast(`r:${me.playerId}`, 700)) return;
    // Tepkiler kaydedilmez; masadakilere anlık gönderilir.
    for (const pid of t.humanIds()) {
      const p = players.get(pid);
      if (p?.socketId && p.tableId === t.id) io.to(p.socketId).emit('table:react', { seat, emoji, id: Date.now() + Math.random() });
    }
  });

  socket.on('disconnect', () => {
    if (me.socketId !== socket.id) return;
    me.socketId = null;
    void notifyPresence(me.playerId);
    const t = me.tableId ? tables.get(me.tableId) : undefined;
    if (!t) return;
    const s = t.seatOf(me.playerId);
    if (s >= 0) {
      // Koltuk korunur; geri bağlanınca oyuncu yerine döner.
      t.seats[s]!.connected = false;
      if (t.game) t.schedule();
      broadcastTable(t);
      broadcastLobby();
    }
  });
});

// Herkesin ayrıldığı masaları temizle.
setInterval(() => {
  const now = Date.now();
  for (const t of tables.values()) {
    const anyone = t.seats.some((s) => s && !s.isBot && s.connected);
    if (anyone) {
      t.emptySince = null;
      continue;
    }
    t.emptySince ??= now;
    if (now - t.emptySince > 5 * 60_000) {
      t.dispose();
      tables.delete(t.id);
      broadcastLobby();
    }
  }
}, 30_000);

const db = await connectDb();
await initAuth(db, !!process.env.MONGODB_URI);
await initFriends(db);
await restoreTables();
void radioCategories(); // radyo listesini ve sağlık kontrolünü açılışta hazırla
startDiscordScheduler();
httpServer.listen(PORT, () => {
  console.log(`Yüzbir sunucusu http://localhost:${PORT} adresinde çalışıyor.`);
});

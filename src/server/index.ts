// Yüzbir sunucusu: Express (istemci dosyaları) + Socket.IO (oyun).
import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import type { GameAction, Settings } from '../shared/types';
import { connectDb, dbReady, recentGames, savePlayer } from './db';
import { sanitizeSettings, Table } from './tables';

try {
  process.loadEnvFile();
} catch {
  // .env yoksa ortam değişkenleri doğrudan kullanılır (ör. canlı sunucuda).
}

const PORT = Number(process.env.PORT) || 3001;
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, '../../dist/client');

const app = express();
app.get('/health', (_req, res) => {
  res.json({ ok: true, db: dbReady() });
});
if (existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get(/^\/(?!socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });

interface PlayerInfo {
  playerId: string;
  name: string;
  socketId: string | null;
  tableId: string | null;
}

const players = new Map<string, PlayerInfo>();
const tables = new Map<string, Table>();

function cleanName(raw: unknown): string {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 16);
  return s || 'Oyuncu';
}

function broadcastTable(t: Table) {
  for (const pid of t.humanIds()) {
    const p = players.get(pid);
    if (p?.socketId && p.tableId === t.id) io.to(p.socketId).emit('table', t.viewFor(pid));
  }
}

function broadcastLobby() {
  const list = [...tables.values()].map((t) => t.lobbyInfo());
  io.to('lobby').emit('lobby', list);
}

function createTable(name: string, settings: Settings, hostId: string) {
  const t = new Table(name, settings, hostId, (tbl) => {
    broadcastTable(tbl);
    broadcastLobby();
  });
  tables.set(t.id, t);
  return t;
}

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

io.on('connection', (socket: Socket) => {
  let me: PlayerInfo | null = null;
  const toast = (msg: string) => socket.emit('toast', msg);

  socket.on('hello', (data: { playerId?: string; name?: string }) => {
    const playerId = String(data?.playerId ?? '').slice(0, 64);
    if (!playerId) return;
    const name = cleanName(data?.name);
    me = players.get(playerId) ?? { playerId, name, socketId: null, tableId: null };
    me.name = name;
    me.socketId = socket.id;
    players.set(playerId, me);
    void savePlayer(playerId, name);
    socket.join('lobby');
    socket.emit('lobby', [...tables.values()].map((t) => t.lobbyInfo()));
    // Yeniden bağlanma: masadaki koltuğuna geri döner.
    const t = me.tableId ? tables.get(me.tableId) : undefined;
    if (t && t.seatOf(playerId) >= 0) {
      t.sit(playerId, name);
      t.schedule();
      broadcastTable(t);
    } else {
      me.tableId = null;
      socket.emit('table', null);
    }
  });

  socket.on('table:create', (data: { name?: string; settings?: Partial<Settings> }) => {
    if (!me) return;
    leaveCurrentTable(me);
    const t = createTable(cleanName(data?.name || `${me.name} masası`), sanitizeSettings(data?.settings), me.playerId);
    t.sit(me.playerId, me.name, 0);
    me.tableId = t.id;
    broadcastTable(t);
    broadcastLobby();
  });

  socket.on('table:join', (data: { tableId?: string; seat?: number }) => {
    if (!me) return;
    const t = tables.get(String(data?.tableId ?? ''));
    if (!t) return toast('Masa bulunamadı.');
    if (me.tableId && me.tableId !== t.id) leaveCurrentTable(me);
    const err = t.sit(me.playerId, me.name, typeof data?.seat === 'number' ? data.seat : undefined);
    if (err) return toast(err);
    me.tableId = t.id;
    broadcastTable(t);
    broadcastLobby();
  });

  socket.on('table:leave', () => {
    if (!me) return;
    leaveCurrentTable(me);
    socket.emit('table', null);
    broadcastLobby();
  });

  socket.on('table:bot', (data: { seat: number; add: boolean }) => {
    const t = me?.tableId ? tables.get(me.tableId) : undefined;
    if (!me || !t) return;
    const err = t.setBot(me.playerId, Number(data?.seat), !!data?.add);
    if (err) return toast(err);
    broadcastTable(t);
    broadcastLobby();
  });

  socket.on('table:start', () => {
    const t = me?.tableId ? tables.get(me.tableId) : undefined;
    if (!me || !t) return;
    const err = t.start(me.playerId);
    if (err) return toast(err);
    broadcastTable(t);
    broadcastLobby();
  });

  socket.on('table:restart', () => {
    const t = me?.tableId ? tables.get(me.tableId) : undefined;
    if (!me || !t) return;
    const err = t.restart(me.playerId);
    if (err) return toast(err);
    broadcastTable(t);
    broadcastLobby();
  });

  socket.on('game:action', (action: GameAction) => {
    const t = me?.tableId ? tables.get(me.tableId) : undefined;
    if (!me || !t) return;
    const err = t.act(me.playerId, action);
    if (err) toast(err);
    broadcastTable(t);
  });

  socket.on('history', async () => {
    if (!me) return;
    socket.emit('history', await recentGames(me.playerId));
  });

  socket.on('disconnect', () => {
    if (!me || me.socketId !== socket.id) return;
    me.socketId = null;
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

await connectDb();
httpServer.listen(PORT, () => {
  console.log(`Yüzbir sunucusu http://localhost:${PORT} adresinde çalışıyor.`);
});

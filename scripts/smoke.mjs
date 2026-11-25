// Hızlı uçtan uca deneme: 1 oyuncu + 3 bot ile masa kurar, oyuncu her tur çekip atar.
// Kullanım: önce sunucuyu başlat, sonra `node scripts/smoke.mjs [url]`
import { io } from 'socket.io-client';

const url = process.argv[2] ?? 'http://localhost:3001';
const socket = io(url, { transports: ['websocket'] });
const started = Date.now();
let seenHands = 0;
let acted = '';

socket.on('connect', () => {
  socket.emit('hello', { playerId: 'smoke-' + Date.now(), name: 'Deneme' });
  socket.emit('table:create', { name: 'Smoke', settings: { mode: 'tekli', katlamali: true, hands: 5, turnSeconds: 30 } });
});

socket.on('toast', (m) => console.log('[toast]', m));

socket.on('table', (t) => {
  if (!t) return;
  if (t.status === 'waiting') {
    const empty = t.seats.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
    if (empty.length) empty.forEach((seat) => socket.emit('table:bot', { seat, add: true }));
    else socket.emit('table:start');
    return;
  }
  const g = t.game;
  if (!g) return;
  if (g.history.length > seenHands) {
    seenHands = g.history.length;
    const h = g.history[seenHands - 1];
    console.log(`El ${h.handNo} bitti (${h.finishLabel}):`, h.rows.map((r) => `${g.players[r.seat].name}=${r.total}`).join(', '));
    if (seenHands >= 2) {
      console.log('Toplam:', g.totals.join(', '), `· ${((Date.now() - started) / 1000).toFixed(0)} sn`);
      process.exit(0);
    }
  }
  if (g.turn !== g.you) return;
  const key = `${g.handNo}:${g.phase}:${g.hand.length}:${g.deckCount}`;
  if (key === acted) return;
  acted = key;
  if (g.phase === 'draw') socket.emit('game:action', { type: 'draw' });
  else if (g.phase === 'play') socket.emit('game:action', { type: 'discard', tileId: g.hand[0].id });
});

setTimeout(() => {
  console.error('Zaman aşımı: 2 el 120 sn içinde bitmedi.');
  process.exit(1);
}, 120_000);

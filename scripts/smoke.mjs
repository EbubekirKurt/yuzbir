// Hızlı uçtan uca deneme: hesap açar, 1 oyuncu + 3 bot ile masa kurar, oyuncu her tur çekip atar.
// Kullanım: önce sunucuyu başlat, sonra `node scripts/smoke.mjs [url] [--full]`
// --full: 5 elin hepsini oynar (oyun sonu kaydı ve Discord gönderimini de dener).
import { io } from 'socket.io-client';

const full = process.argv.includes('--full');
const url = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:3001';
const username = 'deneme_' + Date.now().toString(36);
const res = await fetch(`${url}/api/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password: 'deneme123' }),
});
if (!res.ok) {
  console.error('Kayıt başarısız:', res.status, await res.text());
  process.exit(1);
}
const cookie = res.headers.get('set-cookie').split(';')[0];
console.log('Hesap açıldı:', username);

const socket = io(url, { transports: ['websocket'], extraHeaders: { cookie } });
const started = Date.now();
let seenHands = 0;
let acted = '';
let setup = false;

socket.on('connect_error', (e) => {
  console.error('Bağlantı hatası:', e.message);
  process.exit(1);
});
socket.on('connect', () => {
  socket.emit('table:create', { name: 'Smoke', settings: { mode: 'tekli', katlamali: true, hands: 5, turnSeconds: 30 } });
});
socket.on('toast', (m) => console.log('[toast]', m));

socket.on('table', (t) => {
  if (!t) return;
  if (t.status === 'waiting') {
    if (setup) return;
    setup = true;
    [1, 2, 3].forEach((seat) => socket.emit('table:bot', { seat, add: true }));
    setTimeout(() => socket.emit('table:start'), 300);
    return;
  }
  const g = t.game;
  if (!g) return;
  if (g.history.length > seenHands) {
    seenHands = g.history.length;
    const h = g.history[seenHands - 1];
    console.log(`El ${h.handNo} bitti (${h.finishLabel}):`, h.rows.map((r) => `${g.players[r.seat].name}=${r.total}`).join(', '));
    if (full ? g.phase === 'gameOver' : seenHands >= 2) {
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
  console.error('Zaman aşımı: oyun beklenen sürede bitmedi.');
  process.exit(1);
}, full ? 400_000 : 120_000);

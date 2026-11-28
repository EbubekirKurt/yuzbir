// Örnek bir masa sonucunu Discord'a gönderir (ayarlar .env'den okunur).
// Kullanım: npm run discord:test
// Ayar yoksa gönderilecek mesajı ekrana yazar.
import { buildResultMessage, discordConfigured, postGameResult, type GameSummary } from '../src/server/discord';
import type { HandResult, HandRow } from '../src/shared/types';

try {
  process.loadEnvFile();
} catch {
  // .env yoksa ortam değişkenleri kullanılır
}

const row = (seat: number, status: HandRow['status'], total: number, extra: Partial<HandRow> = {}): HandRow => ({
  seat,
  status,
  openKind: status === 'acmadi' ? null : 'seri',
  openValue: status === 'acmadi' ? 0 : 112,
  remaining: status === 'bitti' ? null : 20,
  kat: 1,
  base: total,
  penalties: [],
  baraj: false,
  total,
  ...extra,
});

const history: HandResult[] = [
  { handNo: 1, finisher: 1, finishLabel: 'Normal bitiş', k: 1, okeyName: 'sarı 3', rows: [row(0, 'acti', 34), row(1, 'bitti', -101), row(2, 'acti', 108, { penalties: [{ amount: 101, reason: 'İşlek attı' }] }), row(3, 'acmadi', 202)] },
  { handNo: 2, finisher: 0, finishLabel: 'Okeyle bitiş', k: 1, okeyName: 'mavi 11', rows: [row(0, 'bitti', -202, { baraj: true }), row(1, 'acti', 136), row(2, 'acti', 31), row(3, 'acmadi', 202)] },
  { handNo: 3, finisher: 2, finishLabel: 'Çiftle bitiş', k: 2, okeyName: 'kırmızı 8', rows: [row(0, 'acti', 52), row(1, 'acti', 18), row(2, 'bitti', -202), row(3, 'acmadi', 404)] },
];
const totals = [0, 1, 2, 3].map((s) => history.reduce((a, h) => a + h.rows[s].total, 0));

const summary: GameSummary = {
  tableName: 'Deneme',
  settings: { mode: 'tekli', katlamali: true, esKatlama: false, hands: 3, turnSeconds: 45 },
  players: [
    { name: 'Ebubekir', isBot: false },
    { name: 'Ayşe', isBot: false },
    { name: 'Mert', isBot: false },
    { name: 'Bot 1', isBot: true },
  ],
  history,
  totals,
  startedAt: new Date(Date.now() - 38 * 60000),
  finishedAt: new Date(),
};

if (!discordConfigured()) {
  console.log('Discord ayarı yok (DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID ya da DISCORD_WEBHOOK_URL). Gönderilecek mesaj:\n');
  console.log(JSON.stringify(buildResultMessage(summary, process.env.SITE_URL), null, 2));
} else {
  const res = await postGameResult(summary);
  if (!res.ok) process.exitCode = 1;
}

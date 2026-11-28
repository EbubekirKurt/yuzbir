// TEK SEFERLİK: veritabanındaki bütün biten oyunları (eskiden yeniye) Discord'a yeniden gönderir.
// Aynı oyunun kopya kayıtları (eski bir hata yüzünden) tek oyun sayılır ve bir kez gönderilir.
// Kullanım: npm run discord:resend            -> sadece listeler (deneme)
//           npm run discord:resend -- --gonder -> gerçekten gönderir
import { MongoClient, type ObjectId } from 'mongodb';
import { discordConfigured, postGameResult } from '../src/server/discord';
import type { SavedGame } from '../src/server/db';

try {
  process.loadEnvFile();
} catch {
  // .env yoksa ortam değişkenleri kullanılır
}

const send = process.argv.includes('--gonder');
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI yok.');
if (send && !discordConfigured()) throw new Error('Discord ayarı yok.');

const client = new MongoClient(uri);
await client.connect();
const games = client.db(process.env.MONGODB_DB || 'yuzbir').collection<SavedGame & { _id: ObjectId }>('games');
const all = await games.find().sort({ finishedAt: 1 }).toArray();

// Kopyaları grupla: aynı masa, aynı toplamlar, 5 dakika içinde bitmiş.
const groups: (SavedGame & { _id: ObjectId })[][] = [];
for (const g of all) {
  const same = groups.find(
    (gr) =>
      gr[0].tableId === g.tableId &&
      JSON.stringify(gr[0].totals) === JSON.stringify(g.totals) &&
      Math.abs(gr[0].finishedAt.getTime() - g.finishedAt.getTime()) < 5 * 60_000,
  );
  if (same) same.push(g);
  else groups.push([g]);
}
console.log(`${all.length} kayıt, ${groups.length} farklı oyun.`);

for (const gr of groups) {
  const g = gr[0];
  const label = `${g.finishedAt.toISOString().slice(0, 16)} · ${g.tableName} · ${g.settings.mode} · [${g.totals.join(', ')}]${gr.length > 1 ? ` (${gr.length} kopya)` : ''}`;
  if (!send) {
    console.log('  gönderilecek:', label);
    continue;
  }
  const ids = gr.map((x) => x._id);
  // Zamanlayıcı aynı anda göndermesin diye önce "gönderildi" işaretle.
  await games.updateMany({ _id: { $in: ids } }, { $set: { discordPostedAt: new Date() } });
  const res = await postGameResult({
    tableName: g.tableName,
    settings: g.settings,
    players: g.players.map((p) => ({ name: p.name, isBot: p.isBot })),
    history: g.history,
    totals: g.totals,
    startedAt: g.startedAt ?? null,
    finishedAt: g.finishedAt,
  });
  if (!res.ok) {
    await games.updateMany({ _id: { $in: ids } }, { $set: { discordPostedAt: null, discordLastError: res.error } });
    console.log('  HATA:', label, res.error);
  } else {
    console.log('  gönderildi:', label);
  }
  await new Promise((r) => setTimeout(r, 1500)); // Discord hız sınırına takılmamak için
}
await client.close();

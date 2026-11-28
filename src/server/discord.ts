// Masa bitince sonuçları Discord'a gönderir.
// İki yol: DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID (bot) ya da DISCORD_WEBHOOK_URL (webhook).
// İkisi de yoksa hiçbir şey gönderilmez.
import type { HandResult, Settings } from '../shared/types';
import { dbReady, markDiscordResult, pendingDiscordGames, type SavedGame } from './db';
import { renderResultImage } from './resultImage';

const IMAGE_NAME = 'puan-tablosu.png';

export interface GameSummary {
  tableName: string;
  settings: Settings;
  players: { name: string; isBot: boolean }[];
  history: HandResult[];
  totals: number[];
  startedAt: Date | null;
  finishedAt: Date;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const COLOR_WIN = 0xffb23f;

/** Discord markdown karakterlerini kaçışlar (isimler kalın yazı vb. bozmasın). */
function esc(s: string) {
  return s.replace(/([\\*_`~|>])/g, '\\$1');
}

function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

function ranks(totals: number[]) {
  return totals.map((t) => totals.filter((x) => x < t).length + 1);
}

function duration(start: Date | null, end: Date) {
  if (!start) return null;
  const min = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  return min >= 60 ? `${Math.floor(min / 60)} sa ${min % 60} dk` : `${min} dk`;
}

/** Kod bloğunda hizalı el el puan tablosu. */
function scoreTable(s: GameSummary): string {
  const nameW = Math.min(10, Math.max(6, ...s.players.map((p) => p.name.length)));
  const cell = 5;
  const pad = (v: string, w: number) => (v.length >= w ? v.slice(0, w) : ' '.repeat(w - v.length) + v);
  const padR = (v: string, w: number) => (v.length >= w ? v.slice(0, w) : v + ' '.repeat(w - v.length));
  const head = padR('Oyuncu', nameW) + s.history.map((h) => pad(`E${h.handNo}`, cell)).join('') + pad('Top', cell + 1);
  const lines = s.players.map(
    (p, seat) =>
      padR(p.name, nameW) +
      s.history.map((h) => pad(String(h.rows[seat].total), cell)).join('') +
      pad(String(s.totals[seat]), cell + 1),
  );
  return '```\n' + [head, '─'.repeat(head.length), ...lines].join('\n') + '\n```';
}

function highlights(s: GameSummary): string[] {
  const n = s.players.length;
  const finishes = Array(n).fill(0);
  const barajs = Array(n).fill(0);
  const penalties = Array(n).fill(0);
  let okeyFinishes = 0;
  let deckEnds = 0;
  for (const h of s.history) {
    if (h.finisher === null) deckEnds++;
    else finishes[h.finisher]++;
    if (/okey/i.test(h.finishLabel)) okeyFinishes++;
    for (const r of h.rows) {
      if (r.baraj) barajs[r.seat]++;
      penalties[r.seat] += r.penalties.reduce((a, p) => a + p.amount, 0);
    }
  }
  const best = (arr: number[]) => {
    const max = Math.max(...arr);
    return max > 0 ? { max, who: arr.flatMap((v, i) => (v === max ? [esc(s.players[i].name)] : [])).join(', ') } : null;
  };
  const out: string[] = [];
  const f = best(finishes);
  if (f) out.push(`🏁 En çok bitiren: **${f.who}** (${f.max} el)`);
  const b = best(barajs);
  if (b) out.push(`🧱 Baraj: **${b.who}** (${b.max} kez)`);
  const p = best(penalties);
  if (p) out.push(`💸 En çok ceza: **${p.who}** (+${p.max})`);
  if (okeyFinishes) out.push(`⭐ Okeyle biten el: ${okeyFinishes}`);
  if (deckEnds) out.push(`📦 Destesi biten el: ${deckEnds}`);
  return out;
}

/** Discord mesaj gövdesi (embed). Saf fonksiyon: test edilebilir. */
/** withImage: tablo resim olarak eklenir; metin alanlarında sadece sıralama ve öne çıkanlar kalır. */
export function buildResultMessage(s: GameSummary, siteUrl?: string, withImage = false) {
  const r = ranks(s.totals);
  const order = s.players.map((_, i) => i).sort((a, b) => s.totals[a] - s.totals[b]);
  const esli = s.settings.mode === 'esli';
  const settingsLine = [
    esli ? 'Eşli' : 'Tekli',
    s.settings.katlamali ? 'Katlamalı' : 'Katlamasız',
    `${s.history.length} el`,
    `${s.settings.turnSeconds} sn`,
    duration(s.startedAt, s.finishedAt),
  ]
    .filter(Boolean)
    .join(' · ');

  let winnerLine: string;
  const fields: { name: string; value: string; inline?: boolean }[] = [];
  if (esli) {
    const teamA = s.totals[0] + s.totals[2];
    const teamB = s.totals[1] + s.totals[3];
    const team = (t: number) => `${esc(s.players[t].name)} + ${esc(s.players[t + 2].name)}`;
    winnerLine =
      teamA === teamB
        ? `🤝 **Berabere!** İki takım da ${teamA} puan`
        : `🏆 Kazanan takım: **${team(teamA < teamB ? 0 : 1)}** (${Math.min(teamA, teamB)})`;
    fields.push({
      name: 'Takımlar',
      value: [0, 1]
        .map((t) => `${(t === 0 ? teamA : teamB) <= (t === 0 ? teamB : teamA) ? '🥇' : '🥈'} ${team(t)} — \`${t === 0 ? teamA : teamB}\``)
        .join('\n'),
    });
  } else {
    const winners = order.filter((i) => r[i] === 1);
    winnerLine =
      winners.length > 1
        ? `🤝 **Berabere:** ${winners.map((i) => esc(s.players[i].name)).join(', ')} (${s.totals[winners[0]]})`
        : `🏆 Kazanan: **${esc(s.players[winners[0]].name)}** (${s.totals[winners[0]]})`;
  }

  fields.unshift({
    name: 'Sıralama',
    value: order
      .map((i) => {
        const medal = MEDALS[r[i] - 1] ?? `\`${r[i]}.\``;
        const bot = s.players[i].isBot ? ' 🤖' : '';
        return `${medal} **${esc(s.players[i].name)}**${bot} — \`${s.totals[i]}\``;
      })
      .join('\n'),
  });
  if (!withImage) fields.push({ name: 'El el puanlar', value: scoreTable(s).slice(0, 1024) });
  const hl = highlights(s);
  if (hl.length) fields.push({ name: 'Öne çıkanlar', value: hl.join('\n').slice(0, 1024) });

  const embed: Record<string, unknown> = {
    author: { name: 'Yüzbir · 101 Okey' },
    title: `🀄 ${s.tableName} masası bitti`.slice(0, 256),
    description: `${winnerLine}\n${settingsLine}`,
    color: COLOR_WIN,
    fields,
    footer: { text: 'Puanı düşük olan önde' },
    timestamp: s.finishedAt.toISOString(),
  };
  if (siteUrl) embed.url = siteUrl;
  if (withImage) embed.image = { url: `attachment://${IMAGE_NAME}` };
  return { embeds: [embed], allowed_mentions: { parse: [] as string[] } };
}

/** JSON ya da (resim varsa) multipart/form-data olarak gönderir. */
async function post(url: string, headers: Record<string, string>, body: unknown, image: Buffer | null, retry = true): Promise<void> {
  let payload: BodyInit;
  const h = { ...headers };
  if (image) {
    const form = new FormData();
    form.append('payload_json', JSON.stringify(body));
    form.append('files[0]', new Blob([new Uint8Array(image)], { type: 'image/png' }), IMAGE_NAME);
    payload = form;
  } else {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method: 'POST', headers: h, body: payload, signal: AbortSignal.timeout(20_000) });
  if (res.status === 429 && retry) {
    const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
    await new Promise((r) => setTimeout(r, Math.min(10, data.retry_after ?? 2) * 1000));
    return post(url, headers, body, image, false);
  }
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export function discordConfigured() {
  return !!(process.env.DISCORD_WEBHOOK_URL || (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID));
}

export type SendResult = { ok: true } | { ok: false; error: string; skipped?: boolean };

/** Sonucu gönderir; hata fırlatmaz, sonucu döner. */
export async function postGameResult(s: GameSummary): Promise<SendResult> {
  const siteUrl = process.env.SITE_URL || undefined;
  const token = process.env.DISCORD_BOT_TOKEN;
  const channel = process.env.DISCORD_CHANNEL_ID;
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!(token && channel) && !webhook) {
    console.warn(`[discord] Ayar yok (DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID ya da DISCORD_WEBHOOK_URL); "${s.tableName}" sonucu gönderilmedi.`);
    return { ok: false, error: 'Discord ayarı yok', skipped: true };
  }
  // Tablo görüntüsü; üretilemezse mesaj metin tablosuyla gider.
  let image: Buffer | null = null;
  try {
    image = await renderResultImage(s);
  } catch (err) {
    console.error('[discord] puan tablosu görüntüsü üretilemedi, metin tablosu gönderilecek:', (err as Error).message);
  }
  const message = buildResultMessage(s, siteUrl, !!image);
  try {
    if (token && channel) {
      const components = siteUrl
        ? [{ type: 1, components: [{ type: 2, style: 5, label: 'Yeni masa kur', url: siteUrl }] }]
        : undefined;
      await post(`https://discord.com/api/v10/channels/${channel}/messages`, { Authorization: `Bot ${token}` }, { ...message, components }, image);
    } else {
      await post(webhook!, {}, { ...message, username: 'Yüzbir' }, image);
    }
    console.log(`[discord] "${s.tableName}" sonucu gönderildi.`);
    return { ok: true };
  } catch (err) {
    const error = (err as Error).message;
    console.error(`[discord] "${s.tableName}" sonucu gönderilemedi:`, error);
    return { ok: false, error };
  }
}

// ---------- gönderim kuyruğu ve zamanlayıcı ----------

/** Veritabanı yokken gönderilemeyen sonuçlar (sunucu yeniden başlarsa kaybolur). */
const memoryQueue: { summary: GameSummary; attempts: number }[] = [];

function summaryFromSaved(g: SavedGame): GameSummary {
  return {
    tableName: g.tableName,
    settings: g.settings,
    players: g.players.map((p) => ({ name: p.name, isBot: p.isBot })),
    history: g.history,
    totals: g.totals,
    startedAt: g.startedAt ?? null,
    finishedAt: g.finishedAt,
  };
}

/** Oyun bitince: hemen gönder, olmazsa kuyrukta kalsın (zamanlayıcı yeniden dener). */
export async function sendOrQueue(summary: GameSummary, savedId: import('mongodb').ObjectId | null) {
  const res = await postGameResult(summary);
  if (savedId) await markDiscordResult(savedId, res.ok, res.ok ? undefined : res.error);
  else if (!res.ok && !dbReady()) memoryQueue.push({ summary, attempts: 1 });
}

let running = false;

export async function flushDiscordQueue() {
  if (running || !discordConfigured()) return;
  running = true;
  try {
    for (const g of await pendingDiscordGames()) {
      const res = await postGameResult(summaryFromSaved(g));
      await markDiscordResult(g._id as unknown as import('mongodb').ObjectId, res.ok, res.ok ? undefined : res.error);
    }
    for (let i = memoryQueue.length - 1; i >= 0; i--) {
      const item = memoryQueue[i];
      const res = await postGameResult(item.summary);
      if (res.ok || ++item.attempts >= 20) memoryQueue.splice(i, 1);
    }
  } catch (err) {
    console.error('[discord] kuyruk işlenemedi:', (err as Error).message);
  } finally {
    running = false;
  }
}

/** Belirli aralıklarla gönderilmemiş sonuçları yeniden dener (varsayılan 5 dakika). */
export function startDiscordScheduler() {
  const minutes = Math.min(60, Math.max(1, Number(process.env.DISCORD_RETRY_MINUTES) || 5));
  if (!discordConfigured()) {
    console.warn('[discord] Ayar yok: masa sonuçları Discord\'a gönderilmeyecek. (DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID ya da DISCORD_WEBHOOK_URL)');
  } else {
    console.log(`[discord] Sonuç gönderimi açık; gönderilemeyenler ${minutes} dakikada bir yeniden denenecek.`);
  }
  setTimeout(() => void flushDiscordQueue(), 15_000); // açılışta bekleyenleri gönder
  setInterval(() => void flushDiscordQueue(), minutes * 60_000);
}

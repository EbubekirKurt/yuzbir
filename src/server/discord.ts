// Masa bitince sonuçları Discord'a gönderir.
// İki yol: DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID (bot) ya da DISCORD_WEBHOOK_URL (webhook).
// İkisi de yoksa hiçbir şey gönderilmez.
import type { HandResult, Settings } from '../shared/types';

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
export function buildResultMessage(s: GameSummary, siteUrl?: string) {
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
  fields.push({ name: 'El el puanlar', value: scoreTable(s).slice(0, 1024) });
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
  return { embeds: [embed], allowed_mentions: { parse: [] as string[] } };
}

async function post(url: string, headers: Record<string, string>, body: unknown, retry = true): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429 && retry) {
    const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
    await new Promise((r) => setTimeout(r, Math.min(10, data.retry_after ?? 2) * 1000));
    return post(url, headers, body, false);
  }
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export function discordConfigured() {
  return !!(process.env.DISCORD_WEBHOOK_URL || (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID));
}

export async function postGameResult(s: GameSummary): Promise<void> {
  const siteUrl = process.env.SITE_URL || undefined;
  const message = buildResultMessage(s, siteUrl);
  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    const channel = process.env.DISCORD_CHANNEL_ID;
    if (token && channel) {
      const components = siteUrl
        ? [{ type: 1, components: [{ type: 2, style: 5, label: 'Yeni masa kur', url: siteUrl }] }]
        : undefined;
      await post(`https://discord.com/api/v10/channels/${channel}/messages`, { Authorization: `Bot ${token}` }, { ...message, components });
    } else if (process.env.DISCORD_WEBHOOK_URL) {
      await post(process.env.DISCORD_WEBHOOK_URL, {}, { ...message, username: 'Yüzbir' });
    } else {
      return;
    }
    console.log(`[discord] "${s.tableName}" sonucu gönderildi.`);
  } catch (err) {
    console.error('[discord] sonuç gönderilemedi:', (err as Error).message);
  }
}

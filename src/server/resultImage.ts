// Oyun sonu puan tablosunu oyundaki "Puan Tablosu" penceresinin görünümüyle PNG olarak çizer.
// satori: düzeni SVG'ye çevirir; resvg: SVG'yi PNG'ye çevirir. Koyu tema renkleri kullanılır.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import satori from 'satori';
import type { GameSummary } from './discord';

const C = {
  outline: '#0d0907',
  panel: '#2b2431',
  surface: '#3a3142',
  sand: '#44394d',
  line: '#4d4157',
  wood: '#6e4322',
  text: '#f3e7d3',
  soft: '#c4b29a',
  label: '#f2b679',
  chip: '#ffe7a8',
  win: '#2f4a33',
  good: '#bdebb0',
  ink: '#3b2a1a',
};
const RANK_BG = ['#FFD23F', '#E3E3E3', '#F0B98A', '#F1E4CF'];
const TEAM_COLOR = ['#FFB23F', '#7FB8FF']; // takım şeritleri
const WIDTH = 1280;
const NUNITO = "'Nunito', 'Nunito Ext'";
const BALOO = "'Baloo 2', 'Baloo 2 Ext', 'Nunito Ext'";

type Node = { type: string; props: Record<string, unknown> };
/** Küçük JSX yerine geçen yardımcı: satori'nin beklediği eleman nesnesini üretir. */
function h(type: string, style: Record<string, unknown>, ...children: (Node | string | number | null | false)[]): Node {
  const kids = children.filter((c) => c !== null && c !== false).map((c) => (typeof c === 'number' ? String(c) : c));
  return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}

let fontCache: { name: string; data: Buffer; weight: 700 | 800 | 900; style: 'normal' }[] | null = null;

function fonts() {
  if (fontCache) return fontCache;
  const req = createRequire(import.meta.url);
  const dir = (pkg: string) => {
    try {
      return path.join(path.dirname(req.resolve(`${pkg}/package.json`)), 'files');
    } catch {
      return path.join(process.cwd(), 'node_modules', pkg, 'files');
    }
  };
  const load = (pkg: string, name: string, file: string, weight: 700 | 800 | 900) =>
    ['latin', 'latin-ext'].map((subset) => ({
      // Türkçe harfler (ş, ğ, İ...) latin-ext dosyasında; ayrı adla yüklenip yedek yazı tipi olarak kullanılır.
      name: subset === 'latin' ? name : `${name} Ext`,
      data: readFileSync(path.join(dir(pkg), `${file}-${subset}-${weight}-normal.woff`)),
      weight,
      style: 'normal' as const,
    }));
  fontCache = [
    ...load('@fontsource/baloo-2', 'Baloo 2', 'baloo-2', 800),
    ...load('@fontsource/nunito', 'Nunito', 'nunito', 700),
    ...load('@fontsource/nunito', 'Nunito', 'nunito', 800),
    ...load('@fontsource/nunito', 'Nunito', 'nunito', 900),
  ];
  return fontCache;
}

function ranks(totals: number[]) {
  return totals.map((t) => totals.filter((x) => x < t).length + 1);
}

export function winnerText(s: GameSummary): string {
  if (s.settings.mode === 'esli') {
    const a = s.totals[0] + s.totals[2];
    const b = s.totals[1] + s.totals[3];
    if (a === b) return 'berabere';
    const t = a < b ? 0 : 1;
    return `${s.players[t].name} + ${s.players[t + 2].name}`;
  }
  const r = ranks(s.totals);
  const winners = s.players.filter((_, i) => r[i] === 1).map((p) => p.name);
  return winners.length > 1 ? `berabere (${winners.join(', ')})` : winners[0];
}

function layout(s: GameSummary): { tree: Node; height: number } {
  const r = ranks(s.totals);
  const hands = Math.max(s.settings.hands, s.history.length);
  const esli = s.settings.mode === 'esli';
  const meta = [
    esli ? 'Eşli' : 'Tekli',
    s.settings.katlamali ? 'Katlamalı' : 'Katlamasız',
    `${hands} el`,
  ].join(' · ');
  const date = s.finishedAt.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Istanbul' });

  // Eşli oyunda: oyuncular takım takım sıralanır, kazanan takımın satırları yeşil,
  // sıra rozeti takımın sırasını gösterir.
  const teamTotal = [s.totals[0] + (s.totals[2] ?? 0), s.totals[1] + (s.totals[3] ?? 0)];
  const teamRank = [teamTotal[0] <= teamTotal[1] ? 1 : 2, teamTotal[1] <= teamTotal[0] ? 1 : 2];
  // Kazanan takım üstte.
  const seats = esli ? (teamRank[0] <= teamRank[1] ? [0, 2, 1, 3] : [1, 3, 0, 2]) : s.players.map((_, i) => i);
  const rankOf = (seat: number) => (esli ? teamRank[seat % 2] : r[seat]);
  const badge = (n: number, size = 42) =>
    h(
      'div',
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        border: `3px solid ${C.outline}`,
        background: RANK_BG[n - 1] ?? RANK_BG[3],
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: BALOO,
        fontSize: 21,
        color: C.ink,
      },
      n,
    );
  const stripe = (team: number) => h('div', { width: 8, height: 30, borderRadius: 4, background: TEAM_COLOR[team], marginRight: 12, flexShrink: 0 }, '');

  const NAME_W = 210;
  const TOTAL_W = 140;
  const RANK_W = 100;
  const cell = { flex: 1, justifyContent: 'flex-end' };
  const row = (bg: string, top: boolean, minHeight: number) => ({
    alignItems: 'center',
    padding: '0 18px',
    minHeight,
    background: bg,
    borderTop: top ? `2px solid ${C.line}` : 'none',
  });

  const head = h(
    'div',
    { ...row(C.sand, false, 46), fontFamily: NUNITO, fontWeight: 900, fontSize: 14, letterSpacing: 1, color: C.label },
    h('div', { width: NAME_W }, 'OYUNCU'),
    ...Array.from({ length: hands }, (_, i) => h('div', cell, `EL ${i + 1}`)),
    h('div', { width: TOTAL_W, justifyContent: 'flex-end' }, 'TOPLAM'),
    h('div', { width: RANK_W, justifyContent: 'center' }, esli ? 'TAKIM' : 'SIRA'),
  );

  const rows = seats.map((seat, idx) => {
    const p = s.players[seat];
    const groupStart = esli && idx === 2; // ikinci takımın ilk satırı
    return h(
      'div',
      {
        ...row(rankOf(seat) === 1 ? C.win : C.surface, true, 60),
        ...(groupStart ? { borderTop: `4px solid ${C.outline}` } : {}),
        fontFamily: NUNITO,
        fontWeight: 800,
        fontSize: 18,
        color: C.text,
      },
      h(
        'div',
        { width: NAME_W, fontWeight: 900, overflow: 'hidden', alignItems: 'center' },
        esli ? stripe(seat % 2) : null,
        p.isBot && !/^bot\b/i.test(p.name) ? `${p.name} (bot)` : p.name,
      ),
      ...Array.from({ length: hands }, (_, i) => {
        const hand = s.history[i];
        return h('div', { ...cell, color: hand ? C.text : C.soft }, hand ? hand.rows[seat].total : '—');
      }),
      h('div', { width: TOTAL_W, justifyContent: 'flex-end', fontFamily: BALOO, fontSize: 28 }, s.totals[seat]),
      h('div', { width: RANK_W, justifyContent: 'center' }, badge(rankOf(seat))),
    );
  });

  const table = h(
    'div',
    { flexDirection: 'column', border: `3px solid ${C.outline}`, borderRadius: 18, overflow: 'hidden', background: C.surface },
    head,
    ...rows,
  );

  const teams = esli
    ? h(
        'div',
        { flexDirection: 'column', border: `3px solid ${C.outline}`, borderRadius: 18, overflow: 'hidden', background: C.surface },
        ...[0, 1]
          .sort((a, b) => teamTotal[a] - teamTotal[b])
          .map((t, i) =>
            h(
              'div',
              { ...row(teamRank[t] === 1 ? C.win : C.surface, i === 1, 58), fontFamily: NUNITO, fontWeight: 900, fontSize: 19, color: C.text },
              h('div', { flex: 1, alignItems: 'center' }, stripe(t), `Takım: ${s.players[t].name} + ${s.players[t + 2].name}`),
              h('div', { width: TOTAL_W, justifyContent: 'flex-end', fontFamily: BALOO, fontSize: 28 }, teamTotal[t]),
              h('div', { width: RANK_W, justifyContent: 'center' }, badge(teamRank[t])),
            ),
          ),
      )
    : null;

  const bannerText = winnerText(s).startsWith('berabere')
    ? `Oyun bitti! Sonuç: ${winnerText(s)}`
    : `Oyun bitti! ${esli ? 'Kazanan takım' : 'Kazanan'}: ${winnerText(s)}`;

  const height = 82 + 24 + 66 + 16 + 52 + 3 * 2 + s.players.length * 62 + (esli ? 16 + 2 * 60 + 6 + 2 : 0) + 16 + 22 + 26;

  const tree = h(
    'div',
    {
      width: WIDTH,
      height,
      flexDirection: 'column',
      background: C.panel,
      border: `4px solid ${C.outline}`,
      borderRadius: 28,
      overflow: 'hidden',
    },
    h(
      'div',
      { height: 78, flexShrink: 0, background: C.wood, borderBottom: `4px solid ${C.outline}`, alignItems: 'center', padding: '0 32px', gap: 18 },
      h('div', { fontFamily: BALOO, fontSize: 32, color: '#fff' }, 'Puan Tablosu'),
      h('div', { fontFamily: NUNITO, fontWeight: 800, fontSize: 17, color: C.chip }, meta),
      h('div', { marginLeft: 'auto', fontFamily: NUNITO, fontWeight: 800, fontSize: 17, color: C.chip }, `${s.tableName} · ${date}`),
    ),
    h(
      'div',
      { flexDirection: 'column', gap: 16, padding: '24px 32px 26px', flexGrow: 1 },
      h(
        'div',
        { background: C.good, border: `3px solid ${C.outline}`, borderRadius: 18, padding: '14px 20px', fontFamily: BALOO, fontSize: 26, color: C.ink },
        bannerText,
      ),
      table,
      teams,
      h('div', { marginTop: 'auto', fontFamily: NUNITO, fontWeight: 700, fontSize: 15, color: C.soft }, 'Puanı düşük olan önde · Yüzbir · 101 Okey'),
    ),
  );
  return { tree, height };
}

/** Oyun sonu tablosunun PNG görüntüsü (1.5x çözünürlük). */
export async function renderResultImage(s: GameSummary): Promise<Buffer> {
  const { tree, height } = layout(s);
  const svg = await satori(tree as never, { width: WIDTH, height, fonts: fonts() });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(WIDTH * 1.5) }, background: 'rgba(0,0,0,0)' }).render().asPng();
  return Buffer.from(png);
}

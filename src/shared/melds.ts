import { COLORS, face, isJoker, sameFace } from './tiles';
import type { Face, MeldKind, TableMeld, Tile } from './types';

export interface MeldAnalysis {
  kind: MeldKind;
  tiles: Tile[]; // sıralanmış
  reps: Face[];
  value: number; // seri için sayı toplamı, çift için 1
}

/** Aynı renk, ardışık en az 3 taş. 12-13-1 geçersiz. Okeyler boşlukları doldurur. */
export function analyzeRun(tiles: Tile[], okey: Face): MeldAnalysis | null {
  if (tiles.length < 3 || tiles.length > 13) return null;
  const jokers = tiles.filter((t) => isJoker(t, okey));
  const reals = tiles.filter((t) => !isJoker(t, okey));
  if (reals.length === 0) return null;
  const color = face(reals[0], okey).color;
  if (reals.some((t) => face(t, okey).color !== color)) return null;
  const sorted = [...reals].sort((a, b) => face(a, okey).num - face(b, okey).num);
  for (let i = 1; i < sorted.length; i++) {
    if (face(sorted[i], okey).num === face(sorted[i - 1], okey).num) return null;
  }
  const min = face(sorted[0], okey).num;
  const max = face(sorted[sorted.length - 1], okey).num;
  const gaps = max - min + 1 - reals.length;
  if (gaps > jokers.length) return null;
  let extra = jokers.length - gaps;
  let start = min;
  let end = max;
  while (extra > 0 && end < 13) {
    end++;
    extra--;
  }
  while (extra > 0 && start > 1) {
    start--;
    extra--;
  }
  if (extra > 0) return null;
  const byNum = new Map(sorted.map((t) => [face(t, okey).num, t]));
  const js = [...jokers];
  const out: Tile[] = [];
  const reps: Face[] = [];
  let value = 0;
  for (let v = start; v <= end; v++) {
    const t = byNum.get(v) ?? js.pop()!;
    out.push(t);
    reps.push({ color, num: v });
    value += v;
  }
  return { kind: 'run', tiles: out, reps, value };
}

/** Aynı sayı, farklı renk 3 ya da 4 taş. */
export function analyzeGroup(tiles: Tile[], okey: Face): MeldAnalysis | null {
  if (tiles.length < 3 || tiles.length > 4) return null;
  const jokers = tiles.filter((t) => isJoker(t, okey));
  const reals = tiles.filter((t) => !isJoker(t, okey));
  if (reals.length === 0) return null;
  const num = face(reals[0], okey).num;
  if (reals.some((t) => face(t, okey).num !== num)) return null;
  const colors = reals.map((t) => face(t, okey).color);
  if (new Set(colors).size !== colors.length) return null;
  const missing = COLORS.filter((c) => !colors.includes(c));
  const out: Tile[] = [];
  const reps: Face[] = [];
  reals.forEach((t) => {
    out.push(t);
    reps.push(face(t, okey));
  });
  jokers.forEach((t, i) => {
    out.push(t);
    reps.push({ color: missing[i], num });
  });
  return { kind: 'group', tiles: out, reps, value: num * tiles.length };
}

/** Seri per: dizi ya da grup, hangisi daha yüksek değer veriyorsa. */
export function analyzeSet(tiles: Tile[], okey: Face): MeldAnalysis | null {
  const options = [analyzeRun(tiles, okey), analyzeGroup(tiles, okey)].filter(
    (m): m is MeldAnalysis => m !== null,
  );
  if (options.length === 0) return null;
  return options.reduce((a, b) => (b.value > a.value ? b : a));
}

/** Çift: aynı renk ve sayıdan 2 taş. Okey herhangi bir taşla çift olur. */
export function analyzePair(tiles: Tile[], okey: Face): MeldAnalysis | null {
  if (tiles.length !== 2) return null;
  const [a, b] = tiles;
  const ja = isJoker(a, okey);
  const jb = isJoker(b, okey);
  let rep: Face;
  if (ja && jb) rep = { ...okey };
  else if (ja) rep = face(b, okey);
  else if (jb) rep = face(a, okey);
  else {
    const fa = face(a, okey);
    if (!sameFace(fa, face(b, okey))) return null;
    rep = fa;
  }
  return { kind: 'pair', tiles: [a, b], reps: [rep, { ...rep }], value: 1 };
}

export interface Extension {
  side: 'start' | 'end';
  rep: Face;
}

/** Masadaki bir pere taş işlenebilir mi? Çiftlere işleme yapılmaz. */
export function extendMeld(
  meld: TableMeld,
  tile: Tile,
  okey: Face,
  side?: 'start' | 'end',
): Extension | null {
  if (meld.kind === 'pair') return null;
  const joker = isJoker(tile, okey);
  const f = face(tile, okey);
  if (meld.kind === 'group') {
    if (meld.tiles.length >= 4) return null;
    const num = meld.reps[0].num;
    // Okeyin temsil ettiği renk 3'lü grupta kesin değildir; sadece gerçek taşların renkleri doludur.
    const realColors = meld.tiles.filter((t) => !isJoker(t, okey)).map((t) => face(t, okey).color);
    if (joker) {
      const color = COLORS.find((c) => !meld.reps.some((r) => r.color === c))!;
      return { side: 'end', rep: { color, num } };
    }
    if (f.num !== num || realColors.includes(f.color)) return null;
    return { side: 'end', rep: f };
  }
  const color = meld.reps[0].color;
  const first = meld.reps[0].num;
  const last = meld.reps[meld.reps.length - 1].num;
  const tryEnd = (): Extension | null =>
    last < 13 && (joker || (f.color === color && f.num === last + 1))
      ? { side: 'end', rep: { color, num: last + 1 } }
      : null;
  const tryStart = (): Extension | null =>
    first > 1 && (joker || (f.color === color && f.num === first - 1))
      ? { side: 'start', rep: { color, num: first - 1 } }
      : null;
  if (side === 'end') return tryEnd();
  if (side === 'start') return tryStart();
  return tryEnd() ?? tryStart();
}

/** İşlek: masadaki bir pere işlenebilecek (okey olmayan) taş. */
export function isIslek(tile: Tile, table: TableMeld[], okey: Face): boolean {
  if (isJoker(tile, okey)) return false;
  return table.some((m) => extendMeld(m, tile, okey) !== null);
}

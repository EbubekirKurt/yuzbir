import type { Color, Face, Tile } from './types';

export const COLORS: Color[] = ['Y', 'R', 'K', 'B'];

export const COLOR_NAMES: Record<Color, string> = {
  Y: 'sarı',
  R: 'kırmızı',
  K: 'siyah',
  B: 'mavi',
};

/** 106 taş: 4 renk × 1-13 × 2 + 2 sahte okey. */
export function createTiles(): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;
  for (const color of COLORS) {
    for (let num = 1; num <= 13; num++) {
      for (let copy = 0; copy < 2; copy++) tiles.push({ id: id++, color, num, fake: false });
    }
  }
  tiles.push({ id: id++, color: 'Y', num: 0, fake: true });
  tiles.push({ id: id++, color: 'Y', num: 0, fake: true });
  return tiles;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Göstergenin aynı renkte bir üstü okeydir; 13'ün üstü 1'dir. */
export function okeyFromGosterge(g: Tile): Face {
  return { color: g.color, num: g.num === 13 ? 1 : g.num + 1 };
}

/** Gerçek okey taşı mı (joker)? Sahte okey joker değildir. */
export function isJoker(t: Tile, okey: Face): boolean {
  return !t.fake && t.color === okey.color && t.num === okey.num;
}

/** Taşın yüzü: sahte okey okeyin yüzünü taşır. */
export function face(t: Tile, okey: Face): Face {
  return t.fake ? { color: okey.color, num: okey.num } : { color: t.color, num: t.num };
}

export function sameFace(a: Face, b: Face): boolean {
  return a.color === b.color && a.num === b.num;
}

/** Elde kalan taşın ceza değeri: okey 101, sahte okey okeyin sayısı. */
export function handValue(t: Tile, okey: Face): number {
  return isJoker(t, okey) ? 101 : face(t, okey).num;
}

export function faceName(f: Face): string {
  return `${COLOR_NAMES[f.color]} ${f.num}`;
}

export function tileName(t: Tile, okey?: Face): string {
  if (t.fake) return 'sahte okey';
  if (okey && isJoker(t, okey)) return `okey (${faceName(t)})`;
  return faceName(t);
}

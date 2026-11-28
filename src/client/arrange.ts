// Istaka düzenleme: "Seri Diz" ve "Çift Diz" için otomatik yerleşim.
import { COLORS, face, isJoker } from '../shared/tiles';
import type { Face, Tile } from '../shared/types';

export const ROW = 15;
export const SLOTS = ROW * 2;

const colorOrder = (c: string) => COLORS.indexOf(c as never);

export function sortTiles(tiles: Tile[], okey: Face): Tile[] {
  return [...tiles].sort((a, b) => {
    const ja = isJoker(a, okey) ? 1 : 0;
    const jb = isJoker(b, okey) ? 1 : 0;
    if (ja !== jb) return ja - jb;
    const fa = face(a, okey);
    const fb = face(b, okey);
    return colorOrder(fa.color) - colorOrder(fb.color) || fa.num - fb.num;
  });
}

export interface Arrangement {
  blocks: number[][];
  rest: number[];
}

/** Aday per: her konum ya gerçek bir yüz ya da okeyle doldurulan bir yüz (joker: true). */
type Slot = { face: Face; joker: boolean };
type Cand = { slots: Slot[]; value: number; jokers: number };

/**
 * En yüksek toplam değerli seri perleri bulur. Okeyler en baştan hesaba katılır:
 * dizideki boşlukları doldurur, eksik grupları tamamlar ya da diziyi uzatır.
 */
export function arrangeSeri(hand: Tile[], okey: Face): Arrangement {
  const jokers = hand.filter((t) => isJoker(t, okey));
  const reals = hand.filter((t) => !isJoker(t, okey));
  const key = (f: Face) => `${f.color}${f.num}`;
  const pool = new Map<string, Tile[]>();
  for (const t of reals) {
    const k = key(face(t, okey));
    pool.set(k, [...(pool.get(k) ?? []), t]);
  }
  const has = (c: string, n: number) => (pool.get(`${c}${n}`)?.length ?? 0) > 0;
  const J = jokers.length;

  const cands: Cand[] = [];
  // Diziler: en az bir gerçek taş, eksikler okeyle (en fazla J tane).
  for (const color of COLORS) {
    for (let s = 1; s <= 11; s++) {
      let missing = 0;
      for (let e = s; e <= 13; e++) {
        if (!has(color, e)) missing++;
        if (missing > J) break;
        const len = e - s + 1;
        if (len < 3 || missing === len) continue;
        const slots: Slot[] = [];
        let value = 0;
        for (let n = s; n <= e; n++) {
          slots.push({ face: { color, num: n }, joker: !has(color, n) });
          value += n;
        }
        cands.push({ slots, value, jokers: missing });
      }
    }
  }
  // Gruplar: aynı sayı, farklı renk; eksik renkler okeyle.
  for (let n = 1; n <= 13; n++) {
    const present = COLORS.filter((c) => has(c, n));
    if (!present.length) continue;
    const missingColors = COLORS.filter((c) => !has(c, n));
    for (const size of [3, 4]) {
      // Mevcut renklerin size'a kadar olan tüm alt kümeleri + okeyle tamamlama
      const subsets = (arr: typeof COLORS, k: number): (typeof COLORS)[] =>
        k === 0 ? [[]] : arr.flatMap((c, i) => subsets(arr.slice(i + 1), k - 1).map((rest) => [c, ...rest]));
      for (let realCount = Math.min(size, present.length); realCount >= 1; realCount--) {
        const need = size - realCount;
        if (need > J || need > missingColors.length) continue;
        for (const sub of subsets(present, realCount)) {
          const slots: Slot[] = [
            ...sub.map((c) => ({ face: { color: c, num: n }, joker: false })),
            ...missingColors.slice(0, need).map((c) => ({ face: { color: c, num: n }, joker: true })),
          ];
          cands.push({ slots, value: n * size, jokers: need });
        }
      }
    }
  }
  // Önce değerli ve az okey kullanan adaylar
  cands.sort((a, b) => b.value - a.value || a.jokers - b.jokers);

  const counts = new Map<string, number>();
  for (const [k, v] of pool) counts.set(k, v.length);
  let jokersLeft = J;
  let best: Cand[] = [];
  let bestValue = 0;
  let nodes = 0;
  const chosen: Cand[] = [];
  const remainingValue = () => {
    let s = jokersLeft * 13;
    for (const [k, c] of counts) s += c * Number(k.slice(1));
    return s;
  };
  const fits = (c: Cand) => c.jokers <= jokersLeft && c.slots.every((sl) => sl.joker || (counts.get(key(sl.face)) ?? 0) > 0);
  const apply = (c: Cand, d: 1 | -1) => {
    jokersLeft -= d * c.jokers;
    for (const sl of c.slots) if (!sl.joker) counts.set(key(sl.face), counts.get(key(sl.face))! - d);
  };
  const dfs = (from: number, value: number) => {
    if (++nodes > 80000) return;
    if (value > bestValue) {
      bestValue = value;
      best = [...chosen];
    }
    if (value + remainingValue() <= bestValue) return;
    for (let i = from; i < cands.length; i++) {
      const c = cands[i];
      if (!fits(c)) continue;
      apply(c, 1);
      chosen.push(c);
      dfs(i, value + c.value);
      chosen.pop();
      apply(c, -1);
    }
  };
  dfs(0, 0);

  const spare = [...jokers];
  const blocks = best.map((c) => c.slots.map((sl) => (sl.joker ? spare.pop()! : pool.get(key(sl.face))!.shift()!)));
  const used = new Set(blocks.flat().map((t) => t.id));
  const rest = sortTiles(hand.filter((t) => !used.has(t.id)), okey).map((t) => t.id);
  return { blocks: blocks.map((b) => b.map((t) => t.id)), rest };
}

/** Aynı taşları çift yapar, okeyleri en yüksek tek taşlarla eşleştirir. */
export function arrangeCift(hand: Tile[], okey: Face): Arrangement {
  const jokers = hand.filter((t) => isJoker(t, okey));
  const reals = sortTiles(hand.filter((t) => !isJoker(t, okey)), okey);
  const byFace = new Map<string, Tile[]>();
  for (const t of reals) {
    const f = face(t, okey);
    const k = `${f.color}${f.num}`;
    byFace.set(k, [...(byFace.get(k) ?? []), t]);
  }
  const blocks: number[][] = [];
  const singles: Tile[] = [];
  for (const ts of byFace.values()) {
    if (ts.length >= 2) blocks.push([ts[0].id, ts[1].id]);
    else singles.push(ts[0]);
  }
  singles.sort((a, b) => face(b, okey).num - face(a, okey).num);
  for (const j of jokers) {
    const s = singles.shift();
    if (s) blocks.push([s.id, j.id]);
    else singles.push(j);
  }
  const rest = sortTiles(singles, okey).map((t) => t.id);
  return { blocks, rest };
}

/** Blokları aralarında boşluk bırakarak 2 sıralık ıstakaya yerleştirir. */
export function layoutSlots({ blocks, rest }: Arrangement): (number | null)[] {
  const tryLayout = (gap: boolean): (number | null)[] | null => {
    const slots: (number | null)[] = Array(SLOTS).fill(null);
    let pos = 0;
    const place = (ids: number[], keepTogether: boolean): boolean => {
      if (ids.length === 0) return true;
      const rowEnd = (Math.floor(pos / ROW) + 1) * ROW;
      if (keepTogether && pos + ids.length > rowEnd) pos = rowEnd;
      for (const id of ids) {
        if (pos >= SLOTS) return false;
        slots[pos++] = id;
      }
      if (gap && pos % ROW !== 0) pos++;
      return true;
    };
    for (const b of blocks) if (!place(b, true)) return null;
    // Kalan taşları ikinci sıraya koy (yer varsa).
    if (pos < ROW && rest.length <= ROW) pos = ROW;
    for (const id of rest) {
      if (pos >= SLOTS) return null;
      slots[pos++] = id;
    }
    return slots;
  };
  return (
    tryLayout(true) ??
    tryLayout(false) ??
    [...blocks.flat(), ...rest, ...Array(SLOTS).fill(null)].slice(0, SLOTS)
  );
}

/** Istakadaki ardışık taş grupları (boşlukla ayrılmış). */
export function slotBlocks(slots: (number | null)[]): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < 2; r++) {
    let cur: number[] = [];
    for (let i = r * ROW; i < (r + 1) * ROW; i++) {
      const id = slots[i];
      if (id === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push(id);
    }
    if (cur.length) out.push(cur);
  }
  return out;
}

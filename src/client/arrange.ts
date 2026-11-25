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

type Cand = { faces: Face[]; value: number };

/** Okeysiz en yüksek değerli seri perleri bulur, okeyleri dizilerin ucuna ekler. */
export function arrangeSeri(hand: Tile[], okey: Face): Arrangement {
  const jokers = hand.filter((t) => isJoker(t, okey));
  const reals = hand.filter((t) => !isJoker(t, okey));
  const pool = new Map<string, Tile[]>();
  const key = (f: Face) => `${f.color}${f.num}`;
  for (const t of reals) {
    const k = key(face(t, okey));
    pool.set(k, [...(pool.get(k) ?? []), t]);
  }
  const has = (c: string, n: number) => (pool.get(`${c}${n}`)?.length ?? 0) > 0;

  const cands: Cand[] = [];
  for (const color of COLORS) {
    for (let s = 1; s <= 11; s++) {
      for (let e = s + 2; e <= 13; e++) {
        let okRun = true;
        for (let n = s; n <= e; n++) if (!has(color, n)) okRun = false;
        if (!okRun) break;
        const faces: Face[] = [];
        let value = 0;
        for (let n = s; n <= e; n++) {
          faces.push({ color, num: n });
          value += n;
        }
        cands.push({ faces, value });
      }
    }
  }
  for (let n = 1; n <= 13; n++) {
    const cs = COLORS.filter((c) => has(c, n));
    if (cs.length < 3) continue;
    if (cs.length === 4) cands.push({ faces: cs.map((color) => ({ color, num: n })), value: n * 4 });
    for (let skip = 0; skip < cs.length; skip++) {
      const sub = cs.length === 4 ? cs.filter((_, i) => i !== skip) : cs;
      cands.push({ faces: sub.map((color) => ({ color, num: n })), value: n * 3 });
      if (cs.length === 3) break;
    }
  }
  cands.sort((a, b) => b.value - a.value);

  const counts = new Map<string, number>();
  for (const [k, v] of pool) counts.set(k, v.length);
  let best: Cand[] = [];
  let bestValue = 0;
  let nodes = 0;
  const chosen: Cand[] = [];
  const remainingValue = () => {
    let s = 0;
    for (const [k, c] of counts) s += c * Number(k.slice(1));
    return s;
  };
  const dfs = (from: number, value: number) => {
    if (++nodes > 60000) return;
    if (value > bestValue) {
      bestValue = value;
      best = [...chosen];
    }
    if (value + remainingValue() <= bestValue) return;
    for (let i = from; i < cands.length; i++) {
      const c = cands[i];
      if (!c.faces.every((f) => (counts.get(key(f)) ?? 0) > 0)) continue;
      c.faces.forEach((f) => counts.set(key(f), counts.get(key(f))! - 1));
      chosen.push(c);
      dfs(i, value + c.value);
      chosen.pop();
      c.faces.forEach((f) => counts.set(key(f), counts.get(key(f))! + 1));
    }
  };
  dfs(0, 0);

  const take = (f: Face) => pool.get(key(f))!.shift()!;
  const blocks: { tiles: Tile[]; faces: Face[]; run: boolean }[] = best.map((c) => ({
    tiles: c.faces.map(take),
    faces: c.faces,
    run: c.faces[0].color === c.faces[c.faces.length - 1].color && c.faces.length > 1 && c.faces[0].num !== c.faces[1].num,
  }));
  // Okeyleri dizilerin ucuna ekle (değer artar).
  const spare = [...jokers];
  for (const b of blocks) {
    if (!spare.length) break;
    if (b.run && b.faces[b.faces.length - 1].num < 13) {
      b.tiles.push(spare.pop()!);
      b.faces.push({ color: b.faces[0].color, num: b.faces[b.faces.length - 1].num + 1 });
    } else if (b.run && b.faces[0].num > 1) {
      b.tiles.unshift(spare.pop()!);
      b.faces.unshift({ color: b.faces[0].color, num: b.faces[0].num - 1 });
    } else if (!b.run && b.tiles.length === 3) {
      b.tiles.push(spare.pop()!);
    }
  }
  const used = new Set(blocks.flatMap((b) => b.tiles.map((t) => t.id)));
  const rest = sortTiles(hand.filter((t) => !used.has(t.id)), okey).map((t) => t.id);
  return { blocks: blocks.map((b) => b.tiles.map((t) => t.id)), rest };
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

import { describe, expect, it } from 'vitest';
import { analyzeSet } from '../shared/melds';
import type { Color, Face, Tile } from '../shared/types';
import { arrangeSeri } from './arrange';

let id = 1;
const t = (color: Color, num: number): Tile => ({ id: id++, color, num, fake: false });
const OKEY: Face = { color: 'R', num: 8 };
const okeyTile = () => t('R', 8);

function check(hand: Tile[]) {
  const a = arrangeSeri(hand, OKEY);
  const byId = new Map(hand.map((x) => [x.id, x]));
  const all = [...a.blocks.flat(), ...a.rest];
  expect(new Set(all).size).toBe(hand.length); // her taş bir kez
  const melds = a.blocks.map((b) => analyzeSet(b.map((i) => byId.get(i)!), OKEY));
  melds.forEach((m) => expect(m).not.toBeNull()); // her blok geçerli per
  return { a, total: melds.reduce((s, m) => s + m!.value, 0) };
}

describe('Seri Diz (okeyli)', () => {
  it('okey dizideki boşluğu doldurur', () => {
    const { a, total } = check([t('Y', 3), t('Y', 4), okeyTile(), t('Y', 6), t('K', 1)]);
    expect(a.blocks).toHaveLength(1);
    expect(total).toBe(3 + 4 + 5 + 6);
  });

  it('okey iki taşlık grubu üçe tamamlar', () => {
    const { total } = check([t('B', 10), t('R', 10), okeyTile(), t('Y', 2)]);
    expect(total).toBe(30);
  });

  it('iki okeyle en yüksek toplamı bulur ve okeyleri tekrar kullanmaz', () => {
    const hand = [t('Y', 11), t('Y', 13), t('B', 12), t('K', 12), okeyTile(), okeyTile(), t('B', 1), t('Y', 5)];
    const { total, a } = check(hand);
    // Y11-Y12(okey)-Y13 = 36 ve B12-K12-okey = 36 -> 72
    expect(total).toBe(72);
    expect(a.blocks).toHaveLength(2);
  });

  it('okeysiz elde de eskisi gibi çalışır', () => {
    const { total } = check([t('K', 9), t('K', 10), t('K', 11), t('B', 7), t('Y', 7), t('R', 7), t('Y', 1)]);
    expect(total).toBe(30 + 21);
  });
});

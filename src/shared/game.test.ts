import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { analyzeGroup, analyzePair, analyzeRun, analyzeSet, isIslek } from './melds';
import type { Color, Face, Settings, Tile } from './types';

let nextId = 1000;
const t = (color: Color, num: number): Tile => ({ id: nextId++, color, num, fake: false });
const fake = (): Tile => ({ id: nextId++, color: 'Y', num: 0, fake: true });
const OKEY: Face = { color: 'R', num: 8 };
const okeyTile = () => t('R', 8);

const SOLO: Settings = { mode: 'tekli', katlamali: true, esKatlama: false, hands: 9, turnSeconds: 45 };

function setup(settings: Settings = SOLO) {
  const g = new Game(settings, ['A', 'B', 'C', 'D'], [false, false, false, false], 0, () => 0.42);
  g.startHand();
  g.okey = OKEY;
  g.gosterge = t('R', 7);
  return g;
}

describe('perler', () => {
  it('ardışık seri ve değeri', () => {
    const m = analyzeRun([t('Y', 3), t('Y', 5), t('Y', 4)], OKEY)!;
    expect(m.kind).toBe('run');
    expect(m.value).toBe(12);
    expect(m.reps.map((r) => r.num)).toEqual([3, 4, 5]);
  });

  it('12-13-1 geçersiz', () => {
    expect(analyzeRun([t('B', 12), t('B', 13), t('B', 1)], OKEY)).toBeNull();
  });

  it('okey boşluğu doldurur', () => {
    const m = analyzeRun([t('K', 3), okeyTile(), t('K', 5)], OKEY)!;
    expect(m.reps.map((r) => r.num)).toEqual([3, 4, 5]);
    expect(m.value).toBe(12);
  });

  it('okey 13 üstüne gidemez, alta uzar', () => {
    const m = analyzeRun([t('K', 12), t('K', 13), okeyTile()], OKEY)!;
    expect(m.reps.map((r) => r.num)).toEqual([11, 12, 13]);
  });

  it('sahte okey okeyin değerini taşır', () => {
    const m = analyzeRun([t('R', 6), t('R', 7), fake()], OKEY)!;
    expect(m.value).toBe(21);
  });

  it('aynı sayı farklı renk grup, okeyle', () => {
    const m = analyzeGroup([t('Y', 9), t('B', 9), okeyTile()], OKEY)!;
    expect(m.value).toBe(27);
    expect(analyzeGroup([t('Y', 9), t('Y', 9), t('B', 9)], OKEY)).toBeNull();
  });

  it('analyzeSet en yüksek yorumu seçer', () => {
    const m = analyzeSet([t('Y', 10), okeyTile(), okeyTile()], OKEY)!;
    // grup: 10 × 3 = 30, dizi: 10 + 11 + 12 = 33 -> dizi seçilir
    expect(m.kind).toBe('run');
    expect(m.value).toBe(33);
  });

  it('çift ve okeyli çift', () => {
    expect(analyzePair([t('Y', 2), t('Y', 2)], OKEY)).not.toBeNull();
    expect(analyzePair([t('Y', 2), t('B', 2)], OKEY)).toBeNull();
    expect(analyzePair([t('Y', 2), okeyTile()], OKEY)!.reps[0]).toEqual({ color: 'Y', num: 2 });
  });
});

describe('açma eşikleri', () => {
  it('katlamalı: en yüksek açılışın 1 fazlası', () => {
    const g = setup();
    g.openings.push({ seat: 1, kind: 'seri', value: 115 });
    g.openings.push({ seat: 2, kind: 'cift', value: 5 });
    expect(g.thresholds(0)).toEqual({ seri: 116, cift: 6 });
  });

  it('katlamasız: her zaman 101 / 5', () => {
    const g = setup({ ...SOLO, katlamali: false });
    g.openings.push({ seat: 1, kind: 'seri', value: 140 });
    expect(g.thresholds(0)).toEqual({ seri: 101, cift: 5 });
  });

  it('eşli, eşe katlama hayır: eşin açılışı sayılmaz', () => {
    const g = setup({ ...SOLO, mode: 'esli', esKatlama: false });
    g.openings.push({ seat: 2, kind: 'seri', value: 120 }); // seat 0'ın eşi
    expect(g.thresholds(0).seri).toBe(101);
    expect(g.thresholds(1).seri).toBe(121);
    g.openings.push({ seat: 1, kind: 'seri', value: 121 });
    expect(g.thresholds(0).seri).toBe(122);
    expect(g.thresholds(3).seri).toBe(121);
  });

  it('eşli, eşe katlama evet: eşin açılışı da sayılır', () => {
    const g = setup({ ...SOLO, mode: 'esli', esKatlama: true });
    g.openings.push({ seat: 2, kind: 'seri', value: 120 });
    expect(g.thresholds(0).seri).toBe(121);
  });
});

/** Seat 0'a 120'lik seri açılabilecek bir el verir. */
function openingHand() {
  const melds = [
    [t('Y', 11), t('Y', 12), t('Y', 13)], // 36
    [t('B', 10), t('K', 10), t('Y', 10)], // 30
    [t('K', 9), t('K', 10), t('K', 11)], // 30
    [t('B', 7), t('B', 8), t('B', 9)], // 24 -> toplam 120
  ];
  const rest = [t('B', 2), t('K', 3)];
  return { melds, rest, hand: [...melds.flat(), ...rest] };
}

describe('el akışı ve cezalar', () => {
  it('geçerli seri açılış, sonra işlek atınca 101 ceza', () => {
    const g = setup();
    const { melds, hand } = openingHand();
    g.players[0].hand = hand;
    g.turn = 0;
    g.phase = 'play';
    const r = g.open(0, 'seri', melds.map((m) => m.map((x) => x.id)));
    expect(r.ok).toBe(true);
    expect(g.players[0].opened).toBe('seri');
    expect(g.players[0].openValue).toBe(120);
    // B 6 masadaki B 7-8-9'a işlenebilir -> işlek
    const b6 = t('B', 6);
    g.players[0].hand.push(b6);
    expect(isIslek(b6, g.table, OKEY)).toBe(true);
    g.discard(0, b6.id);
    expect(g.players[0].penalties).toEqual([{ amount: 101, reason: 'İşlek attı (mavi 6)' }]);
  });

  it('yetersiz açılış: hatalı açma 101 ceza, taşlar elde kalır', () => {
    const g = setup();
    const { melds, hand } = openingHand();
    g.players[0].hand = hand;
    g.turn = 0;
    g.phase = 'play';
    const r = g.open(0, 'seri', melds.slice(0, 2).map((m) => m.map((x) => x.id)));
    expect(r.ok).toBe(false);
    expect(g.players[0].penalties[0].amount).toBe(101);
    expect(g.players[0].hand).toHaveLength(hand.length);
    expect(g.table).toHaveLength(0);
  });

  it('150 ve üstü seri baraj sayılır', () => {
    const g = setup();
    const melds = [
      [t('Y', 11), t('Y', 12), t('Y', 13)],
      [t('B', 12), t('K', 12), t('Y', 12)],
      [t('K', 11), t('K', 12), t('K', 13)],
      [t('B', 13), t('R', 13), t('K', 13)],
    ]; // 36 + 36 + 36 + 39 = 147 -> yetmez
    melds.push([t('B', 1), t('B', 2), t('B', 3)]); // +6 = 153
    g.players[0].hand = [...melds.flat(), t('Y', 1)];
    g.turn = 0;
    g.phase = 'play';
    expect(g.open(0, 'seri', melds.map((m) => m.map((x) => x.id))).ok).toBe(true);
    expect(g.players[0].baraj).toBe(true);
  });

  it('soldan alıp açınca ceza taşı atana: değer × 10, çiftte × 2', () => {
    const g = setup();
    const seven = t('Y', 7);
    // Seat 3 (sol) yedi atmış olsun
    g.piles[3] = [seven];
    const pairs = [
      [t('Y', 2), t('Y', 2)],
      [t('B', 5), t('B', 5)],
      [t('K', 9), t('K', 9)],
      [t('B', 11), t('B', 11)],
    ];
    const other7 = t('Y', 7);
    g.players[0].hand = [...pairs.flat(), other7, t('K', 1), t('K', 3)];
    g.turn = 0;
    g.phase = 'draw';
    expect(g.takeLeft(0).ok).toBe(true);
    const groups = [...pairs.map((p) => p.map((x) => x.id)), [seven.id, other7.id]];
    expect(g.open(0, 'cift', groups).ok).toBe(true);
    expect(g.players[3].penalties).toEqual([
      { amount: 140, reason: 'Soldan aldırdı: sarı 7 × 10 × 2 (çift)' },
    ]);
  });

  it('soldan alınan taş açılışta kullanılmazsa hatalı açma, taş geri döner', () => {
    const g = setup();
    const four = t('Y', 4);
    g.piles[3] = [four];
    const { melds, hand } = openingHand();
    g.players[0].hand = hand;
    g.turn = 0;
    g.phase = 'draw';
    g.takeLeft(0);
    const r = g.open(0, 'seri', melds.map((m) => m.map((x) => x.id)));
    expect(r.ok).toBe(false);
    expect(g.piles[3]).toHaveLength(1);
    expect(g.phase).toBe('draw');
  });

  it('destenin son taşını çeken atınca el biter, sıradaki soldan alamaz', () => {
    const g = setup();
    g.deck = [t('K', 7)];
    g.players[0].hand = [t('Y', 1), t('B', 4)];
    g.turn = 0;
    g.phase = 'draw';
    expect(g.draw(0).ok).toBe(true);
    expect(g.deck).toHaveLength(0);
    g.discard(0, g.players[0].hand[0].id);
    expect(g.phase).toBe('handEnd');
    expect(g.history).toHaveLength(1);
    expect(g.history[0].finisher).toBeNull();
    expect(g.takeLeft(1).ok).toBe(false);
  });

  it('açtıktan sonraki turda yeni per indirilebilir', () => {
    const g = setup();
    const { melds, hand } = openingHand();
    g.players[0].hand = hand;
    g.turn = 0;
    g.phase = 'play';
    expect(g.open(0, 'seri', melds.map((m) => m.map((x) => x.id))).ok).toBe(true);
    const elevens = [t('Y', 11), t('R', 11), t('K', 11)];
    g.players[0].hand.push(...elevens);
    expect(g.lay(0, [elevens.map((x) => x.id)]).ok).toBe(true);
    expect(g.table.filter((m) => m.owner === 0)).toHaveLength(5);
    expect(g.players[0].hand).toHaveLength(2);
  });

  it('işleme sınırı: bir uca turda en fazla 2 taş', () => {
    const g = setup();
    const { melds, hand } = openingHand();
    g.players[0].hand = hand;
    g.turn = 0;
    g.phase = 'play';
    g.open(0, 'seri', melds.map((m) => m.map((x) => x.id)));
    const blue = g.table.find((m) => m.reps[0].color === 'B' && m.kind === 'run')!;
    const b6 = t('B', 6), b5 = t('B', 5), b4 = t('B', 4);
    g.players[0].hand.push(b6, b5, b4, t('Y', 1));
    expect(g.extend(0, b6.id, blue.id, 'start').ok).toBe(true);
    expect(g.extend(0, b5.id, blue.id, 'start').ok).toBe(true);
    expect(g.extend(0, b4.id, blue.id, 'start').ok).toBe(false);
  });
});

describe('puanlama', () => {
  it('normal bitiş: biten -101, açmayan 202, açan kalan kadar', () => {
    const g = setup();
    const { melds, hand } = openingHand();
    g.players[0].hand = hand;
    g.players[1].hand = [t('K', 4), t('K', 6)];
    g.players[1].opened = 'seri';
    g.players[2].hand = [t('B', 4), t('B', 6)];
    g.players[2].opened = 'cift';
    g.players[3].hand = [t('Y', 4), okeyTile()];
    g.turn = 0;
    g.phase = 'play';
    g.open(0, 'seri', melds.map((m) => m.map((x) => x.id)));
    // elde B2, K3 kaldı; K3'ü işlemeye gerek yok, B2'yi lay edemeyiz; elde 2 taş, birini atıp diğerini bırakamayız.
    // Bitirmeyi simüle etmek için eli tek taşa indir.
    g.players[0].hand = [t('Y', 1)];
    g.discard(0, g.players[0].hand[0].id);
    const res = g.history[0];
    expect(res.k).toBe(1);
    const byseat = res.rows.map((r) => r.total);
    expect(byseat[0]).toBe(-101);
    expect(byseat[1]).toBe(10); // 4 + 6
    expect(byseat[2]).toBe(20); // çift açan 2 kat
    expect(byseat[3]).toBe(202); // açmamış
  });

  it('kimse açmadan çiftle bitiş: k = 4', () => {
    const g = setup();
    const pairs = Array.from({ length: 5 }, (_, i) => [t('Y', i + 2), t('Y', i + 2)]);
    g.players[0].hand = [...pairs.flat(), t('K', 1)];
    g.turn = 0;
    g.phase = 'play';
    expect(g.open(0, 'cift', pairs.map((p) => p.map((x) => x.id))).ok).toBe(true);
    g.discard(0, g.players[0].hand[0].id);
    const res = g.history[0];
    expect(res.k).toBe(4);
    expect(res.rows[0].total).toBe(-404);
    expect(res.rows[1].total).toBe(808);
  });

  it('tüm oyun otomatik oynanınca biter', () => {
    const settings: Settings = { ...SOLO, hands: 5 };
    const g = new Game(settings, ['A', 'B', 'C', 'D'], [true, true, true, true]);
    g.startHand();
    let guard = 0;
    while (g.phase !== 'gameOver' && guard++ < 10000) {
      if (g.phase === 'handEnd') g.nextHand();
      else g.autoPlay(g.turn);
    }
    expect(g.phase).toBe('gameOver');
    expect(g.history).toHaveLength(5);
    // Kimse açmadığı için deste biter; herkes 202 + varsa cezalar
    for (const h of g.history) {
      expect(h.finisher).toBeNull();
      for (const r of h.rows) expect(r.base).toBe(202);
    }
  });
});

describe('okey alma', () => {
  /** Masada seat 1'in mavi 10 - kırmızı 10 - okey grubu, seat 0 açmış. */
  function groupWithOkey() {
    const g = setup();
    const { melds, hand } = openingHand();
    g.players[0].hand = hand;
    g.turn = 0;
    g.phase = 'play';
    g.open(0, 'seri', melds.map((m) => m.map((x) => x.id)));
    g.table.push({
      id: 999,
      owner: 1,
      kind: 'group',
      tiles: [t('B', 10), t('R', 10), okeyTile()],
      reps: [{ color: 'B', num: 10 }, { color: 'R', num: 10 }, { color: 'Y', num: 10 }],
    });
    return g;
  }

  it('3 taşlı grupta okey alınamaz (siyah 10 da, sarı 10 da)', () => {
    const g = groupWithOkey();
    const k10 = t('K', 10);
    const y10 = t('Y', 10);
    g.players[0].hand.push(k10, y10);
    expect(g.swapOkey(0, k10.id, 999, 2).ok).toBe(false);
    expect(g.swapOkey(0, y10.id, 999, 2).ok).toBe(false);
  });

  it('eksik renk işlenince grup 4 olur, okey kalan rengi temsil eder ve alınabilir', () => {
    const g = groupWithOkey();
    const y10 = t('Y', 10);
    const k10 = t('K', 10);
    g.players[0].hand.push(y10, k10, t('B', 1));
    expect(g.extend(0, y10.id, 999).ok).toBe(true);
    const meld = g.table.find((m) => m.id === 999)!;
    expect(meld.tiles).toHaveLength(4);
    const jokerPos = meld.tiles.findIndex((x) => x.color === 'R' && x.num === 8);
    expect(meld.reps[jokerPos]).toEqual({ color: 'K', num: 10 });
    expect(g.swapOkey(0, k10.id, 999, jokerPos).ok).toBe(true);
    expect(g.players[1].penalties[0]).toEqual({ amount: 101, reason: 'Okeyi alındı' });
  });
});

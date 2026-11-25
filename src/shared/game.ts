// 101 Okey oyun motoru. Kurallar için README.MD esas alınır.
import { analyzeGroup, analyzePair, analyzeSet, extendMeld, isIslek, type MeldAnalysis } from './melds';
import {
  createTiles,
  face,
  faceName,
  handValue,
  isJoker,
  okeyFromGosterge,
  shuffle,
  tileName,
} from './tiles';
import type {
  Face,
  GameAction,
  GameView,
  HandResult,
  HandRow,
  LogEntry,
  OpenKind,
  Opening,
  Penalty,
  Phase,
  Settings,
  TableMeld,
  Tile,
} from './types';

export interface PlayerState {
  hand: Tile[];
  opened: OpenKind | null;
  openValue: number;
  penalties: Penalty[];
  baraj: boolean;
  gostergeTileId: number | null; // bildirilen gösterge taşı
}

export type Result = { ok: true; info?: string } | { ok: false; error: string };

const ok = (info?: string): Result => ({ ok: true, info });
const fail = (error: string): Result => ({ ok: false, error });

export const SEATS = 4;
export const next = (s: number) => (s + 1) % SEATS;
export const leftOf = (s: number) => (s + SEATS - 1) % SEATS;

export class Game {
  settings: Settings;
  names: string[];
  bots: boolean[];
  rng: () => number;

  handNo = 0;
  starter: number;
  history: HandResult[] = [];

  deck: Tile[] = [];
  gosterge!: Tile;
  okey!: Face;
  players: PlayerState[] = [];
  piles: Tile[][] = [];
  table: TableMeld[] = [];
  openings: Opening[] = [];
  turn = 0;
  phase: Phase = 'draw';
  pendingLeft: { tile: Tile; from: number } | null = null;
  extendCount: Record<string, number> = {};
  discardCount = 0;
  deckEmptyBy: number | null = null; // destenin son taşını çeken
  log: LogEntry[] = [];
  private logId = 0;
  private meldId = 0;

  constructor(settings: Settings, names: string[], bots: boolean[], starter = 0, rng = Math.random) {
    this.settings = settings;
    this.names = names;
    this.bots = bots;
    this.starter = starter;
    this.rng = rng;
  }

  // ---------- yardımcılar ----------

  private addLog(text: string, warn = false) {
    this.log.push({ id: ++this.logId, text, warn });
    if (this.log.length > 60) this.log.shift();
  }

  private name(seat: number) {
    return this.names[seat];
  }

  isPartner(a: number, b: number) {
    return this.settings.mode === 'esli' && a !== b && a % 2 === b % 2;
  }

  private penalize(seat: number, amount: number, reason: string) {
    this.players[seat].penalties.push({ amount, reason });
    this.addLog(`${this.name(seat)}: ${reason} (+${amount})`, true);
  }

  private findInHand(seat: number, id: number) {
    return this.players[seat].hand.find((t) => t.id === id);
  }

  private removeFromHand(seat: number, ids: number[]) {
    const set = new Set(ids);
    this.players[seat].hand = this.players[seat].hand.filter((t) => !set.has(t.id));
  }

  thresholds(seat: number) {
    if (!this.settings.katlamali) return { seri: 101, cift: 5 };
    const relevant = this.openings.filter(
      (o) =>
        this.settings.mode !== 'esli' || this.settings.esKatlama || o.seat % 2 !== seat % 2,
    );
    const maxOf = (kind: OpenKind) =>
      relevant.filter((o) => o.kind === kind).reduce((m, o) => Math.max(m, o.value), 0);
    return {
      seri: Math.max(101, maxOf('seri') + 1),
      cift: Math.max(5, maxOf('cift') + 1),
    };
  }

  // ---------- el akışı ----------

  startHand() {
    this.handNo++;
    let deck = shuffle(createTiles(), this.rng);
    // Gösterge sahte okey çıkarsa yenisi çekilir.
    let g = deck.pop()!;
    while (g.fake) {
      deck.splice(Math.floor(this.rng() * deck.length), 0, g);
      g = deck.pop()!;
    }
    this.gosterge = g;
    this.okey = okeyFromGosterge(g);
    this.players = [];
    for (let s = 0; s < SEATS; s++) {
      const count = s === this.starter ? 22 : 21;
      this.players.push({
        hand: deck.splice(deck.length - count, count),
        opened: null,
        openValue: 0,
        penalties: [],
        baraj: false,
        gostergeTileId: null,
      });
    }
    this.deck = deck;
    this.piles = [[], [], [], []];
    this.table = [];
    this.openings = [];
    this.turn = this.starter;
    this.phase = 'play'; // başlayan 22 taşla başlar, önce atar
    this.pendingLeft = null;
    this.extendCount = {};
    this.discardCount = 0;
    this.deckEmptyBy = null;
    this.log = [];
    this.addLog(
      `El ${this.handNo} başladı. Gösterge ${faceName(g)}, okey ${faceName(this.okey)}. ${this.name(this.starter)} başlıyor.`,
    );
  }

  private checkTurn(seat: number, phase: Phase): Result | null {
    if (this.phase === 'handEnd' || this.phase === 'gameOver') return fail('El bitti.');
    if (this.turn !== seat) return fail('Sıra sende değil.');
    if (this.phase !== phase)
      return fail(phase === 'draw' ? 'Önce taşını attın, sıra geçti.' : 'Önce taş çekmelisin.');
    return null;
  }

  apply(seat: number, action: GameAction): Result {
    switch (action.type) {
      case 'draw':
        return this.draw(seat);
      case 'takeLeft':
        return this.takeLeft(seat);
      case 'cancelLeft':
        return this.cancelLeft(seat);
      case 'open':
        return this.open(seat, action.kind, action.groups);
      case 'lay':
        return this.lay(seat, action.groups);
      case 'extend':
        return this.extend(seat, action.tileId, action.meldId, action.side);
      case 'swapOkey':
        return this.swapOkey(seat, action.tileId, action.meldId, action.pos);
      case 'discard':
        return this.discard(seat, action.tileId);
      case 'declareGosterge':
        return this.declareGosterge(seat);
      default:
        return fail('Bilinmeyen hamle.');
    }
  }

  draw(seat: number): Result {
    const err = this.checkTurn(seat, 'draw');
    if (err) return err;
    const tile = this.deck.pop();
    if (!tile) return fail('Destede taş kalmadı.');
    this.players[seat].hand.push(tile);
    this.phase = 'play';
    if (this.deck.length === 0) {
      this.deckEmptyBy = seat;
      this.addLog(`${this.name(seat)} destedeki son taşı çekti. Taşını atınca el biter.`);
    }
    return ok();
  }

  takeLeft(seat: number): Result {
    const err = this.checkTurn(seat, 'draw');
    if (err) return err;
    const from = leftOf(seat);
    const pile = this.piles[from];
    const tile = pile[pile.length - 1];
    if (!tile) return fail('Solunda alınacak taş yok.');
    pile.pop();
    const p = this.players[seat];
    p.hand.push(tile);
    this.phase = 'play';
    if (!p.opened) {
      this.pendingLeft = { tile, from };
      this.addLog(`${this.name(seat)} soldan ${tileName(tile)} aldı, bu tur açmak zorunda.`);
    } else {
      this.addLog(`${this.name(seat)} soldan ${tileName(tile)} aldı.`);
    }
    return ok();
  }

  cancelLeft(seat: number): Result {
    if (this.turn !== seat || !this.pendingLeft) return fail('Geri koyacak taş yok.');
    const { tile, from } = this.pendingLeft;
    this.removeFromHand(seat, [tile.id]);
    this.piles[from].push(tile);
    this.pendingLeft = null;
    this.phase = 'draw';
    this.addLog(`${this.name(seat)} soldan aldığı taşı geri koydu.`);
    return ok();
  }

  /** Grupları doğrular; hatalıysa null döner. */
  private analyzeGroups(seat: number, groups: number[][], mode: 'seri' | 'cift' | 'any') {
    const p = this.players[seat];
    const seen = new Set<number>();
    const result: MeldAnalysis[] = [];
    for (const g of groups) {
      const tiles: Tile[] = [];
      for (const id of g) {
        if (seen.has(id)) return null;
        seen.add(id);
        const t = this.findInHand(seat, id);
        if (!t) return null;
        tiles.push(t);
      }
      let m: MeldAnalysis | null = null;
      const gosterge = p.gostergeTileId !== null ? tiles.find((t) => t.id === p.gostergeTileId) : undefined;
      if (mode !== 'seri' && gosterge && tiles.length <= 2) {
        // Bildirilen gösterge tek başına ya da yanına konan herhangi bir taşla 1 çift sayılır.
        m = { kind: 'pair', tiles, reps: tiles.map((t) => face(t, this.okey)), value: 1 };
      } else if (mode === 'seri') m = analyzeSet(tiles, this.okey);
      else if (mode === 'cift') m = analyzePair(tiles, this.okey);
      else m = tiles.length === 2 ? analyzePair(tiles, this.okey) : analyzeSet(tiles, this.okey);
      if (!m) return null;
      result.push(m);
    }
    return { melds: result, used: seen };
  }

  private placeMelds(seat: number, melds: MeldAnalysis[]) {
    for (const m of melds) {
      this.table.push({ id: ++this.meldId, owner: seat, kind: m.kind, tiles: m.tiles, reps: m.reps });
    }
    this.removeFromHand(
      seat,
      melds.flatMap((m) => m.tiles.map((t) => t.id)),
    );
  }

  open(seat: number, kind: OpenKind, groups: number[][]): Result {
    const err = this.checkTurn(seat, 'play');
    if (err) return err;
    const p = this.players[seat];
    if (p.opened) return fail('Elini zaten açtın.');
    if (groups.length === 0) return fail('Açmak için per seçmelisin.');
    const totalTiles = groups.reduce((n, g) => n + g.length, 0);
    if (p.hand.length - totalTiles < 1) return fail('Atmak için elinde en az bir taş kalmalı.');

    const th = this.thresholds(seat);
    const analysis = this.analyzeGroups(seat, groups, kind);
    let reason: string | null = null;
    let value = 0;
    if (!analysis) reason = 'Geçersiz per var';
    else {
      value =
        kind === 'seri'
          ? analysis.melds.reduce((s, m) => s + m.value, 0)
          : analysis.melds.length;
      const need = kind === 'seri' ? th.seri : th.cift;
      if (value < need)
        reason = kind === 'seri' ? `Seri toplamı ${value}, en az ${need} gerekli` : `${value} çift, en az ${need} gerekli`;
      else if (this.pendingLeft && !analysis.used.has(this.pendingLeft.tile.id))
        reason = 'Soldan aldığın taşı açılışta kullanmalısın';
    }

    if (reason || !analysis) {
      this.penalize(seat, 101, 'Hatalı açma');
      if (this.pendingLeft) {
        const { tile, from } = this.pendingLeft;
        this.removeFromHand(seat, [tile.id]);
        this.piles[from].push(tile);
        this.pendingLeft = null;
        this.phase = 'draw';
      }
      return fail(`Hatalı açma: ${reason}. 101 ceza yazıldı.`);
    }

    this.placeMelds(seat, analysis.melds);
    p.opened = kind;
    p.openValue = value;
    this.openings.push({ seat, kind, value });
    this.addLog(`${this.name(seat)} ${kind === 'seri' ? `${value} ile seri` : `${value} çift ile`} açtı.`);

    if ((kind === 'seri' && value >= 150) || (kind === 'cift' && value >= 7)) {
      p.baraj = true;
      this.addLog(`${this.name(seat)} baraj açtı: -101!`);
    }

    if (this.pendingLeft) {
      const { tile, from } = this.pendingLeft;
      let rep = face(tile, this.okey);
      for (const m of analysis.melds) {
        const idx = m.tiles.findIndex((t) => t.id === tile.id);
        if (idx >= 0) rep = m.reps[idx];
      }
      const mult = kind === 'cift' ? 2 : 1;
      this.penalize(
        from,
        rep.num * 10 * mult,
        `Soldan aldırdı: ${faceName(rep)} × 10${mult === 2 ? ' × 2 (çift)' : ''}`,
      );
      this.pendingLeft = null;
    }
    return ok();
  }

  lay(seat: number, groups: number[][]): Result {
    const err = this.checkTurn(seat, 'play');
    if (err) return err;
    const p = this.players[seat];
    if (!p.opened) return fail('Önce elini açmalısın.');
    const totalTiles = groups.reduce((n, g) => n + g.length, 0);
    if (p.hand.length - totalTiles < 1) return fail('Atmak için elinde en az bir taş kalmalı.');
    const analysis = this.analyzeGroups(seat, groups, 'any');
    if (!analysis || analysis.melds.length === 0) return fail('Geçerli bir per ya da çift seçmelisin.');
    this.placeMelds(seat, analysis.melds);
    this.addLog(`${this.name(seat)} masaya ${analysis.melds.length} per indirdi.`);
    return ok();
  }

  extend(seat: number, tileId: number, meldId: number, side?: 'start' | 'end'): Result {
    const err = this.checkTurn(seat, 'play');
    if (err) return err;
    const p = this.players[seat];
    if (!p.opened) return fail('İşleme yapmak için önce elini açmalısın.');
    if (p.hand.length < 2) return fail('Atmak için elinde en az bir taş kalmalı.');
    const tile = this.findInHand(seat, tileId);
    const meld = this.table.find((m) => m.id === meldId);
    if (!tile || !meld) return fail('Taş ya da per bulunamadı.');
    const ext = extendMeld(meld, tile, this.okey, side);
    if (!ext) return fail('Bu taş bu pere işlenemez.');
    const key = `${meldId}:${ext.side}`;
    if ((this.extendCount[key] ?? 0) >= 2) return fail('Bir perin bir ucuna bir turda en fazla 2 taş işlenir.');
    this.extendCount[key] = (this.extendCount[key] ?? 0) + 1;
    if (ext.side === 'start') {
      meld.tiles.unshift(tile);
      meld.reps.unshift(ext.rep);
    } else {
      meld.tiles.push(tile);
      meld.reps.push(ext.rep);
    }
    if (meld.kind === 'group') {
      // Grup 4 taş olunca okeyin hangi rengin yerine geçtiği kesinleşir.
      const regrouped = analyzeGroup(meld.tiles, this.okey);
      if (regrouped) {
        meld.tiles = regrouped.tiles;
        meld.reps = regrouped.reps;
      }
    }
    this.removeFromHand(seat, [tileId]);
    this.addLog(`${this.name(seat)} ${tileName(tile)} işledi.`);
    return ok();
  }

  swapOkey(seat: number, tileId: number, meldId: number, pos: number): Result {
    const err = this.checkTurn(seat, 'play');
    if (err) return err;
    if (!this.players[seat].opened) return fail('Okeyi almak için önce elini açmalısın.');
    const tile = this.findInHand(seat, tileId);
    const meld = this.table.find((m) => m.id === meldId);
    if (!tile || !meld) return fail('Taş ya da per bulunamadı.');
    const target = meld.tiles[pos];
    if (!target || !isJoker(target, this.okey)) return fail('Orada okey yok.');
    if (isJoker(tile, this.okey)) return fail('Okeyin yerine gerçek taşı koymalısın.');
    if (meld.kind === 'group' && meld.tiles.length < 4)
      return fail('Bu grupta okeyin hangi taşın yerine geçtiği belli değil, okey alınamaz. Eksik taşı işleyebilirsin.');
    const f = face(tile, this.okey);
    const rep = meld.reps[pos];
    if (f.color !== rep.color || f.num !== rep.num)
      return fail(`Okey burada ${faceName(rep)} yerine kullanılıyor.`);
    meld.tiles[pos] = tile;
    this.removeFromHand(seat, [tileId]);
    this.players[seat].hand.push(target);
    this.addLog(`${this.name(seat)} masadaki okeyi aldı.`);
    if (meld.owner !== seat && !this.isPartner(meld.owner, seat)) {
      this.penalize(meld.owner, 101, 'Okeyi alındı');
    }
    return ok();
  }

  discard(seat: number, tileId: number): Result {
    const err = this.checkTurn(seat, 'play');
    if (err) return err;
    const p = this.players[seat];
    if (this.pendingLeft && !p.opened)
      return fail('Soldan aldığın taşla açmalı ya da taşı geri koymalısın.');
    const tile = this.findInHand(seat, tileId);
    if (!tile) return fail('Bu taş elinde yok.');
    this.removeFromHand(seat, [tileId]);
    const finishing = p.hand.length === 0;
    if (!finishing) {
      if (isJoker(tile, this.okey)) this.penalize(seat, 101, 'Okey attı');
      else if (isIslek(tile, this.table, this.okey))
        this.penalize(seat, 101, `İşlek attı (${tileName(tile)})`);
    }
    this.piles[seat].push(tile);
    this.discardCount++;
    this.extendCount = {};
    this.addLog(`${this.name(seat)} ${tileName(tile)} attı.`);

    if (finishing) {
      this.endHand(seat, tile);
      return ok();
    }
    if (this.deckEmptyBy === seat) {
      // Destenin son taşını çeken oyuncu taşını attı: el biter, sıradaki oyuncu oynamaz.
      this.endHand(null, null);
      return ok();
    }
    this.turn = next(seat);
    this.phase = 'draw';
    return ok();
  }

  declareGosterge(seat: number): Result {
    if (this.phase === 'handEnd' || this.phase === 'gameOver') return fail('El bitti.');
    if (this.discardCount > 0) return fail('Gösterge ilk taş atılmadan önce bildirilmeli.');
    const p = this.players[seat];
    if (p.gostergeTileId !== null) return fail('Göstergeyi zaten bildirdin.');
    const t = p.hand.find(
      (t) => !t.fake && t.color === this.gosterge.color && t.num === this.gosterge.num,
    );
    if (!t) return fail('Elinde gösterge taşı yok.');
    p.gostergeTileId = t.id;
    this.addLog(`${this.name(seat)} göstergeyi bildirdi (1 çift sayılır).`);
    return ok();
  }

  // ---------- otomatik oynama (süre dolunca ve botlar) ----------

  chooseAutoDiscard(seat: number): Tile {
    const hand = this.players[seat].hand;
    const nonJokers = hand
      .filter((t) => !isJoker(t, this.okey))
      .sort((a, b) => handValue(a, this.okey) - handValue(b, this.okey));
    return (
      nonJokers.find((t) => !isIslek(t, this.table, this.okey)) ?? nonJokers[0] ?? hand[0]
    );
  }

  /** Süresi dolan oyuncu ya da bot için: çek (veya pas), sonra işlek olmayan en düşük taşı at. */
  autoPlay(seat: number): void {
    if (this.turn !== seat || this.phase === 'handEnd' || this.phase === 'gameOver') return;
    if (this.pendingLeft && !this.players[seat].opened) this.cancelLeft(seat);
    if (this.phase === 'draw') {
      if (this.deck.length === 0) return;
      this.draw(seat);
    }
    if (this.phase === 'play' && this.turn === seat) {
      this.discard(seat, this.chooseAutoDiscard(seat).id);
    }
  }

  // ---------- el sonu ----------

  private endHand(finisher: number | null, lastTile: Tile | null) {
    let k = 1;
    const labels: string[] = [];
    if (finisher !== null) {
      const othersOpened = this.players.some((p, i) => i !== finisher && p.opened);
      const elden = !othersOpened;
      const cift = this.players[finisher].opened === 'cift';
      const okeyFinish = lastTile ? isJoker(lastTile, this.okey) : false;
      k = (cift ? 2 : 1) * (elden ? 2 : 1);
      if (elden) labels.push('Kimse açmadan');
      if (cift && okeyFinish) labels.push('okey + çiftle');
      else if (cift) labels.push('çiftle');
      else if (okeyFinish) labels.push('okeyle');
      else if (!elden) labels.push('Normal');
    }
    const finishLabel =
      finisher === null
        ? 'Deste bitti'
        : `${labels.join(' ')} bitiş`.replace(/^./, (c) => c.toUpperCase());

    const rows: HandRow[] = this.players.map((p, seat) => {
      const remaining = p.hand.reduce((s, t) => s + handValue(t, this.okey), 0);
      let status: HandRow['status'];
      let base: number;
      let kat = k;
      if (seat === finisher) {
        status = 'bitti';
        base = -101 * k;
      } else if (!p.opened) {
        status = 'acmadi';
        base = 202 * k;
      } else {
        status = 'acti';
        kat = p.opened === 'cift' ? 2 * k : k;
        base = remaining * kat;
      }
      const pen = p.penalties.reduce((s, x) => s + x.amount, 0);
      return {
        seat,
        status,
        openKind: p.opened,
        openValue: p.openValue,
        remaining: seat === finisher ? null : remaining,
        kat,
        base,
        penalties: [...p.penalties],
        baraj: p.baraj,
        total: base + pen + (p.baraj ? -101 : 0),
      };
    });

    this.history.push({
      handNo: this.handNo,
      finisher,
      finishLabel,
      k,
      okeyName: faceName(this.okey),
      rows,
    });
    this.addLog(
      finisher === null
        ? `El ${this.handNo} bitti: deste bitti.`
        : `El ${this.handNo} bitti: ${this.name(finisher)} bitirdi (${finishLabel.toLowerCase()}).`,
    );
    this.pendingLeft = null;
    this.phase = this.handNo >= this.settings.hands ? 'gameOver' : 'handEnd';
  }

  nextHand() {
    if (this.phase !== 'handEnd') return;
    this.starter = next(this.starter);
    this.startHand();
  }

  totals(): number[] {
    const t = [0, 0, 0, 0];
    for (const h of this.history) for (const r of h.rows) t[r.seat] += r.total;
    return t;
  }

  // ---------- görünüm ----------

  view(
    seat: number,
    extra: { names: string[]; bots: boolean[]; connected: boolean[]; avatars: (string | null)[]; deadlineIn: number | null },
  ): GameView {
    const p = this.players[seat];
    const canDeclare =
      this.discardCount === 0 &&
      (this.phase === 'draw' || this.phase === 'play') &&
      p.gostergeTileId === null &&
      p.hand.some((t) => !t.fake && t.color === this.gosterge.color && t.num === this.gosterge.num);
    return {
      you: seat,
      handNo: this.handNo,
      totalHands: this.settings.hands,
      phase: this.phase,
      turn: this.turn,
      deadlineIn: extra.deadlineIn,
      deckCount: this.deck.length,
      gosterge: this.gosterge,
      okey: this.okey,
      hand: p.hand,
      pendingLeftId: this.pendingLeft && this.turn === seat ? this.pendingLeft.tile.id : null,
      piles: this.piles.map((pile) => ({ top: pile[pile.length - 1] ?? null, count: pile.length })),
      table: this.table,
      openings: this.openings,
      players: this.players.map((pl, s) => ({
        seat: s,
        name: extra.names[s],
        isBot: extra.bots[s],
        connected: extra.connected[s],
        avatar: extra.avatars[s],
        handCount: pl.hand.length,
        opened: pl.opened,
        openValue: pl.openValue,
      })),
      thresholds: this.thresholds(seat),
      canDeclareGosterge: canDeclare,
      gostergeDeclared: p.gostergeTileId !== null,
      gostergeTileId: p.gostergeTileId,
      extendCount: this.extendCount,
      currentPenalties: this.players.map((pl) => pl.penalties),
      currentBaraj: this.players.map((pl) => pl.baraj),
      log: this.log,
      history: this.history,
      totals: this.totals(),
    };
  }
}

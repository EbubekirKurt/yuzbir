// Masalar: oturma, bot, oyun başlatma, süre sayacı ve otomatik oynama.
import { randomUUID } from 'node:crypto';
import { Game } from '../shared/game';
import type { GameAction, LobbyTable, Settings, TableView } from '../shared/types';
import { saveGame } from './db';

export interface Seat {
  playerId: string | null; // bot ise null
  name: string;
  isBot: boolean;
  connected: boolean;
}

const BOT_DELAY_MS = 1100;
const DISCONNECTED_TURN_MS = 10_000;
const NEXT_HAND_MS = 12_000;

export class Table {
  id = randomUUID().slice(0, 6);
  name: string;
  settings: Settings;
  hostId: string;
  seats: (Seat | null)[] = [null, null, null, null];
  game: Game | null = null;

  private turnTimer: NodeJS.Timeout | null = null;
  private nextHandTimer: NodeJS.Timeout | null = null;
  private turnKey = '';
  deadline: number | null = null;
  nextHandAt: number | null = null;
  emptySince: number | null = null;

  constructor(
    name: string,
    settings: Settings,
    hostId: string,
    private onChange: (t: Table) => void,
  ) {
    this.name = name;
    this.settings = settings;
    this.hostId = hostId;
  }

  get status(): 'waiting' | 'playing' {
    return this.game ? 'playing' : 'waiting';
  }

  seatOf(playerId: string): number {
    return this.seats.findIndex((s) => s?.playerId === playerId);
  }

  humanIds(): string[] {
    return this.seats.flatMap((s) => (s && !s.isBot && s.playerId ? [s.playerId] : []));
  }

  sit(playerId: string, name: string, seat?: number): string | null {
    const current = this.seatOf(playerId);
    if (current >= 0 && (this.game || seat === undefined || seat === current)) {
      // Yeniden bağlanma ya da aynı koltuk.
      this.seats[current]!.connected = true;
      this.seats[current]!.name = name;
      return null;
    }
    if (this.game) return 'Oyun başladı, masaya oturulamaz.';
    const target = seat ?? this.seats.findIndex((s) => s === null);
    if (target < 0 || target > 3) return 'Masa dolu.';
    if (this.seats[target] && this.seats[target]!.playerId !== playerId) return 'Bu koltuk dolu.';
    if (current >= 0) this.seats[current] = null;
    this.seats[target] = { playerId, name, isBot: false, connected: true };
    return null;
  }

  leave(playerId: string) {
    const s = this.seatOf(playerId);
    if (s < 0) return;
    if (this.game) {
      // Oyun sürerken koltuk boşalmaz; hamleleri otomatik oynanır.
      this.seats[s]!.connected = false;
      this.schedule();
    } else {
      this.seats[s] = null;
      if (this.hostId === playerId) {
        const nextHost = this.humanIds()[0];
        if (nextHost) this.hostId = nextHost;
      }
    }
  }

  setBot(requester: string, seat: number, add: boolean): string | null {
    if (requester !== this.hostId) return 'Sadece masa sahibi bot ekleyebilir.';
    if (this.game) return 'Oyun başladı.';
    if (this.settings.mode === 'esli') return 'Eşli modda bot eklenemez.';
    if (seat < 0 || seat > 3) return 'Geçersiz koltuk.';
    if (add) {
      if (this.seats[seat]) return 'Bu koltuk dolu.';
      const botNo = this.seats.filter((s) => s?.isBot).length + 1;
      this.seats[seat] = { playerId: null, name: `Bot ${botNo}`, isBot: true, connected: true };
    } else {
      if (!this.seats[seat]?.isBot) return 'Bu koltukta bot yok.';
      this.seats[seat] = null;
    }
    return null;
  }

  start(requester: string): string | null {
    if (requester !== this.hostId) return 'Oyunu sadece masa sahibi başlatabilir.';
    if (this.game) return 'Oyun zaten başladı.';
    if (this.seats.some((s) => s === null)) return 'Başlamak için 4 koltuk da dolu olmalı.';
    const names = this.seats.map((s) => s!.name);
    const bots = this.seats.map((s) => s!.isBot);
    this.game = new Game(this.settings, names, bots, Math.floor(Math.random() * 4));
    this.game.startHand();
    this.turnKey = '';
    this.schedule();
    return null;
  }

  restart(requester: string): string | null {
    if (requester !== this.hostId) return 'Sadece masa sahibi yeni oyun başlatabilir.';
    if (this.game?.phase !== 'gameOver') return 'Oyun henüz bitmedi.';
    this.game = null;
    this.clearTimers();
    // Bağlantısı kopmuş oyuncuların koltukları boşalır.
    this.seats = this.seats.map((s) => (s && !s.isBot && !s.connected ? null : s));
    return null;
  }

  act(playerId: string, action: GameAction): string | null {
    const g = this.game;
    if (!g) return 'Oyun başlamadı.';
    const seat = this.seatOf(playerId);
    if (seat < 0) return 'Bu masada oturmuyorsun.';
    const res = g.apply(seat, action);
    this.schedule();
    return res.ok ? null : res.error;
  }

  // ---------- zamanlayıcılar ----------

  private clearTimers() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    this.turnTimer = null;
    this.nextHandTimer = null;
    this.deadline = null;
    this.nextHandAt = null;
  }

  /** Her durum değişikliğinden sonra çağrılır: sıradaki hamle için zamanlayıcı kurar. */
  schedule() {
    const g = this.game;
    if (!g) return;
    if (g.phase === 'handEnd' || g.phase === 'gameOver') {
      if (this.turnTimer) clearTimeout(this.turnTimer);
      this.turnTimer = null;
      this.deadline = null;
      this.turnKey = '';
      if (g.phase === 'handEnd' && !this.nextHandTimer) {
        this.nextHandAt = Date.now() + NEXT_HAND_MS;
        this.nextHandTimer = setTimeout(() => {
          this.nextHandTimer = null;
          this.nextHandAt = null;
          g.nextHand();
          this.schedule();
          this.onChange(this);
        }, NEXT_HAND_MS);
      }
      if (g.phase === 'gameOver' && this.turnKey !== 'over') {
        this.turnKey = 'over';
        void this.persistResult();
      }
      return;
    }
    // Aynı oyuncunun aynı turu içinde süre sıfırlanmaz.
    const key = `${g.handNo}:${g.discardCount}:${g.turn}`;
    if (key === this.turnKey) return;
    this.turnKey = key;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    const seat = this.seats[g.turn]!;
    let ms: number;
    if (seat.isBot) ms = BOT_DELAY_MS;
    else if (!seat.connected) ms = Math.min(DISCONNECTED_TURN_MS, this.settings.turnSeconds * 1000);
    else ms = this.settings.turnSeconds * 1000;
    this.deadline = seat.isBot ? null : Date.now() + ms;
    const turnAtSchedule = key;
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      if (!this.game || this.turnKey !== turnAtSchedule) return;
      this.game.autoPlay(this.game.turn);
      this.turnKey = '';
      this.schedule();
      this.onChange(this);
    }, ms);
  }

  private async persistResult() {
    const g = this.game;
    if (!g) return;
    await saveGame({
      tableId: this.id,
      tableName: this.name,
      settings: this.settings,
      players: this.seats.map((s, seat) => ({
        seat,
        name: s?.name ?? '?',
        playerId: s?.playerId ?? null,
        isBot: !!s?.isBot,
      })),
      history: g.history,
      totals: g.totals(),
      finishedAt: new Date(),
    });
  }

  dispose() {
    this.clearTimers();
  }

  // ---------- görünümler ----------

  lobbyInfo(): LobbyTable {
    return {
      id: this.id,
      name: this.name,
      settings: this.settings,
      seated: this.seats.filter(Boolean).length,
      status: this.status,
    };
  }

  viewFor(playerId: string): TableView {
    const mySeat = this.seatOf(playerId);
    const g = this.game;
    return {
      id: this.id,
      name: this.name,
      settings: this.settings,
      youAreHost: this.hostId === playerId,
      mySeat: mySeat >= 0 ? mySeat : null,
      seats: this.seats.map((s) =>
        s ? { name: s.name, isBot: s.isBot, connected: s.connected, isYou: s.playerId === playerId } : null,
      ),
      status: this.status,
      nextHandIn: this.nextHandAt ? Math.max(0, this.nextHandAt - Date.now()) : null,
      game:
        g && mySeat >= 0
          ? g.view(mySeat, {
              names: this.seats.map((s) => s!.name),
              bots: this.seats.map((s) => !!s?.isBot),
              connected: this.seats.map((s) => !!s?.connected),
              deadlineIn: this.deadline ? Math.max(0, this.deadline - Date.now()) : null,
            })
          : null,
    };
  }
}

export function sanitizeSettings(raw: Partial<Settings> | undefined): Settings {
  const pick = <T,>(v: unknown, allowed: T[], def: T): T => (allowed.includes(v as T) ? (v as T) : def);
  const mode = pick<Settings['mode']>(raw?.mode, ['tekli', 'esli'], 'tekli');
  return {
    mode,
    katlamali: raw?.katlamali !== false,
    esKatlama: mode === 'esli' && !!raw?.esKatlama,
    hands: pick(raw?.hands, [5, 7, 9, 11], 9),
    turnSeconds: pick(raw?.turnSeconds, [30, 45, 60], 45),
  };
}

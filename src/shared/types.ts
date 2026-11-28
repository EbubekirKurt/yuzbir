// Oyun motoru, sunucu ve istemci arasında paylaşılan tipler.

export type Color = 'Y' | 'R' | 'K' | 'B'; // sarı, kırmızı, siyah (kara), mavi

export interface Tile {
  id: number;
  color: Color;
  num: number; // 1-13; sahte okeyde anlamsız (0)
  fake: boolean; // sahte okey
}

/** Bir taşın oyundaki yüzü (renk + sayı). */
export interface Face {
  color: Color;
  num: number;
}

export type MeldKind = 'run' | 'group' | 'pair';

export interface TableMeld {
  id: number;
  owner: number; // koltuk
  kind: MeldKind;
  tiles: Tile[];
  /** Her konumdaki taşın temsil ettiği yüz (okeyler için önemli). */
  reps: Face[];
}

export type GameMode = 'tekli' | 'esli';

export interface Settings {
  mode: GameMode;
  katlamali: boolean;
  esKatlama: boolean; // sadece eşli + katlamalı modda anlamlı
  hands: number; // 1-33
  turnSeconds: number; // 30 / 45 / 60
  /** İşlek taş ya da okey atmadan önce onay sorulsun mu (eski masalarda tanımsız = açık) */
  islekUyari?: boolean;
}

export interface Penalty {
  amount: number;
  reason: string;
}

export type OpenKind = 'seri' | 'cift';

export interface Opening {
  seat: number;
  kind: OpenKind;
  value: number; // seri toplamı ya da çift sayısı
}

export type RowStatus = 'bitti' | 'acti' | 'acmadi';

export interface HandRow {
  seat: number;
  status: RowStatus;
  openKind: OpenKind | null;
  openValue: number;
  remaining: number | null; // elde kalan sayı toplamı
  kat: number; // kalan puanına uygulanan çarpan
  base: number; // bitiş puanı / kalan puanı / açmama cezası
  penalties: Penalty[];
  baraj: boolean;
  total: number;
}

export interface HandResult {
  handNo: number;
  finisher: number | null;
  finishLabel: string;
  k: number;
  okeyName: string;
  rows: HandRow[];
}

export interface LogEntry {
  id: number;
  text: string;
  warn?: boolean;
}

export type Phase = 'draw' | 'play' | 'handEnd' | 'gameOver';

export interface PlayerPublic {
  seat: number;
  name: string;
  isBot: boolean;
  connected: boolean;
  avatar: string | null;
  handCount: number;
  opened: OpenKind | null;
  openValue: number;
}

export interface GameView {
  you: number;
  handNo: number;
  totalHands: number;
  phase: Phase;
  turn: number;
  /** Sıradaki hamle için kalan süre (ms), istemci kendi saatine çevirir. */
  deadlineIn: number | null;
  deckCount: number;
  gosterge: Tile;
  okey: Face;
  hand: Tile[];
  pendingLeftId: number | null;
  piles: { top: Tile | null; count: number }[];
  table: TableMeld[];
  openings: Opening[];
  players: PlayerPublic[];
  thresholds: { seri: number; cift: number };
  canDeclareGosterge: boolean;
  gostergeDeclared: boolean;
  gostergeTileId: number | null;
  extendCount: Record<string, number>;
  currentPenalties: Penalty[][];
  currentBaraj: boolean[];
  log: LogEntry[];
  history: HandResult[];
  totals: number[];
}

export interface SeatView {
  name: string;
  isBot: boolean;
  connected: boolean;
  isYou: boolean;
  avatar: string | null;
}

/** Davet linkiyle gelen oyuncuya masaya oturmadan önce gösterilen bilgi. */
export interface TablePeek {
  id: string;
  name: string;
  settings: Settings;
  status: 'waiting' | 'playing';
  seats: ({ name: string; isBot: boolean; avatar: string | null } | null)[];
}

export interface Me {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface TableView {
  id: string;
  name: string;
  settings: Settings;
  youAreHost: boolean;
  mySeat: number | null;
  seats: (SeatView | null)[];
  status: 'waiting' | 'playing';
  game: GameView | null;
  nextHandIn: number | null;
  chat: ChatMessage[];
}

export interface FriendInfo {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  online: boolean;
  tableId: string | null;
  tableName: string | null;
  tableStatus: 'waiting' | 'playing' | null;
}

export interface FriendsData {
  friends: FriendInfo[];
  incoming: FriendInfo[];
  outgoing: FriendInfo[];
}

export interface TableInvite {
  id: number;
  tableId: string;
  tableName: string;
  fromName: string;
  fromAvatar: string | null;
  settings: Settings;
}

export interface ChatMessage {
  id: number;
  seat: number;
  name: string;
  text: string;
  at: number;
}

export const REACTIONS = ['👏', '😂', '😮', '😡', '😭', '🔥', '👍', '🤝'] as const;

export interface LobbyTable {
  id: string;
  name: string;
  settings: Settings;
  seated: number;
  status: 'waiting' | 'playing';
}

export type GameAction =
  | { type: 'draw' }
  | { type: 'takeLeft' }
  | { type: 'cancelLeft' }
  | { type: 'open'; kind: OpenKind; groups: number[][] }
  | { type: 'lay'; groups: number[][] }
  | { type: 'extend'; tileId: number; meldId: number; side?: 'start' | 'end' }
  | { type: 'swapOkey'; tileId: number; meldId: number; pos: number }
  | { type: 'discard'; tileId: number }
  | { type: 'declareGosterge' };

export interface RadioStation {
  id: string;
  name: string;
  url: string;
  favicon: string | null;
  country: string;
  bitrate: number | null;
}

export interface RadioCategory {
  id: string;
  name: string;
  stations: RadioStation[];
}

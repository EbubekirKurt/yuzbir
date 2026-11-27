import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { analyzePair, analyzeSet, extendMeld } from '../../shared/melds';
import { face, faceName, handValue, isJoker, sameFace, tileName } from '../../shared/tiles';
import type { Face, GameAction, GameView, TableMeld, TableView, Tile } from '../../shared/types';
import { arrangeCift, arrangeSeri, layoutSlots, ROW, slotBlocks, sortTiles } from '../arrange';
import { Avatar } from '../components/Avatar';
import { FitBox } from '../components/FitBox';
import { Logo } from '../components/Stage';
import { TileView } from '../components/TileView';
import { sendAction, socket } from '../socket';
import { isLoneGosterge } from '../../shared/game';
import { ranking, ScoreModal } from './ScoreModal';

const AVATAR_BG = ['#FFB23F', '#9FD3FF', '#FFB3C7', '#BFD7FF'];

// Animasyon için sahnedeki (1920×1080) yaklaşık merkezler.
const DECK_XY = { x: 957, y: 307 };
const SEAT_XY = [
  { x: 841, y: 930 }, // ben (ıstaka)
  { x: 1527, y: 440 }, // sağ
  { x: 840, y: 121 }, // üst
  { x: 115, y: 440 }, // sol
];
const PILE_XY = [
  { x: 1370, y: 676 }, // benim attığım (sağ alt)
  { x: 1370, y: 203 }, // sağdakinin (sağ üst)
  { x: 297, y: 203 }, // üsttekinin (sol üst)
  { x: 297, y: 676 }, // soldakinin (sol alt)
];
function slotXY(i: number) {
  const row = i < ROW ? 0 : 1;
  const col = i % ROW;
  return { x: 330 + 4 + 14 + col * 66 + 31, y: 808 + 4 + 10 + row * 108 + 46 };
}

interface Flight {
  id: number;
  tile: Tile | null; // null: kapalı taş
  from: { x: number; y: number };
  to: { x: number; y: number };
}
let flightId = 0;

function initialSlots(hand: Tile[], okey: Face) {
  return layoutSlots({ blocks: [], rest: sortTiles(hand, okey).map((t) => t.id) });
}

export function GameScreen({ table }: { table: TableView }) {
  const g = table.game!;
  const me = g.you;
  const okey = g.okey;
  const tilesById = useMemo(() => new Map(g.hand.map((t) => [t.id, t])), [g.hand]);

  const [slots, setSlots] = useState<(number | null)[]>(() => initialSlots(g.hand, okey));
  const [selected, setSelected] = useState<number | null>(null);
  const [okeyWhite, setOkeyWhite] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: number; startX: number; startY: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreTab, setScoreTab] = useState('genel');
  const [flash, setFlash] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const handNoRef = useRef(g.handNo);
  const modalHandRef = useRef(g.handNo);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [arriving, setArriving] = useState<number | null>(null);
  const prevGameRef = useRef<GameView | null>(null);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const historyRef = useRef(g.history.length);

  // Süre göstergesi için yerel son tarih.
  const deadline = useMemo(() => (g.deadlineIn !== null ? Date.now() + g.deadlineIn : null), [table]);
  const nextHandAt = useMemo(() => (table.nextHandIn !== null ? Date.now() + table.nextHandIn : null), [table]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Eldeki taşlar değişince ıstakayı güncelle (yerleşim korunur, yeni taş en sağa).
  const handKey = g.hand.map((t) => t.id).sort((a, b) => a - b).join(',');
  useEffect(() => {
    setSlots((prev) => {
      if (handNoRef.current !== g.handNo) {
        handNoRef.current = g.handNo;
        setOkeyWhite(false);
        return initialSlots(g.hand, okey);
      }
      const ids = new Set(g.hand.map((t) => t.id));
      const nextSlots = prev.map((id) => (id !== null && ids.has(id) ? id : null));
      const placed = new Set(nextSlots.filter((x): x is number => x !== null));
      for (const t of g.hand) {
        if (placed.has(t.id)) continue;
        const i = nextSlots.lastIndexOf(null);
        if (i < 0) break;
        nextSlots[i] = t.id;
      }
      return nextSlots;
    });
    setSelected((s) => (s !== null && g.hand.some((t) => t.id === s) ? s : null));
  }, [handKey, g.handNo]);

  // Taş hareketlerini animasyonla göster: desteden çekme, atma, soldan alma.
  useEffect(() => {
    const prev = prevGameRef.current;
    prevGameRef.current = g;
    if (!prev || prev.handNo !== g.handNo) return;
    const rel = (seat: number) => (seat - me + 4) % 4;
    const add: Flight[] = [];
    if (g.deckCount === prev.deckCount - 1) {
      const drawer = g.turn;
      if (drawer === me) {
        const prevIds = new Set(prev.hand.map((t) => t.id));
        const fresh = g.hand.find((t) => !prevIds.has(t.id)) ?? null;
        // Yeni taş, ıstakadaki en sağdaki boş yere konur.
        const ids = new Set(g.hand.map((t) => t.id));
        const target = slotsRef.current.map((id) => (id !== null && ids.has(id) ? id : null)).lastIndexOf(null);
        add.push({ id: ++flightId, tile: fresh, from: DECK_XY, to: target >= 0 ? slotXY(target) : SEAT_XY[0] });
        if (fresh) setArriving(fresh.id);
      } else {
        add.push({ id: ++flightId, tile: null, from: DECK_XY, to: SEAT_XY[rel(drawer)] });
      }
    }
    for (let s = 0; s < 4; s++) {
      const before = prev.piles[s].count;
      const after = g.piles[s].count;
      if (after === before + 1 && g.piles[s].top && prev.pendingLeftId !== g.piles[s].top!.id) {
        add.push({ id: ++flightId, tile: g.piles[s].top, from: SEAT_XY[rel(s)], to: PILE_XY[rel(s)] });
      } else if (after === before - 1 && prev.piles[s].top) {
        const taker = (s + 1) % 4;
        add.push({ id: ++flightId, tile: prev.piles[s].top, from: PILE_XY[rel(s)], to: SEAT_XY[rel(taker)] });
      }
    }
    if (!add.length) return;
    setFlights((f) => [...f, ...add]);
    const ids = new Set(add.map((f) => f.id));
    setTimeout(() => {
      setFlights((f) => f.filter((x) => !ids.has(x.id)));
      setArriving(null);
    }, 600);
  }, [table]);

  // El bitince puan tablosunu o elin sekmesiyle aç.
  useEffect(() => {
    if (g.history.length > historyRef.current) {
      historyRef.current = g.history.length;
      setScoreTab(g.phase === 'gameOver' ? 'genel' : String(g.history[g.history.length - 1].handNo));
      setScoreOpen(true);
    }
    if ((g.phase === 'draw' || g.phase === 'play') && modalHandRef.current !== g.handNo) {
      modalHandRef.current = g.handNo;
      setScoreOpen(false);
    }
  }, [g.history.length, g.phase, g.handNo]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(id);
  }, [flash]);

  const act = (a: GameAction) => sendAction(a);
  const myTurn = g.turn === me && (g.phase === 'draw' || g.phase === 'play');
  const canPlay = myTurn && g.phase === 'play';
  const canDraw = myTurn && g.phase === 'draw';
  const mine = g.players[me];
  const opened = mine.opened;
  const selectedTile = selected !== null ? tilesById.get(selected) : undefined;

  // Istakadaki gruplar ve açılış değerleri
  const blocks = slotBlocks(slots).map((ids) => ids.map((id) => tilesById.get(id)).filter((t): t is Tile => !!t));
  const seriBlocks = blocks.filter((b) => b.length >= 3 && analyzeSet(b, okey));
  const seriTotal = seriBlocks.reduce((s, b) => s + analyzeSet(b, okey)!.value, 0);
  const isGostergePair = (b: Tile[]) =>
    g.gostergeDeclared && g.gostergeTileId !== null && b.length === 2 && b.some((t) => t.id === g.gostergeTileId);
  const pairBlocks = blocks.filter((b) => b.length === 2 && (analyzePair(b, okey) || isGostergePair(b)));
  const gostergeExtra =
    g.gostergeDeclared && g.gostergeTileId !== null && tilesById.has(g.gostergeTileId) &&
    !pairBlocks.some((b) => b.some((t) => t.id === g.gostergeTileId))
      ? 1
      : 0;
  const pairCount = pairBlocks.length + gostergeExtra;
  // Açtıktan sonra indirilebilecek gruplar: seri perler; çiftle açan için çiftler de.
  const layable = opened
    ? opened === 'cift'
      ? // Çiftle açan yeni seri per indiremez, sadece çift indirir.
        blocks.filter((b) => b.length === 2 && (analyzePair(b, okey) || isGostergePair(b)))
      : blocks.filter((b) => b.length >= 3 && analyzeSet(b, okey))
    : [];
  // Elindeki taşların ceza değeri (okey 101; çiftle açtıysan 2 katı).
  const handPoints = g.hand.reduce((s, t) => s + handValue(t, okey), 0) * (opened === 'cift' ? 2 : 1);
  const layableTotal = layable.reduce((s, b) => s + (b.length >= 3 ? analyzeSet(b, okey)!.value : 0), 0);

  const moveTile = (id: number, to: number) => {
    setSlots((prev) => {
      const from = prev.indexOf(id);
      if (from < 0 || from === to) return prev;
      const n = [...prev];
      const occupant = n[to];
      n[to] = id;
      n[from] = occupant ?? null;
      return n;
    });
  };

  const openSeri = () => {
    if (!seriBlocks.length) return setFlash('Istakada geçerli seri per yok. Perleri aralarında boşluk bırakarak diz.');
    const groups = seriBlocks.map((b) => b.map((t) => t.id));
    if (seriTotal < g.thresholds.seri) {
      const okGo = window.confirm(`Seri toplamın ${seriTotal}, en az ${g.thresholds.seri} gerekli. Yine de açarsan hatalı açma sayılır ve 101 ceza yazılır. Devam edilsin mi?`);
      if (!okGo) return;
    }
    act({ type: 'open', kind: 'seri', groups });
  };

  const openCift = () => {
    const groups = pairBlocks.map((b) => b.map((t) => t.id));
    if (gostergeExtra && g.gostergeTileId !== null) groups.push([g.gostergeTileId]);
    if (!groups.length) return setFlash('Istakada çift yok. Çiftleri ikişer ikişer, aralarında boşlukla diz.');
    if (pairCount < g.thresholds.cift) {
      const okGo = window.confirm(`${pairCount} çiftin var, en az ${g.thresholds.cift} gerekli. Yine de açarsan hatalı açma sayılır ve 101 ceza yazılır. Devam edilsin mi?`);
      if (!okGo) return;
    }
    act({ type: 'open', kind: 'cift', groups });
  };

  const layMelds = () => {
    if (selected === null) {
      if (!layable.length) return setFlash('Istakada indirilecek geçerli per yok. Peri aralarında boşluk bırakarak diz.');
      act({ type: 'lay', groups: layable.map((b) => b.map((t) => t.id)) });
      return;
    }
    const block = blocks.find((b) => b.some((t) => t.id === selected));
    if (!block) return setFlash('İndirmek istediğin grubun bir taşını seç.');
    if (opened === 'cift' && block.length > 2)
      return setFlash('Çiftle açtığın için yeni seri per indiremezsin; taşları masadaki serilere işleyebilirsin.');
    if (opened === 'seri' && block.length <= 2 && !g.openings.some((o) => o.kind === 'cift'))
      return setFlash('Çift indirebilmek için önce masada birinin çiftle açmış olması gerekir.');
    const valid = block.length === 2 ? analyzePair(block, okey) || isGostergePair(block) : analyzeSet(block, okey);
    if (!valid) return setFlash('Seçili grup geçerli bir per ya da çift değil.');
    act({ type: 'lay', groups: [block.map((t) => t.id)] });
  };

  const discardSelected = () => {
    if (selected === null) return;
    act({ type: 'discard', tileId: selected });
    setSelected(null);
  };

  const arrange = (kind: 'seri' | 'cift') => {
    const arr = kind === 'seri' ? arrangeSeri(g.hand, okey) : arrangeCift(g.hand, okey);
    setSlots(layoutSlots(arr));
  };

  // ---------- masa ----------
  const rel = (seat: number) => (seat - me + 4) % 4;
  const seatAt = (r: number) => (me + r) % 4;
  const leftSeat = seatAt(3);
  const leftTop = g.piles[leftSeat].top;

  const canWorkTable = canPlay && !!opened && !!selectedTile;
  const plusFor = (m: TableMeld, side: 'start' | 'end') => {
    if (!canWorkTable || !selectedTile) return false;
    if (isLoneGosterge(m)) return side === 'end' && m.owner === me;
    const ext = extendMeld(m, selectedTile, okey, side);
    if (!ext || ext.side !== side) return false;
    return (g.extendCount[`${m.id}:${side}`] ?? 0) < 2;
  };
  const swapTarget = (m: TableMeld, idx: number) =>
    canWorkTable && !!selectedTile && !(m.kind === 'group' && m.tiles.length < 4) && isJoker(m.tiles[idx], okey) && !isJoker(selectedTile, okey) && sameFace(face(selectedTile, okey), m.reps[idx]);

  const renderMeld = (m: TableMeld) => (
    <div key={m.id} className="meld-row">
      {m.kind === 'run' && plusFor(m, 'start') && (
        <button className="plus" aria-label="Başa işle" onClick={() => act({ type: 'extend', tileId: selected!, meldId: m.id, side: 'start' })}>+</button>
      )}
      {m.tiles.map((t, i) =>
        swapTarget(m, i) ? (
          <TileView key={t.id} tile={t} okey={okey} white size="sm" target label="Okeyi al" onClick={() => act({ type: 'swapOkey', tileId: selected!, meldId: m.id, pos: i })} />
        ) : (
          <TileView
            key={t.id}
            tile={t}
            okey={okey}
            size="sm"
            white={isJoker(t, okey)}
            label={isJoker(t, okey) ? `okey, ${faceName(m.reps[i])} yerine` : undefined}
          />
        ),
      )}
      {(m.kind !== 'pair' || isLoneGosterge(m)) && plusFor(m, 'end') && (
        <button className="plus" aria-label="Sona işle" onClick={() => act({ type: 'extend', tileId: selected!, meldId: m.id, side: 'end' })}>+</button>
      )}
    </div>
  );

  // Bütün perler masaya açılış sırasıyla alt alta eklenir; alan dolunca sağdaki sütuna geçer.
  const ZONE_ROWS = 7; // 424px yüksekliğe 50px'lik 7 sıra sığar
  const seriesMelds = g.table.filter((m) => m.kind !== 'pair');
  const pairMelds = g.table.filter((m) => m.kind === 'pair');

  const timeLeft = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const timeFrac = deadline && g.deadlineIn ? Math.max(0, Math.min(1, (deadline - now) / (table.settings.turnSeconds * 1000))) : 0;

  let hint: string;
  if (flash) hint = flash;
  else if (g.phase === 'handEnd') hint = 'El bitti';
  else if (g.phase === 'gameOver') hint = 'Oyun bitti';
  else if (!myTurn) hint = `Sıra ${g.players[g.turn].name}'de`;
  else if (g.phase === 'draw') hint = 'Sıra sende · Desteden çek ya da soldan al';
  else if (g.deckCount === 0) hint = 'Destenin son taşını çektin · Taşını atınca el biter';
  else if (g.pendingLeftId !== null) hint = 'Soldan aldığın taşla aç ya da geri koy';
  else if (opened && layable.length) hint = `Istakanda ${layable.length} yeni per var · "Perleri indir" ile masaya koy`;
  else hint = opened ? 'İşle, per indir ya da taşını at' : 'Aç ya da bir taş seçip at';

  const pileSpot: Record<number, React.CSSProperties> = {
    0: { right: 14, bottom: 12 },
    1: { right: 14, top: 12 },
    2: { left: 14, top: 12 },
    3: { left: 14, bottom: 12 },
  };

  // ---------- ıstakada sürükleme (fare, dokunmatik ve kalemle aynı çalışır) ----------
  const toStage = (clientX: number, clientY: number) => {
    const el = document.querySelector('.stage') as HTMLElement | null;
    if (!el) return { x: clientX, y: clientY };
    const r = el.getBoundingClientRect();
    const scale = r.width / 1920 || 1;
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  };
  const dropTargetAt = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const slot = el?.closest('[data-slot]') as HTMLElement | null;
    if (slot) return { slot: Number(slot.dataset.slot) };
    if (el?.closest('[data-discard]')) return { discard: true };
    return null;
  };
  const onTilePointerDown = (id: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, active: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onTilePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
      d.active = true;
    }
    setDrag({ id: d.id, ...toStage(e.clientX, e.clientY) });
    const target = dropTargetAt(e.clientX, e.clientY);
    setDragOver(target && 'slot' in target ? target.slot! : null);
  };
  const endDrag = (e: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d?.active) return; // sürükleme olmadı: normal tıklama
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    setDrag(null);
    setDragOver(null);
    if (cancelled) return;
    const target = dropTargetAt(e.clientX, e.clientY);
    if (target && 'slot' in target) moveTile(d.id, target.slot!);
    else if (target && 'discard' in target && canPlay) {
      act({ type: 'discard', tileId: d.id });
      setSelected(null);
    }
  };
  const dragTile = drag ? tilesById.get(drag.id) : undefined;

  const opponent = (r: 1 | 2 | 3) => {
    const seat = seatAt(r);
    const p = g.players[seat];
    const isTurn = g.turn === seat && (g.phase === 'draw' || g.phase === 'play');
    const status = !p.connected
      ? 'Bağlantı koptu'
      : p.opened
        ? p.opened === 'seri'
          ? `Seri ${p.openValue} ile açtı`
          : `${p.openValue} çift ile açtı`
        : `Açmadı · ${p.handCount} taş`;
    const style: React.CSSProperties =
      r === 2
        ? { left: 710, top: 86, width: 260, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }
        : { left: r === 3 ? 30 : 1452, top: 360, width: r === 3 ? 170 : 150, padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 };
    return (
      <div className={`opponent ${isTurn ? 'turn' : ''}`} style={style}>
        <Avatar url={p.avatar} name={p.name} size={r === 2 ? 46 : 58} bg={AVATAR_BG[seat]} isBot={p.isBot} dim={!p.connected} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: r === 2 ? 'flex-start' : 'center', gap: 4, flex: r === 2 ? 1 : undefined, width: r === 2 ? undefined : '100%' }}>
          <span className="who">{p.name}{table.settings.mode === 'esli' && r === 2 ? ' (eşin)' : ''}</span>
          <span className={`st ${p.opened ? 'open' : ''}`}>{status}</span>
          {p.opened && (
            <span className="left-badge" aria-label={`Elinde ${p.handCount} taş kaldı`}>
              <b>{p.handCount}</b> taş kaldı
            </span>
          )}
          {isTurn && !p.isBot && deadline && (
            <div className="timebar" aria-hidden="true"><div style={{ width: `${timeFrac * 100}%` }} /></div>
          )}
        </div>
      </div>
    );
  };

  const totalsRank = ranking(g.totals);
  const lastHand = g.history[g.history.length - 1];
  const winnerSeat = totalsRank.indexOf(1);

  return (
    <>
      <div className="topbar">
        <Logo />
        <span className="chip white">El {g.handNo} / {g.totalHands}</span>
        <span className="chip">{table.settings.mode === 'esli' ? 'Eşli' : 'Tekli'}</span>
        <span className="chip">{table.settings.katlamali ? 'Katlamalı' : 'Katlamasız'}</span>
        <span className="chip">{table.settings.turnSeconds} sn</span>
        {(g.phase === 'draw' || g.phase === 'play') && (
          <span className={`chip turn-chip ${myTurn ? 'mine' : ''}`} role="status" aria-live="polite">
            <Avatar url={g.players[g.turn].avatar} name={g.players[g.turn].name} size={30} bg={AVATAR_BG[g.turn]} isBot={g.players[g.turn].isBot} />
            <span className="who">{myTurn ? 'Sıra sende' : `Sıra: ${g.players[g.turn].name}`}</span>
            {timeLeft !== null && <span className="secs">{timeLeft} sn</span>}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          <button className="btn danger" onClick={() => { if (window.confirm('Masadan çıkmak istiyor musun? Hamlelerin otomatik oynanır.')) socket.emit('table:leave'); }}>
            Masadan çık
          </button>
        </div>
      </div>

      {/* ---------- masa ---------- */}
      <div className="felt">
        <div className="banner">
          <span className="k">Açma sınırı</span>
          <span>Seri {g.thresholds.seri}</span>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--chip)' }} />
          <span>Çift {g.thresholds.cift}</span>
        </div>

        <FitBox className="zone-series">
          <div className="meld-grid" style={{ gridTemplateRows: `repeat(${Math.max(1, Math.min(ZONE_ROWS, seriesMelds.length))}, 50px)` }}>
            {seriesMelds.map(renderMeld)}
          </div>
        </FitBox>

        <div className="center-col">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div className="deck">
              <div className="layer" style={{ left: 8, top: 0 }} />
              <div className="layer" style={{ left: 4, top: 6 }} />
              <button
                className={canDraw ? 'can' : ''}
                aria-label={`Desteden taş çek, ${g.deckCount} taş kaldı`}
                disabled={!canDraw || g.deckCount === 0}
                onClick={() => act({ type: 'draw' })}
              >
                {g.deckCount}
              </button>
            </div>
            <span className="felt-label">Deste</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <TileView tile={g.gosterge} size="md" rotate={-6} label={`Gösterge: ${tileName(g.gosterge)}`} />
            <span className="felt-label">Gösterge</span>
          </div>
          <div className="okey-chip">Okey: {faceName(okey)}</div>
        </div>

        <FitBox className="zone-pairs">
          <div className="pair-grid" style={{ gridTemplateRows: `repeat(${Math.max(1, Math.min(ZONE_ROWS, pairMelds.length))}, 50px)` }}>
            {pairMelds.map(renderMeld)}
          </div>
        </FitBox>

        {[0, 1, 2, 3].map((r) => {
          const seat = seatAt(r);
          const pile = g.piles[seat];
          const isLeft = r === 3;
          const canTake = isLeft && canDraw && !!leftTop;
          const isMine = r === 0;
          return (
            <div
              key={r}
              className="pile"
              style={{ ...pileSpot[r], flexDirection: isLeft ? 'row' : 'column', alignItems: isLeft ? 'flex-end' : 'center', gap: isLeft ? 10 : 4 }}
              data-discard={isMine ? '' : undefined}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div className={isMine && canPlay ? 'drop' : ''}>
                  {pile.top ? (
                    <TileView
                      tile={pile.top}
                      okey={okey}
                      white={isJoker(pile.top, okey)}
                      size="md"
                      rotate={[5, -7, 8, -4][r]}
                      target={canTake}
                      onClick={canTake ? () => act({ type: 'takeLeft' }) : isMine && canPlay && selected !== null ? discardSelected : undefined}
                      label={canTake ? `Soldan ${tileName(pile.top)} al` : undefined}
                    />
                  ) : isMine && canPlay && selected !== null ? (
                    <button className="empty" style={{ background: 'transparent', cursor: 'pointer' }} aria-label="Seçili taşı at" onClick={discardSelected} />
                  ) : (
                    <div className="empty" />
                  )}
                </div>
                <span className="cap">{isMine ? 'Senin attığın' : `${g.players[seat].name} attı`}</span>
              </div>
              {canTake && <span className="take-chip" style={{ marginBottom: 28 }}>{opened ? 'Soldan al' : 'Soldan al → aynı tur açmalısın'}</span>}
            </div>
          );
        })}
      </div>

      {opponent(2)}
      {opponent(3)}
      {opponent(1)}

      <div className="turn-hint" role="status">{hint}</div>

      <div className={`card me-panel ${myTurn ? 'turn' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            className="ring"
            role="img"
            aria-label={myTurn && timeLeft !== null ? `Kalan süre ${timeLeft} saniye` : 'Sıra sende değil'}
            style={{ background: myTurn ? `conic-gradient(#FFB23F 0 ${timeFrac * 100}%, var(--track) ${timeFrac * 100}% 100%)` : 'var(--track)' }}
          >
            <div className="inner">
              {myTurn && timeLeft !== null ? (
                <>
                  <span className="baloo" style={{ fontWeight: 800, fontSize: 26 }}>{timeLeft}</span>
                  <span style={{ fontWeight: 800, fontSize: 11 }}>sn</span>
                </>
              ) : (
                <Avatar url={mine.avatar} name={mine.name} size={62} bg="var(--orange)" />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontWeight: 900, fontSize: 19, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mine.name}</span>
            <span className={`st ${opened ? 'open' : ''}`}>
              {opened ? (opened === 'seri' ? `Seri ${mine.openValue} ile açtın` : `${mine.openValue} çift ile açtın`) : 'Henüz açmadın'}
            </span>
          </div>
        </div>
        <div className="stat-list">
          {!opened ? (
            <>
              <div className="stat">
                <span>Seri toplamın</span>
                <b className={seriTotal >= g.thresholds.seri ? 'ok' : ''}>{seriTotal} / {g.thresholds.seri}</b>
              </div>
              <div className="stat">
                <span>Çiftlerin</span>
                <b className={pairCount >= g.thresholds.cift ? 'ok' : ''}>{pairCount} / {g.thresholds.cift}</b>
              </div>
            </>
          ) : (
            <div className="stat">
              <span>İndirilebilir</span>
              <b>{layable.length} per{layableTotal ? ` · ${layableTotal}` : ''}</b>
            </div>
          )}
          <div className="stat">
            <span>Elinde</span>
            <b>{g.hand.length} taş · {handPoints} puan</b>
          </div>
        </div>
        <span className="hint" style={{ fontSize: 13 }}>Okeye çift tıkla, beyaz olsun</span>
      </div>

      {/* ---------- ıstaka ---------- */}
      <div className="rack">
        {[0, 1].map((row) => (
          <div key={row} className="rack-row">
            {slots.slice(row * ROW, (row + 1) * ROW).map((id, k) => {
              const i = row * ROW + k;
              const tile = id !== null ? tilesById.get(id) : undefined;
              return (
                <div
                  key={i}
                  className={`slot ${dragOver === i ? 'over' : ''} ${!tile && selected !== null ? 'empty-click' : ''}`}
                  data-slot={i}
                  onClick={!tile && selected !== null ? () => moveTile(selected, i) : undefined}
                >
                  {tile && (
                    <TileView
                      tile={tile}
                      okey={okey}
                      selected={selected === tile.id}
                      white={okeyWhite && isJoker(tile, okey)}
                      pending={g.pendingLeftId === tile.id}
                      arriving={arriving === tile.id}
                      dim={drag?.id === tile.id}
                      onPointerDown={onTilePointerDown(tile.id)}
                      onPointerMove={onTilePointerMove}
                      onPointerUp={(e) => endDrag(e, false)}
                      onPointerCancel={(e) => endDrag(e, true)}
                      onClick={() => {
                        if (suppressClick.current) return;
                        setSelected((s) => (s === tile.id ? null : tile.id));
                      }}
                      onDoubleClick={() => {
                        if (isJoker(tile, okey)) setOkeyWhite((w) => !w);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ---------- sağ panel ---------- */}
      <div className="side-col">
      <div className="card score-mini">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2>Puan tablosu</h2>
          <button className="icon-btn" aria-label="Puan tablosunu büyüt" onClick={() => { setScoreTab('genel'); setScoreOpen(true); }}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
            </svg>
          </button>
        </div>
        <div role="table" aria-label="Puan özeti">
          <div className="mini-row head" role="row">
            <span role="columnheader">Oyuncu</span>
            <span role="columnheader">Son el</span>
            <span role="columnheader">Top.</span>
          </div>
          {g.players.map((p) => (
            <div key={p.seat} className="mini-row" role="row">
              <span role="rowheader">{p.seat === me ? 'Sen' : p.name}</span>
              <span role="cell">{lastHand ? lastHand.rows[p.seat].total : '—'}</span>
              <span role="cell" style={{ fontWeight: 900 }}>{g.totals[p.seat]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card log-card">
        <h2>Masa akışı</h2>
        <div className="log-list">
          {[...g.log].reverse().map((l) => (
            <div key={l.id} className={`log-item ${l.warn ? 'warn' : ''}`}>{l.text}</div>
          ))}
        </div>
      </div>
      </div>

      <div className="side actions">
        {!opened ? (
          <>
            <button className="btn stack" disabled={!canPlay} onClick={openSeri}>
              Seri Aç<span className="sub">{seriTotal} / {g.thresholds.seri}</span>
            </button>
            <button className="btn stack" disabled={!canPlay} onClick={openCift}>
              Çift Aç<span className="sub">{pairCount} / {g.thresholds.cift} çift</span>
            </button>
          </>
        ) : (
          <button
            className="btn wide"
            disabled={!canPlay || (selected === null && layable.length === 0)}
            onClick={layMelds}
            title="Taş seçiliyse o grubu, seçili değilse ıstakadaki bütün geçerli perleri masaya indirir"
          >
            {selected !== null ? 'Seçili grubu indir' : `Perleri indir${layable.length ? ` (${layable.length})` : ''}`}
          </button>
        )}
        <button className="btn" onClick={() => arrange('seri')}>Seri Diz</button>
        <button className="btn" onClick={() => arrange('cift')}>Çift Diz</button>
        {g.pendingLeftId !== null ? (
          <button className="btn wide" onClick={() => act({ type: 'cancelLeft' })}>Soldan aldığımı geri koy</button>
        ) : g.canDeclareGosterge ? (
          <button className="btn wide go" onClick={() => act({ type: 'declareGosterge' })}>Göstergeyi bildir</button>
        ) : (
          <button className="btn wide" disabled={!canDraw || g.deckCount === 0} onClick={() => act({ type: 'draw' })}>Desteden çek</button>
        )}
        <button className="btn primary wide big" disabled={!canPlay || selected === null} onClick={discardSelected}>
          {selectedTile ? `At: ${tileName(selectedTile)}` : 'Atmak için taş seç'}
        </button>
      </div>

      {drag && dragTile && (
        <div className="drag-ghost" style={{ left: drag.x - 29, top: drag.y - 40 }} aria-hidden="true">
          <TileView tile={dragTile} okey={okey} white={okeyWhite && isJoker(dragTile, okey)} />
        </div>
      )}

      {flights.map((f) => (
        <div
          key={f.id}
          className="flight"
          aria-hidden="true"
          style={{
            ['--fx' as string]: `${f.from.x - 23}px`,
            ['--fy' as string]: `${f.from.y - 33}px`,
            ['--tx' as string]: `${f.to.x - 23}px`,
            ['--ty' as string]: `${f.to.y - 33}px`,
          }}
        >
          {f.tile ? <TileView tile={f.tile} okey={okey} size="md" white={isJoker(f.tile, okey) && (PILE_XY.includes(f.to) || PILE_XY.includes(f.from))} /> : <div className="tile md back" />}
        </div>
      ))}

      {scoreOpen && (
        <ScoreModal
          game={g}
          settings={table.settings}
          tab={scoreTab}
          onTab={setScoreTab}
          onClose={g.phase === 'gameOver' ? undefined : () => setScoreOpen(false)}
          banner={
            g.phase === 'handEnd' && lastHand ? (
              <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: 'none', background: 'var(--chip)', color: 'var(--on-accent)' }}>
                <span className="baloo" style={{ fontWeight: 800, fontSize: 24 }}>
                  El {lastHand.handNo} bitti: {lastHand.finisher === null ? 'deste bitti' : `${g.players[lastHand.finisher].name} bitirdi`} ({lastHand.finishLabel.toLowerCase()})
                </span>
                {nextHandAt && (
                  <span style={{ marginLeft: 'auto', fontWeight: 800 }}>
                    Sonraki el {Math.max(0, Math.ceil((nextHandAt - now) / 1000))} sn içinde
                  </span>
                )}
              </div>
            ) : g.phase === 'gameOver' ? (
              <div className="card" style={{ padding: '14px 20px', boxShadow: 'none', background: 'var(--good-bg)', color: 'var(--on-accent)' }}>
                <span className="baloo" style={{ fontWeight: 800, fontSize: 26 }}>
                  Oyun bitti! Kazanan: {table.settings.mode === 'esli'
                    ? (g.totals[0] + g.totals[2] === g.totals[1] + g.totals[3]
                      ? 'berabere'
                      : g.totals[0] + g.totals[2] < g.totals[1] + g.totals[3]
                        ? `${g.players[0].name} + ${g.players[2].name}`
                        : `${g.players[1].name} + ${g.players[3].name}`)
                    : totalsRank.filter((x) => x === 1).length > 1
                      ? 'berabere'
                      : g.players[winnerSeat].name}
                </span>
              </div>
            ) : undefined
          }
          footer={
            g.phase === 'gameOver' ? (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => socket.emit('table:leave')}>Lobiye dön</button>
                {table.youAreHost && (
                  <button className="btn go" onClick={() => socket.emit('table:restart')}>Yeni oyun</button>
                )}
              </div>
            ) : undefined
          }
        />
      )}
    </>
  );
}

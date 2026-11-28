import type { PointerEvent } from 'react';
import { isJoker } from '../../shared/tiles';
import type { Face, Tile } from '../../shared/types';

const COLOR_VAR: Record<string, string> = {
  Y: 'var(--c-Y)',
  R: 'var(--c-R)',
  K: 'var(--c-K)',
  B: 'var(--c-B)',
};
const NAMES: Record<string, string> = { Y: 'sarı', R: 'kırmızı', K: 'siyah', B: 'mavi' };

function Star({ size, fill }: { size: number; fill: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="#3B2A1A" strokeWidth="1.2" strokeLinejoin="round">
      <path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z" />
    </svg>
  );
}

export interface TileProps {
  tile: Tile;
  okey?: Face;
  size?: 'lg' | 'md' | 'sm';
  selected?: boolean;
  white?: boolean; // işaretlenmiş okey
  target?: boolean;
  pending?: boolean;
  ghost?: boolean; // masada işlenebilecek yerde gösterilen soluk taş
  arriving?: boolean; // desteden yeni gelen taş: uçuş animasyonu bitince görünür
  rotate?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
  /** Işaretçiyle sürükleme (fare, dokunmatik, kalem). */
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (e: PointerEvent<HTMLButtonElement>) => void;
  dim?: boolean; // sürüklenirken yerinde soluk görünür
  label?: string;
}

export function TileView(p: TileProps) {
  const { tile } = p;
  const size = p.size ?? 'lg';
  const cls = ['tile', size === 'lg' ? '' : size, p.selected ? 'selected' : '', p.white ? 'white' : '', p.target ? 'target' : '', p.pending ? 'pending' : '', p.arriving ? 'arrive' : '', p.ghost ? 'ghost' : '']
    .filter(Boolean)
    .join(' ');
  const starSize = size === 'lg' ? 34 : size === 'md' ? 26 : 20;
  const name = tile.fake
    ? 'sahte okey'
    : `${NAMES[tile.color]} ${tile.num}${p.okey && isJoker(tile, p.okey) && p.white ? ', okey' : ''}`;
  const content = p.white ? (
    <>
      <Star size={starSize - 4} fill="#E0A100" />
      <span className="okey-label">OKEY</span>
    </>
  ) : tile.fake ? (
    <Star size={starSize} fill="#1F6B50" />
  ) : (
    <>
      <span className={`n c-${tile.color}`} style={{ color: COLOR_VAR[tile.color] }}>{tile.num}</span>
      <span className="dot" style={{ background: COLOR_VAR[tile.color] }} />
    </>
  );
  const style: React.CSSProperties = {
    ...(p.rotate ? { transform: `rotate(${p.rotate}deg)` } : {}),
    ...(p.onPointerDown ? { touchAction: 'none' } : {}),
    ...(p.dim ? { opacity: 0.3 } : {}),
  };
  if (p.onClick || p.onDoubleClick || p.onPointerDown) {
    return (
      <button
        type="button"
        className={cls}
        style={style}
        aria-label={p.label ?? name}
        aria-pressed={p.selected}
        onClick={p.onClick}
        onDoubleClick={p.onDoubleClick}
        draggable={false}
        onPointerDown={p.onPointerDown}
        onPointerMove={p.onPointerMove}
        onPointerUp={p.onPointerUp}
        onPointerCancel={p.onPointerCancel}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={cls} style={style} role="img" aria-label={p.label ?? name}>
      {content}
    </div>
  );
}

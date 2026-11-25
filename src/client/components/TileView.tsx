import type { DragEvent } from 'react';
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
  rotate?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  label?: string;
}

export function TileView(p: TileProps) {
  const { tile } = p;
  const size = p.size ?? 'lg';
  const cls = ['tile', size === 'lg' ? '' : size, p.selected ? 'selected' : '', p.white ? 'white' : '', p.target ? 'target' : '', p.pending ? 'pending' : '']
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
      <span className="n" style={{ color: COLOR_VAR[tile.color] }}>{tile.num}</span>
      <span className="dot" style={{ background: COLOR_VAR[tile.color] }} />
    </>
  );
  const style = p.rotate ? { transform: `rotate(${p.rotate}deg)` } : undefined;
  if (p.onClick || p.onDoubleClick || p.draggable) {
    return (
      <button
        type="button"
        className={cls}
        style={style}
        aria-label={p.label ?? name}
        aria-pressed={p.selected}
        onClick={p.onClick}
        onDoubleClick={p.onDoubleClick}
        draggable={p.draggable}
        onDragStart={p.onDragStart}
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

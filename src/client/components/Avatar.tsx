/** Profil fotoğrafı; yoksa adın baş harfi. */
export function Avatar(props: { url: string | null; name: string; size: number; bg?: string; isBot?: boolean; dim?: boolean }) {
  const { size } = props;
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.45),
    background: props.bg ?? '#9FD3FF',
    opacity: props.dim ? 0.5 : 1,
    overflow: 'hidden',
  };
  if (props.url) {
    return (
      <div className="avatar" style={style}>
        <img src={props.url} alt="" width={size} height={size} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  if (props.isBot) {
    return (
      <div className="avatar" style={{ ...style, background: props.bg ?? '#BFD7FF' }} aria-hidden="true">
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#3B2A1A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="8" width="16" height="12" rx="3" />
          <path d="M12 4v4" />
          <path d="M9 13h.01M15 13h.01" />
        </svg>
      </div>
    );
  }
  return (
    <div className="avatar" style={style} aria-hidden="true">
      {props.name.slice(0, 1).toLocaleUpperCase('tr')}
    </div>
  );
}

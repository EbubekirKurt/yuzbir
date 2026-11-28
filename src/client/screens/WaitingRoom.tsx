import { useState } from 'react';
import type { TableView } from '../../shared/types';
import { Avatar } from '../components/Avatar';
import { InviteFriends } from '../components/Friends';
import { Logo } from '../components/Stage';
import { socket } from '../socket';
import { rulesSummary } from './CreateTable';
import { settingsText } from './Lobby';

/** Koltukların masa etrafındaki yeri: benim koltuğum altta. */
const POS = [
  { left: 230, top: 330 }, // alt
  { left: 470, top: 175 }, // sağ
  { left: 230, top: 20 }, // üst
  { left: -10, top: 175 }, // sol
];

export function WaitingRoom({ table }: { table: TableView }) {
  const [copied, setCopied] = useState(false);
  const me = table.mySeat ?? 0;
  const esli = table.settings.mode === 'esli';
  const full = table.seats.every(Boolean);
  const link = `${location.origin}/?masa=${table.id}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="top-left" style={{ position: 'absolute', left: 48, top: 32 }}>
        <Logo />
      </div>
      <button className="btn danger top-right" style={{ position: 'absolute', right: 48, top: 44 }} onClick={() => socket.emit('table:leave')}>
        Masadan çık
      </button>
      <div className="panel" style={{ left: 260, top: 150, width: 1400, height: 860 }}>
        <div className="panel-head">
          <h1>{table.name}</h1>
          <span className="meta">{settingsText(table.settings)}</span>
        </div>
        <div className="split" style={{ flex: 1, display: 'grid', gridTemplateColumns: '720px minmax(0, 1fr)', gap: 48, padding: '36px 48px 40px' }}>
          <div className="seat-board" style={{ position: 'relative', height: 480 }}>
            <span className="label">Koltuklar</span>
            <div
              aria-hidden="true"
              style={{ position: 'absolute', left: 200, top: 160, width: 320, height: 170, borderRadius: 40, border: '12px solid var(--wood)', background: 'var(--felt)', boxShadow: '0 0 0 3px var(--outline)' }}
            />
            {[0, 1, 2, 3].map((rel) => {
              const seat = (me + rel) % 4;
              const s = table.seats[seat];
              const partner = esli && rel === 2;
              const pos = POS[rel];
              return (
                <div key={seat} style={{ position: 'absolute', ...pos, width: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 30 }}>
                  {s ? (
                    <Avatar url={s.avatar} name={s.name} size={58} isBot={s.isBot} bg={s.isYou ? 'var(--orange)' : undefined} dim={!s.connected} />
                  ) : (
                    <div className="avatar" style={{ width: 58, height: 58, fontSize: 26, background: '#F1E4CF' }}>?</div>
                  )}
                  <span style={{ fontWeight: 900, fontSize: 18 }}>
                    {s ? (s.isYou ? `${s.name} (sen)` : s.name) : 'Boş koltuk'}
                  </span>
                  <span className="hint">
                    {esli && rel !== 0 ? (partner ? 'Eşin' : 'Rakip') : s?.isBot ? 'Bot · el açmaz' : s && !s.connected ? 'Bağlantı koptu' : s ? 'Hazır' : 'Bekleniyor'}
                  </span>
                  {table.youAreHost && !esli && rel !== 0 && (!s || s.isBot) && (
                    <button className="btn small" onClick={() => socket.emit('table:bot', { seat, add: !s })}>
                      {s ? 'Botu çıkar' : 'Bot ekle'}
                    </button>
                  )}
                  {!s && table.mySeat !== null && esli && (
                    <button className="btn small" onClick={() => socket.emit('table:join', { tableId: table.id, seat })}>
                      Buraya geç
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'none', background: 'var(--surface)' }}>
              <span className="label" style={{ fontSize: 13 }}>Masa kuralları</span>
              {rulesSummary(table.settings).map((l) => (
                <div key={l} style={{ display: 'flex', gap: 10, fontWeight: 700, fontSize: 17, lineHeight: 1.35 }}>
                  <span aria-hidden="true" style={{ flexShrink: 0, width: 9, height: 9, marginTop: 8, borderRadius: '50%', background: '#E0782E' }} />
                  <span>{l}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="label">Davet linki</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <input className="input" readOnly value={link} aria-label="Davet linki" onFocus={(e) => e.currentTarget.select()} />
                <button className="btn" onClick={copy}>{copied ? 'Kopyalandı' : 'Kopyala'}</button>
              </div>
            </div>
            {!full && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="label">Arkadaşlarını davet et</span>
                <InviteFriends tableId={table.id} />
              </div>
            )}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {table.youAreHost ? (
                <button className="btn go big" disabled={!full} onClick={() => socket.emit('table:start')}>
                  {full ? 'Oyunu Başlat' : 'Koltuklar dolunca başlar'}
                </button>
              ) : (
                <div className="card" style={{ padding: 18, fontWeight: 800, fontSize: 18, textAlign: 'center' }}>
                  Masa sahibinin oyunu başlatması bekleniyor…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

import { useState } from 'react';
import type { TableView } from '../../shared/types';
import { Logo, Scene } from '../components/Stage';
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
      <Scene />
      <div style={{ position: 'absolute', left: 48, top: 32 }}>
        <Logo />
      </div>
      <button className="btn danger" style={{ position: 'absolute', right: 48, top: 44 }} onClick={() => socket.emit('table:leave')}>
        Masadan çık
      </button>
      <div className="panel" style={{ left: 260, top: 150, width: 1400, height: 860 }}>
        <div className="panel-head">
          <h1>{table.name}</h1>
          <span className="meta">{settingsText(table.settings)}</span>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '720px minmax(0, 1fr)', gap: 48, padding: '36px 48px 40px' }}>
          <div style={{ position: 'relative', height: 480 }}>
            <span className="label">Koltuklar</span>
            <div
              aria-hidden="true"
              style={{ position: 'absolute', left: 200, top: 160, width: 320, height: 170, borderRadius: 40, border: '12px solid var(--wood)', background: 'var(--felt)', boxShadow: '0 0 0 3px var(--ink)' }}
            />
            {[0, 1, 2, 3].map((rel) => {
              const seat = (me + rel) % 4;
              const s = table.seats[seat];
              const partner = esli && rel === 2;
              const pos = POS[rel];
              return (
                <div key={seat} style={{ position: 'absolute', ...pos, width: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 30 }}>
                  <div
                    className="avatar"
                    style={{ width: 58, height: 58, fontSize: 26, background: s ? (s.isBot ? '#BFD7FF' : s.isYou ? 'var(--orange)' : '#9FD3FF') : '#fff', opacity: s && !s.connected ? 0.5 : 1 }}
                  >
                    {s ? s.name.slice(0, 1).toUpperCase() : '?'}
                  </div>
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
            <div className="card" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'none', background: '#fff' }}>
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

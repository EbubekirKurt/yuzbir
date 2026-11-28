import { useEffect, useState } from 'react';
import type { Me, TablePeek } from '../../shared/types';
import { Avatar } from '../components/Avatar';
import { ProfileEditor } from '../components/ProfileEditor';
import { Logo } from '../components/Stage';
import { api, socket } from '../socket';
import { rulesSummary } from './CreateTable';
import { settingsText } from './Lobby';

/** Davet linki ya da lobiden "Katıl": masaya oturmadan önce masa bilgisi ve profil düzenleme. */
export function JoinScreen(props: { tableId: string; me: Me; onMe: (me: Me) => void; onCancel: () => void }) {
  const [peek, setPeek] = useState<TablePeek | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .peek<TablePeek>(props.tableId)
        .then((p) => alive && (setPeek(p), setError(null)))
        .catch((err) => alive && setError((err as Error).message));
    load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [props.tableId]);

  const seated = peek ? peek.seats.filter(Boolean).length : 0;
  const full = seated >= 4;

  return (
    <>
      <div className="top-left" style={{ position: 'absolute', left: 48, top: 32 }}>
        <Logo />
      </div>
      <button className="btn top-right" style={{ position: 'absolute', right: 48, top: 44 }} onClick={props.onCancel}>
        Lobiye dön
      </button>
      <div className="panel" style={{ left: 260, top: 150, width: 1400, height: 860 }}>
        <div className="panel-head">
          <h1>{peek ? `Masaya katıl: ${peek.name}` : 'Masaya katıl'}</h1>
          {peek && <span className="meta">{settingsText(peek.settings)}</span>}
        </div>
        <div className="split" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 560px', gap: 48, padding: '36px 48px 40px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <h2 className="baloo" style={{ margin: 0, fontSize: 28 }}>Profilin</h2>
            <p className="hint" style={{ margin: 0, fontSize: 16 }}>
              Masaya oturmadan önce fotoğrafını ve masada görünecek adını ayarlayabilirsin.
            </p>
            <div className="card" style={{ padding: 24, boxShadow: 'none', background: 'var(--surface)' }}>
              <ProfileEditor me={props.me} onChange={props.onMe} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {error && (
              <div className="card" role="alert" style={{ padding: 20, fontWeight: 800, fontSize: 18, background: 'var(--bad-bg)', color: 'var(--on-accent)' }}>{error}</div>
            )}
            {peek && (
              <>
                <span className="label">Masadakiler ({seated} / 4)</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  {peek.seats.map((s, i) => (
                    <div key={i} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'none', background: s ? 'var(--surface)' : 'transparent', borderStyle: s ? 'solid' : 'dashed' }}>
                      {s ? (
                        <Avatar url={s.avatar} name={s.name} size={48} isBot={s.isBot} />
                      ) : (
                        <div className="avatar" style={{ width: 48, height: 48, background: '#F1E4CF' }}>?</div>
                      )}
                      <span style={{ fontWeight: 900, fontSize: 17 }}>{s ? s.name : 'Boş koltuk'}</span>
                    </div>
                  ))}
                </div>
                <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'none', background: 'var(--surface)' }}>
                  <span className="label" style={{ fontSize: 13 }}>Masa kuralları</span>
                  {rulesSummary(peek.settings).map((l) => (
                    <div key={l} style={{ display: 'flex', gap: 10, fontWeight: 700, fontSize: 16, lineHeight: 1.35 }}>
                      <span aria-hidden="true" style={{ flexShrink: 0, width: 8, height: 8, marginTop: 7, borderRadius: '50%', background: '#E0782E' }} />
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button
              className="btn go big"
              style={{ marginTop: 'auto' }}
              disabled={!peek || full || peek.status === 'playing'}
              onClick={() => socket.emit('table:join', { tableId: props.tableId })}
            >
              {!peek ? 'Masa yükleniyor…' : peek.status === 'playing' ? 'Oyun başladı' : full ? 'Masa dolu' : 'Masaya otur'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

import type { LobbyTable, Me } from '../../shared/types';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Stage';

export function settingsText(s: LobbyTable['settings']) {
  return [
    s.mode === 'esli' ? 'Eşli' : 'Tekli',
    s.katlamali ? 'Katlamalı' : 'Katlamasız',
    `${s.hands} el`,
    `${s.turnSeconds} sn`,
  ].join(' · ');
}

export function Lobby(props: {
  me: Me;
  tables: LobbyTable[];
  onCreate: () => void;
  onJoin: (id: string) => void;
  onProfile: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <div style={{ position: 'absolute', left: 48, top: 32 }}>
        <Logo />
      </div>
      <div style={{ position: 'absolute', right: 48, top: 30, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn" style={{ height: 64, paddingLeft: 8 }} onClick={props.onProfile} aria-label="Profilini düzenle">
          <Avatar url={props.me.avatarUrl} name={props.me.displayName} size={46} bg="var(--orange)" />
          {props.me.displayName}
        </button>
        <button className="btn danger" onClick={props.onLogout}>Çıkış</button>
      </div>
      <div className="panel" style={{ left: 360, top: 150, width: 1200, height: 820 }}>
        <div className="panel-head">
          <h1>Hoş geldin, {props.me.displayName}</h1>
        </div>
        <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 26, flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <h2 className="baloo" style={{ margin: 0, fontSize: 28 }}>Masalar</h2>
              <span className="hint" style={{ fontSize: 16 }}>
                Masaya oturmadan önce profilini düzenleyebilirsin: sağ üstteki adına tıkla.
              </span>
            </div>
            <button className="btn go big" onClick={props.onCreate}>
              Yeni Masa Kur
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {props.tables.length === 0 && (
              <div className="card" style={{ padding: 24, fontWeight: 800, fontSize: 18 }}>
                Şu an açık masa yok. Yeni bir masa kur ve davet linkini arkadaşlarına gönder.
              </div>
            )}
            {props.tables.map((t) => (
              <div key={t.id} className="card" style={{ padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{ flex: 1 }}>
                  <div className="baloo" style={{ fontSize: 24, fontWeight: 800 }}>{t.name}</div>
                  <div className="hint" style={{ fontSize: 16 }}>{settingsText(t.settings)}</div>
                </div>
                <span className="chip white">{t.seated} / 4</span>
                {t.status === 'playing' ? (
                  <span className="chip">Oyunda</span>
                ) : (
                  <button className="btn primary" disabled={t.seated >= 4} onClick={() => props.onJoin(t.id)}>
                    Katıl
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

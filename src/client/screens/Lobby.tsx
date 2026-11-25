import { useState } from 'react';
import type { LobbyTable } from '../../shared/types';
import { Logo, Scene } from '../components/Stage';
import { socket } from '../socket';

export function settingsText(s: LobbyTable['settings']) {
  return [
    s.mode === 'esli' ? 'Eşli' : 'Tekli',
    s.katlamali ? 'Katlamalı' : 'Katlamasız',
    `${s.hands} el`,
    `${s.turnSeconds} sn`,
  ].join(' · ');
}

export function Lobby(props: {
  name: string;
  onName: (n: string) => void;
  tables: LobbyTable[];
  onCreate: () => void;
}) {
  const [draft, setDraft] = useState(props.name);
  const named = !!props.name;
  return (
    <>
      <Scene />
      <div style={{ position: 'absolute', left: 48, top: 32 }}>
        <Logo />
      </div>
      <div className="panel" style={{ left: 360, top: 150, width: 1200, height: 820 }}>
        <div className="panel-head">
          <h1>{named ? `Hoş geldin, ${props.name}` : 'Hoş geldin'}</h1>
        </div>
        <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 26, flex: 1, minHeight: 0 }}>
          <form
            style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}
            onSubmit={(e) => {
              e.preventDefault();
              props.onName(draft);
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <label className="label" htmlFor="adin">Oyuncu adın</label>
              <input
                id="adin"
                className="input"
                value={draft}
                maxLength={16}
                placeholder="Adını yaz"
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>
            <button className="btn primary" type="submit" disabled={!draft.trim() || draft.trim() === props.name}>
              {named ? 'Adı değiştir' : 'Devam'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="baloo" style={{ margin: 0, fontSize: 28 }}>Masalar</h2>
            <button className="btn go big" disabled={!named} onClick={props.onCreate}>
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
                  <button
                    className="btn primary"
                    disabled={!named || t.seated >= 4}
                    onClick={() => socket.emit('table:join', { tableId: t.id })}
                  >
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

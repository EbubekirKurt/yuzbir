import { useEffect, useState } from 'react';
import type { LobbyTable, Me, TableView } from '../shared/types';
import { ProfileEditor } from './components/ProfileEditor';
import { Radio } from './components/Radio';
import { Logo, Stage } from './components/Stage';
import { AuthScreen } from './screens/AuthScreen';
import { CreateTable } from './screens/CreateTable';
import { GameScreen } from './screens/GameScreen';
import { JoinScreen } from './screens/JoinScreen';
import { Lobby } from './screens/Lobby';
import { WaitingRoom } from './screens/WaitingRoom';
import { api, ApiError, socket } from './socket';
import { applyTheme, initialTheme, type Theme } from './theme';

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme());
  useEffect(() => applyTheme(theme), [theme]);
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
      title={dark ? 'Açık tema' : 'Koyu tema'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? (
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}

const inviteFromUrl = () => new URLSearchParams(location.search).get('masa');

function clearInviteFromUrl() {
  const url = new URL(location.href);
  if (url.searchParams.has('masa')) {
    url.searchParams.delete('masa');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined: yükleniyor
  const [authError, setAuthError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lobby, setLobby] = useState<LobbyTable[]>([]);
  const [table, setTable] = useState<TableView | null>(null);
  const [creating, setCreating] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [joinId, setJoinId] = useState<string | null>(inviteFromUrl());
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);

  const toast = (text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  };

  // Oturum kontrolü
  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((err) => {
        if (err instanceof ApiError && err.status !== 401) setAuthError(err.message);
        setMe(null);
      });
  }, []);

  // Giriş yapılınca oyun bağlantısını aç
  useEffect(() => {
    if (!me) return;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onError = (err: Error) => {
      if (err.message === 'unauthorized') {
        socket.disconnect();
        setMe(null);
      }
    };
    const onTable = (t: TableView | null) => {
      setTable(t);
      if (t) {
        setCreating(false);
        setJoinId(null);
        clearInviteFromUrl();
      }
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    socket.on('lobby', setLobby);
    socket.on('table', onTable);
    socket.on('toast', toast);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      socket.off('lobby', setLobby);
      socket.off('table', onTable);
      socket.off('toast', toast);
    };
  }, [me?.id]);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    socket.disconnect();
    setTable(null);
    setProfileOpen(false);
    setMe(null);
  };

  let screen;
  if (me === undefined) {
    screen = null;
  } else if (me === null) {
    screen = <AuthScreen invited={!!joinId} onAuthed={setMe} />;
  } else if (table && table.status === 'playing' && table.game) {
    screen = <GameScreen table={table} />;
  } else if (table) {
    screen = <WaitingRoom table={table} />;
  } else if (joinId) {
    screen = (
      <JoinScreen
        tableId={joinId}
        me={me}
        onMe={setMe}
        onCancel={() => {
          setJoinId(null);
          clearInviteFromUrl();
        }}
      />
    );
  } else if (profileOpen) {
    screen = (
      <>
        <div style={{ position: 'absolute', left: 48, top: 32 }}>
          <Logo />
        </div>
        <div className="panel" style={{ left: 460, top: 200, width: 1000, height: 520 }}>
          <div className="panel-head">
            <h1>Profilim</h1>
          </div>
          <div style={{ padding: '36px 44px', display: 'flex', flexDirection: 'column', gap: 24, flex: 1 }}>
            <ProfileEditor me={me} onChange={setMe} />
            <div style={{ marginTop: 'auto', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn danger" onClick={logout}>Çıkış yap</button>
              <button className="btn primary" onClick={() => setProfileOpen(false)}>Lobiye dön</button>
            </div>
          </div>
        </div>
      </>
    );
  } else if (creating) {
    screen = <CreateTable onCancel={() => setCreating(false)} />;
  } else {
    screen = (
      <Lobby
        me={me}
        tables={lobby}
        onCreate={() => setCreating(true)}
        onJoin={(id) => setJoinId(id)}
        onProfile={() => setProfileOpen(true)}
        onLogout={logout}
      />
    );
  }

  return (
    <>
      <Stage>{screen}</Stage>
      <ThemeToggle />
      <Radio />
      <div className="toasts" role="status" aria-live="polite">
        {authError && <div className="toast">{authError}</div>}
        {toasts.map((t) => (
          <div key={t.id} className="toast">{t.text}</div>
        ))}
      </div>
      {me && !connected && <div className="toast conn">Sunucuya bağlanılıyor…</div>}
    </>
  );
}

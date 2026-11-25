import { useEffect, useState } from 'react';
import type { LobbyTable, Me, TableView } from '../shared/types';
import { ProfileEditor } from './components/ProfileEditor';
import { Logo, Stage } from './components/Stage';
import { AuthScreen } from './screens/AuthScreen';
import { CreateTable } from './screens/CreateTable';
import { GameScreen } from './screens/GameScreen';
import { JoinScreen } from './screens/JoinScreen';
import { Lobby } from './screens/Lobby';
import { WaitingRoom } from './screens/WaitingRoom';
import { api, ApiError, socket } from './socket';

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

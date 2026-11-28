import { useEffect, useRef, useState } from 'react';
import type { LobbyTable, Me, TableInvite, TableView } from '../shared/types';
import { ProfileEditor } from './components/ProfileEditor';
import { Radio } from './components/Radio';
import { Logo, Stage, useIsMobile } from './components/Stage';
import { AuthScreen } from './screens/AuthScreen';
import { CreateTable } from './screens/CreateTable';
import { GameScreen } from './screens/GameScreen';
import { JoinScreen } from './screens/JoinScreen';
import { Lobby } from './screens/Lobby';
import { WaitingRoom } from './screens/WaitingRoom';
import { api, ApiError, socket } from './socket';
import { applyTheme, initialTheme, type Theme } from './theme';
import { setSoundEnabled, sfx, soundEnabled } from './sounds';
import { Avatar } from './components/Avatar';

function SoundToggle() {
  const [on, setOn] = useState(soundEnabled());
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={on}
      aria-label={on ? 'Oyun seslerini kapat' : 'Oyun seslerini aç'}
      title={on ? 'Oyun sesleri açık' : 'Oyun sesleri kapalı'}
      onClick={() => {
        setSoundEnabled(!on);
        setOn(!on);
      }}
    >
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
      </svg>
    </button>
  );
}

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
  const [invites, setInvites] = useState<TableInvite[]>([]);
  const mobile = useIsMobile();
  useEffect(() => {
    document.documentElement.classList.toggle('mobile', mobile);
  }, [mobile]);
  const tableRef = useRef<TableView | null>(null);
  tableRef.current = table;
  const dropInvite = (id: number) => setInvites((l) => l.filter((x) => x.id !== id));
  const acceptInvite = (inv: TableInvite) => {
    const current = tableRef.current;
    if (current && current.id !== inv.tableId) {
      const q = current.status === 'playing'
        ? 'Süren oyundan çıkıp bu masaya katılmak istiyor musun? Bu oyundaki hamlelerin otomatik oynanır.'
        : 'Şu anki masadan çıkıp bu masaya katılmak istiyor musun?';
      if (!window.confirm(q)) return;
      socket.emit('table:leave');
      setTable(null);
    }
    dropInvite(inv.id);
    setJoinId(inv.tableId);
  };

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
    const onInvite = (inv: TableInvite) => {
      sfx.turn();
      setInvites((l) => [...l.filter((x) => x.tableId !== inv.tableId), inv].slice(-3));
      setTimeout(() => dropInvite(inv.id), 60_000);
    };
    socket.on('invite', onInvite);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      socket.off('lobby', setLobby);
      socket.off('table', onTable);
      socket.off('toast', toast);
      socket.off('invite', onInvite);
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
    screen = <GameScreen table={table} mobile={mobile} />;
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
        <div className="top-left" style={{ position: 'absolute', left: 48, top: 32 }}>
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
      <Stage mode={mobile ? (table && table.status === 'playing' && table.game ? 'game' : 'page') : 'fixed'}>{screen}</Stage>
      <SoundToggle />
      <ThemeToggle />
      <Radio />
      <div className="invites" aria-live="polite">
        {invites.map((inv) => (
          <div key={inv.id} className="invite-card" role="alertdialog" aria-label={`${inv.fromName} seni davet ediyor`}>
            <Avatar url={inv.fromAvatar} name={inv.fromName} size={44} bg="var(--orange)" />
            <div className="invite-text">
              <b>{inv.fromName}</b> seni <b>{inv.tableName}</b> masasına davet ediyor
              <span className="friend-sub">
                {inv.settings.mode === 'esli' ? 'Eşli' : 'Tekli'} · {inv.settings.katlamali ? 'Katlamalı' : 'Katlamasız'} · {inv.settings.hands} el
              </span>
            </div>
            <div className="invite-actions">
              <button className="btn small go" onClick={() => acceptInvite(inv)}>Katıl</button>
              <button className="btn small" onClick={() => dropInvite(inv.id)}>Kapat</button>
            </div>
          </div>
        ))}
      </div>
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

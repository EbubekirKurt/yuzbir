import { useEffect, useRef, useState } from 'react';
import type { LobbyTable, TableView } from '../shared/types';
import { Stage } from './components/Stage';
import { CreateTable } from './screens/CreateTable';
import { GameScreen } from './screens/GameScreen';
import { Lobby } from './screens/Lobby';
import { WaitingRoom } from './screens/WaitingRoom';
import { PLAYER_ID, saveName, savedName, socket } from './socket';

export default function App() {
  const [name, setName] = useState(savedName());
  const [connected, setConnected] = useState(socket.connected);
  const [lobby, setLobby] = useState<LobbyTable[]>([]);
  const [table, setTable] = useState<TableView | null>(null);
  const [creating, setCreating] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const inviteUsed = useRef(false);
  const nameRef = useRef(name);
  nameRef.current = name;

  const toast = (text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  };

  useEffect(() => {
    const hello = () => {
      if (nameRef.current) socket.emit('hello', { playerId: PLAYER_ID, name: nameRef.current });
    };
    const onConnect = () => {
      setConnected(true);
      hello();
    };
    const onDisconnect = () => setConnected(false);
    const onTable = (t: TableView | null) => {
      setTable(t);
      if (t) setCreating(false);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('lobby', setLobby);
    socket.on('table', onTable);
    socket.on('toast', toast);
    if (socket.connected) hello();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('lobby', setLobby);
      socket.off('table', onTable);
      socket.off('toast', toast);
    };
  }, []);

  // Davet linki: ?masa=ID
  useEffect(() => {
    if (!name || !connected || inviteUsed.current) return;
    const id = new URLSearchParams(location.search).get('masa');
    if (!id) return;
    inviteUsed.current = true;
    const timer = setTimeout(() => socket.emit('table:join', { tableId: id }), 300);
    return () => clearTimeout(timer);
  }, [name, connected]);

  const chooseName = (n: string) => {
    const clean = n.trim().slice(0, 16);
    if (!clean) return;
    saveName(clean);
    setName(clean);
    socket.emit('hello', { playerId: PLAYER_ID, name: clean });
  };

  let screen;
  if (table && table.status === 'playing' && table.game) screen = <GameScreen table={table} />;
  else if (table) screen = <WaitingRoom table={table} />;
  else if (creating) screen = <CreateTable onCancel={() => setCreating(false)} />;
  else screen = <Lobby name={name} onName={chooseName} tables={lobby} onCreate={() => setCreating(true)} />;

  return (
    <>
      <Stage>{screen}</Stage>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">{t.text}</div>
        ))}
      </div>
      {!connected && <div className="toast conn">Sunucuya bağlanılıyor…</div>}
    </>
  );
}

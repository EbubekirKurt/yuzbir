import { useCallback, useEffect, useState } from 'react';
import type { FriendInfo, FriendsData } from '../../shared/types';
import { api, socket } from '../socket';
import { Avatar } from './Avatar';

/** Arkadaş listesi: açılışta, "friends:update" olayında ve 15 sn'de bir yenilenir. */
export function useFriends() {
  const [data, setData] = useState<FriendsData | null>(null);
  const refresh = useCallback(() => {
    api.friends().then(setData).catch(() => undefined);
  }, []);
  useEffect(() => {
    refresh();
    socket.on('friends:update', refresh);
    const id = setInterval(refresh, 15_000);
    return () => {
      socket.off('friends:update', refresh);
      clearInterval(id);
    };
  }, [refresh]);
  return { data, refresh };
}

function statusText(f: FriendInfo) {
  if (!f.online) return 'Çevrimdışı';
  if (f.tableName) return f.tableStatus === 'playing' ? `Oyunda · ${f.tableName}` : `Masada · ${f.tableName}`;
  return 'Lobide';
}

function FriendRow(props: { f: FriendInfo; children?: React.ReactNode }) {
  const { f } = props;
  return (
    <div className="friend-row">
      <div style={{ position: 'relative' }}>
        <Avatar url={f.avatarUrl} name={f.displayName} size={40} dim={!f.online} />
        <span className={`presence ${f.online ? 'on' : ''}`} aria-hidden="true" />
      </div>
      <div className="friend-text">
        <span className="friend-name">{f.displayName}</span>
        <span className="friend-sub">@{f.username} · {statusText(f)}</span>
      </div>
      <div className="friend-actions">{props.children}</div>
    </div>
  );
}

/** Lobideki arkadaş paneli: ekleme, gelen/giden istekler, liste. */
export function FriendsPanel(props: { onJoinTable: (tableId: string) => void }) {
  const { data, refresh } = useFriends();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ text: okText });
      refresh();
    } catch (err) {
      setMsg({ text: (err as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="friends-panel">
      <form
        className="friend-add"
        onSubmit={(e) => {
          e.preventDefault();
          const u = name.trim();
          if (!u) return;
          void run(async () => {
            const r = await api.friendRequest(u);
            setName('');
            setMsg({ text: r.result === 'accepted' ? `${u} ile artık arkadaşsınız.` : `${u} adlı oyuncuya istek gönderildi.` });
          });
        }}
      >
        <label className="sr-only" htmlFor="friendName">Arkadaşının kullanıcı adı</label>
        <input id="friendName" className="input" placeholder="Kullanıcı adıyla ekle" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" type="submit" disabled={busy || !name.trim()}>Ekle</button>
      </form>
      {msg && <div role="status" className={`friend-msg ${msg.error ? 'error' : ''}`}>{msg.text}</div>}

      <div className="friends-scroll">
        {!data && <div className="hint">Yükleniyor…</div>}
        {data && data.incoming.length > 0 && (
          <section>
            <h3 className="friends-h">Gelen istekler ({data.incoming.length})</h3>
            {data.incoming.map((f) => (
              <FriendRow key={f.id} f={f}>
                <button className="btn small go" disabled={busy} onClick={() => run(() => api.friendRespond(f.id, true), `${f.displayName} ile artık arkadaşsınız.`)}>Kabul</button>
                <button className="btn small" disabled={busy} onClick={() => run(() => api.friendRespond(f.id, false))}>Reddet</button>
              </FriendRow>
            ))}
          </section>
        )}
        {data && (
          <section>
            <h3 className="friends-h">Arkadaşlar ({data.friends.length})</h3>
            {data.friends.length === 0 && <div className="hint">Henüz arkadaşın yok. Yukarıdan kullanıcı adıyla ekleyebilirsin.</div>}
            {data.friends.map((f) => (
              <FriendRow key={f.id} f={f}>
                {f.online && f.tableId && f.tableStatus === 'waiting' && (
                  <button className="btn small primary" onClick={() => props.onJoinTable(f.tableId!)}>Katıl</button>
                )}
                <button
                  className="icon-x"
                  aria-label={`${f.displayName} arkadaşlıktan çıkar`}
                  title="Arkadaşlıktan çıkar"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`${f.displayName} arkadaş listenden çıkarılsın mı?`)) void run(() => api.friendRemove(f.id));
                  }}
                >
                  ×
                </button>
              </FriendRow>
            ))}
          </section>
        )}
        {data && data.outgoing.length > 0 && (
          <section>
            <h3 className="friends-h">Gönderilen istekler</h3>
            {data.outgoing.map((f) => (
              <FriendRow key={f.id} f={f}>
                <button className="btn small" disabled={busy} onClick={() => run(() => api.friendRemove(f.id))}>Geri çek</button>
              </FriendRow>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

/** Masa kurarken davet edilecek arkadaşları seçme (sadece çevrimiçi olanlar). */
export function FriendPicker(props: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useFriends();
  const online = data?.friends.filter((f) => f.online) ?? [];
  const toggle = (id: string) =>
    props.onChange(props.selected.includes(id) ? props.selected.filter((x) => x !== id) : [...props.selected, id]);
  if (!data) return <div className="hint">Arkadaşlar yükleniyor…</div>;
  if (!data.friends.length) return <div className="hint">Arkadaş eklemek için lobideki arkadaş panelini kullan.</div>;
  if (!online.length) return <div className="hint">Şu an çevrimiçi arkadaşın yok. Masayı kurduktan sonra davet linkini paylaşabilirsin.</div>;
  return (
    <div className="friend-picker">
      {online.map((f) => (
        <label key={f.id} className={`pick ${props.selected.includes(f.id) ? 'on' : ''}`}>
          <input type="checkbox" checked={props.selected.includes(f.id)} onChange={() => toggle(f.id)} />
          <Avatar url={f.avatarUrl} name={f.displayName} size={30} />
          <span>{f.displayName}</span>
          {f.tableName && <span className="friend-sub">({f.tableStatus === 'playing' ? 'oyunda' : 'masada'})</span>}
        </label>
      ))}
    </div>
  );
}

/** Bekleme salonunda arkadaş davet listesi. */
export function InviteFriends(props: { tableId: string; seatedIds?: string[] }) {
  const { data } = useFriends();
  const [sent, setSent] = useState<Record<string, number>>({});
  if (!data) return <div className="hint">Arkadaşlar yükleniyor…</div>;
  const list = data.friends.filter((f) => f.tableId !== props.tableId);
  if (!list.length) return <div className="hint">Davet edilecek arkadaş yok. Lobideki panelden arkadaş ekleyebilirsin.</div>;
  return (
    <div className="friends-scroll" style={{ maxHeight: 220 }}>
      {list.map((f) => {
        const recently = sent[f.id] && Date.now() - sent[f.id] < 30_000;
        return (
          <FriendRow key={f.id} f={f}>
            <button
              className="btn small primary"
              disabled={!f.online || !!recently}
              onClick={() => {
                socket.emit('table:invite', { userIds: [f.id] });
                setSent((s) => ({ ...s, [f.id]: Date.now() }));
              }}
            >
              {recently ? 'Davet edildi' : 'Davet et'}
            </button>
          </FriendRow>
        );
      })}
    </div>
  );
}

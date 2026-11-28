import { useEffect, useRef, useState } from 'react';
import type { RadioCategory, RadioStation } from '../../shared/types';

const KEY = 'yuzbir.radio';
const FAV_CAT = 'favoriler';

async function favoritesRequest(method: 'GET' | 'PUT' | 'DELETE', id?: string): Promise<string[]> {
  const r = await fetch(`/api/radio/favorites${id ? `/${encodeURIComponent(id)}` : ''}`, { method, credentials: 'same-origin' });
  const body = (await r.json().catch(() => ({}))) as { ids?: string[]; error?: string };
  if (!r.ok || !Array.isArray(body.ids)) throw new Error(body.error ?? 'Favoriler kaydedilemedi.');
  return body.ids;
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />
    </svg>
  );
}

interface Saved {
  categoryId?: string;
  stationId?: string;
  volume?: number;
}

function readSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

function writeSaved(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // yok say
  }
}

function RadioIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="2.5" />
      <path d="M7 8l9-5" />
      <circle cx="15.5" cy="14" r="2.6" />
      <path d="M6.5 12.5h4M6.5 15.5h4" />
    </svg>
  );
}

/** Oyun boyunca açık kalan radyo: kategori ve kanal seçimi, sonraki kanal, ses. */
export function Radio() {
  const saved = useRef(readSaved());
  const audio = useRef<HTMLAudioElement | null>(null);
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<RadioCategory[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catId, setCatId] = useState<string | undefined>(saved.current.categoryId);
  const [station, setStation] = useState<RadioStation | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(saved.current.volume ?? 0.6);
  const failCount = useRef(0);
  /** null: favoriler yüklenemedi (ör. giriş yapılmamış), yıldızlar gizlenir. */
  const [favIds, setFavIds] = useState<string[] | null>(null);
  const [favError, setFavError] = useState<string | null>(null);

  // Ses öğesi bir kez oluşturulur; ekran değişse de çalmaya devam eder.
  useEffect(() => {
    const a = new Audio();
    a.preload = 'none';
    audio.current = a;
    const onPlaying = () => {
      setPlaying(true);
      setBuffering(false);
      setError(null);
      failCount.current = 0;
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    a.addEventListener('playing', onPlaying);
    a.addEventListener('pause', onPause);
    a.addEventListener('waiting', onWaiting);
    return () => {
      a.pause();
      a.removeEventListener('playing', onPlaying);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('waiting', onWaiting);
    };
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
    writeSaved({ categoryId: catId, stationId: station?.id ?? saved.current.stationId, volume });
  }, [volume, catId, station]);

  // Kanal listesi ilk açılışta yüklenir.
  useEffect(() => {
    if (!open || cats) return;
    fetch('/api/radio')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Kanallar alınamadı'))))
      .then((data: RadioCategory[]) => {
        if (!data.length) throw new Error('Şu an kanal listesine ulaşılamıyor.');
        setCats(data);
        if (catId !== FAV_CAT && !data.some((c) => c.id === catId)) setCatId(data[0].id);
        const st = data.flatMap((c) => c.stations).find((s) => s.id === saved.current.stationId);
        if (st) setStation(st);
      })
      .catch((err) => setLoadError((err as Error).message));
  }, [open, cats, catId]);

  // Favoriler her açılışta hesaptan okunur (giriş/çıkış ya da başka cihazda değişiklik sonrası güncel olsun).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    favoritesRequest('GET')
      .then((ids) => alive && setFavIds(ids))
      .catch(() => alive && setFavIds(null));
    return () => {
      alive = false;
    };
  }, [open]);

  // Favoriler, kategorilerin başında sanal bir kategori olarak gösterilir.
  // Listede artık olmayan (yayını kapanan) istasyonlar gizlenir ama hesapta saklı kalır.
  const allStations = new Map((cats ?? []).flatMap((c) => c.stations).map((s) => [s.id, s] as const));
  const favCategory: RadioCategory | null =
    cats && favIds ? { id: FAV_CAT, name: '★ Favoriler', stations: favIds.map((id) => allStations.get(id)).filter((s): s is RadioStation => !!s) } : null;
  const shownCats = cats ? (favCategory ? [favCategory, ...cats] : cats) : null;
  const category = shownCats?.find((c) => c.id === catId) ?? cats?.[0];
  const isFav = (id: string) => !!favIds?.includes(id);

  const toggleFav = (st: RadioStation) => {
    if (!favIds) return;
    const on = !isFav(st.id);
    const before = favIds;
    setFavIds(on ? [...favIds, st.id] : favIds.filter((id) => id !== st.id)); // hemen göster
    setFavError(null);
    favoritesRequest(on ? 'PUT' : 'DELETE', st.id)
      .then(setFavIds)
      .catch((err) => {
        setFavIds(before);
        setFavError((err as Error).message);
      });
  };

  const play = (st: RadioStation) => {
    const a = audio.current;
    if (!a) return;
    setStation(st);
    setError(null);
    setBuffering(true);
    a.src = st.url;
    a.volume = volume;
    a.play().catch((err: Error) => {
      if (err.name === 'AbortError') return; // başka kanala geçildi
      setBuffering(false);
      failCount.current++;
      setError(`"${st.name}" açılamadı.`);
      // Açılmayan kanalda takılmamak için sıradakine geç (art arda en fazla 4 kez).
      if (failCount.current < 4) setTimeout(() => nextFrom(st), 600);
    });
  };

  const nextFrom = (current: RadioStation | null) => {
    const list = category?.stations ?? [];
    if (!list.length) return;
    const i = current ? list.findIndex((s) => s.id === current.id) : -1;
    play(list[(i + 1) % list.length]);
  };

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      a.pause();
      a.removeAttribute('src'); // canlı yayını durdurunca bağlantıyı da kapat
      a.load();
      setBuffering(false);
    } else if (station) play(station);
    else if (category) play(category.stations[0]);
  };

  // Medya tuşları ve işletim sistemi oynatıcısında kanal adı
  useEffect(() => {
    if (!('mediaSession' in navigator) || !station) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: station.name, artist: `Yüzbir Radyo · ${category?.name ?? ''}` });
    navigator.mediaSession.setActionHandler('nexttrack', () => nextFrom(station));
  }, [station, category]);

  const status = error ?? (buffering ? 'Bağlanıyor…' : playing ? 'Çalıyor' : station ? 'Durduruldu' : 'Kanal seç');

  return (
    <>
      <button
        type="button"
        className={`radio-toggle ${playing ? 'on' : ''}`}
        aria-label={open ? 'Radyoyu kapat' : 'Radyoyu aç'}
        aria-expanded={open}
        title={station && playing ? `Radyo: ${station.name}` : 'Radyo'}
        onClick={() => setOpen((o) => !o)}
      >
        <RadioIcon />
        {playing && <span className="radio-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="radio-panel" role="dialog" aria-label="Radyo">
          <div className="radio-head">
            <strong className="baloo">Radyo</strong>
            <button type="button" className="radio-x" aria-label="Radyo panelini kapat" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          {loadError && <div className="radio-msg error">{loadError}</div>}
          {!cats && !loadError && <div className="radio-msg">Kanallar yükleniyor…</div>}

          {cats && category && (
            <>
              <div className="radio-cats" role="group" aria-label="Kategori">
                {shownCats!.map((c) => (
                  <button key={c.id} type="button" className="radio-cat" aria-pressed={c.id === category.id} onClick={() => setCatId(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>

              {category.id === FAV_CAT && !category.stations.length ? (
                <div className="radio-msg">Henüz favori kanalın yok. Bir kanalın yanındaki yıldıza dokunarak ekleyebilirsin.</div>
              ) : (
                <ul className="radio-list" aria-label={`${category.name} kanalları`}>
                  {category.stations.map((s) => {
                    const active = station?.id === s.id;
                    const fav = isFav(s.id);
                    return (
                      <li key={s.id} className="radio-row">
                        <button type="button" className={`radio-station ${active ? 'active' : ''}`} aria-current={active} onClick={() => play(s)}>
                          <span className="radio-fav" aria-hidden="true">
                            {s.favicon ? <img src={s.favicon} alt="" width={22} height={22} loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
                          </span>
                          <span className="radio-name">{s.name}</span>
                          <span className="radio-meta">{s.country}{s.bitrate ? ` · ${s.bitrate}k` : ''}</span>
                        </button>
                        {favIds && (
                          <button
                            type="button"
                            className={`radio-star ${fav ? 'on' : ''}`}
                            aria-pressed={fav}
                            aria-label={fav ? `${s.name} favorilerden çıkar` : `${s.name} favorilere ekle`}
                            title={fav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                            onClick={() => toggleFav(s)}
                          >
                            <StarIcon filled={fav} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {favError && <div className="radio-msg error">{favError}</div>}
            </>
          )}

          <div className="radio-now" role="status" aria-live="polite">
            <span className="radio-now-name">
              {station && favIds && (
                <button
                  type="button"
                  className={`radio-star small ${isFav(station.id) ? 'on' : ''}`}
                  aria-pressed={isFav(station.id)}
                  aria-label={isFav(station.id) ? 'Çalan kanalı favorilerden çıkar' : 'Çalan kanalı favorilere ekle'}
                  title={isFav(station.id) ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                  onClick={() => toggleFav(station)}
                >
                  <StarIcon filled={isFav(station.id)} />
                </button>
              )}
              <span className="radio-now-text">{station?.name ?? '—'}</span>
            </span>
            <span className={`radio-now-status ${error ? 'error' : ''}`}>{status}</span>
          </div>

          <div className="radio-controls">
            <button type="button" className="btn small primary" onClick={toggle} disabled={!cats}>
              {playing || buffering ? 'Durdur' : 'Çal'}
            </button>
            <button type="button" className="btn small" onClick={() => nextFrom(station)} disabled={!category}>
              Sonraki kanal
            </button>
            <label className="radio-vol">
              <span className="sr-only">Ses</span>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9h4l5-4v14l-5-4H4z" />
                <path d="M16.5 8.5a5 5 0 0 1 0 7" />
              </svg>
              <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Ses düzeyi" onChange={(e) => setVolume(Number(e.target.value))} />
            </label>
          </div>
          <div className="radio-credit">Kanallar: radio-browser.info</div>
        </div>
      )}
    </>
  );
}

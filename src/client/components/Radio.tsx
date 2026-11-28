import { useEffect, useRef, useState } from 'react';
import type { RadioCategory, RadioStation } from '../../shared/types';

const KEY = 'yuzbir.radio';

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

// ---------- YouTube IFrame API ----------

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  nextVideo(): void;
  setVolume(v: number): void;
  setShuffle(s: boolean): void;
  setLoop(l: boolean): void;
  getVideoData(): { title?: string };
  destroy(): void;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<NonNullable<Window['YT']>> | null = null;

function loadYouTubeApi() {
  ytApi ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      ytApi = null;
      reject(new Error('YouTube oynatıcısı yüklenemedi.'));
    };
    document.head.appendChild(s);
  });
  return ytApi;
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

/** Oyun boyunca açık kalan radyo: kategori ve kanal seçimi, sonraki kanal/şarkı, ses. */
export function Radio() {
  const saved = useRef(readSaved());
  const audio = useRef<HTMLAudioElement | null>(null);
  const ytHost = useRef<HTMLDivElement | null>(null);
  const yt = useRef<YTPlayer | null>(null);
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<RadioCategory[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catId, setCatId] = useState<string | undefined>(saved.current.categoryId);
  const [station, setStation] = useState<RadioStation | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(saved.current.volume ?? 0.6);
  const [ytActive, setYtActive] = useState(false);
  const [songTitle, setSongTitle] = useState<string | null>(null);
  const [ytBlocked, setYtBlocked] = useState(false);
  const failCount = useRef(0);
  const ytErrors = useRef(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  // Radyo yayını için ses öğesi bir kez oluşturulur; ekran değişse de çalmaya devam eder.
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
    yt.current?.setVolume(Math.round(volume * 100));
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
        const cat = data.find((c) => c.id === catId) ?? data[0];
        setCatId(cat.id);
        const st = cat.stations.find((s) => s.id === saved.current.stationId);
        if (st) setStation(st);
      })
      .catch((err) => setLoadError((err as Error).message));
  }, [open, cats, catId]);

  const category = cats?.find((c) => c.id === catId) ?? cats?.[0];

  const stopStream = () => {
    const a = audio.current;
    if (!a) return;
    a.pause();
    a.removeAttribute('src'); // canlı yayını durdurunca bağlantıyı da kapat
    a.load();
  };

  const stopYouTube = () => {
    yt.current?.destroy();
    yt.current = null;
    setYtActive(false);
    setYtBlocked(false);
    setSongTitle(null);
  };

  const playYouTube = async (st: RadioStation) => {
    stopStream();
    setStation(st);
    setError(null);
    setBuffering(true);
    setYtActive(true);
    setYtBlocked(false);
    ytErrors.current = 0;
    try {
      const YT = await loadYouTubeApi();
      yt.current?.destroy();
      // Oynatıcı kutusu görünür olmalı (YouTube kuralı); React her seferinde yeni bir alt öğe verir.
      const host = ytHost.current;
      if (!host) return;
      host.innerHTML = '';
      const el = document.createElement('div');
      host.appendChild(el);
      yt.current = new YT.Player(el, {
        width: '100%',
        height: '100%',
        playerVars: {
          listType: 'playlist',
          list: st.playlistId,
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
          widget_referrer: window.location.href,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            e.target.setVolume(Math.round(volumeRef.current * 100));
            e.target.setShuffle(true); // sonraki şarkılar karışık sırayla
            e.target.setLoop(true);
            e.target.playVideo();
          },
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            // 1: çalıyor, 2: duraklatıldı, 3: yükleniyor, 0: bitti
            if (e.data === 1) {
              setPlaying(true);
              setBuffering(false);
              setError(null);
              ytErrors.current = 0;
              setSongTitle(e.target.getVideoData().title ?? null);
            } else if (e.data === 2 || e.data === 0) setPlaying(false);
            else if (e.data === 3) setBuffering(true);
          },
          onError: (e: { data: number; target: YTPlayer }) => {
            ytErrors.current++;
            // 100: video yok, 101/150: sahibi gömülü oynatmayı kapatmış -> birkaç kez sonrakine geç.
            // Diğer durumlar (ör. YouTube'un "bot olmadığınızı doğrulayın" engeli) -> döngüye girme, dur.
            if ([100, 101, 150].includes(e.data) && ytErrors.current <= 2) {
              setError('Bu klip burada oynatılamıyor, sonrakine geçiliyor…');
              setTimeout(() => yt.current?.nextVideo(), 1500);
              return;
            }
            e.target.pauseVideo();
            setPlaying(false);
            setBuffering(false);
            setYtBlocked(true);
            setError('YouTube oynatmayı engelledi.');
          },
        },
      });
    } catch (err) {
      setBuffering(false);
      setYtActive(false);
      setError((err as Error).message);
    }
  };

  const play = (st: RadioStation) => {
    if (st.kind === 'youtube') return void playYouTube(st);
    stopYouTube();
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
    if (current?.kind === 'youtube' && yt.current) {
      yt.current.nextVideo();
      return;
    }
    const list = category?.stations ?? [];
    if (!list.length) return;
    const i = current ? list.findIndex((s) => s.id === current.id) : -1;
    play(list[(i + 1) % list.length]);
  };

  const toggle = () => {
    if (station?.kind === 'youtube' && yt.current) {
      if (playing) yt.current.pauseVideo();
      else yt.current.playVideo();
      return;
    }
    if (playing || buffering) {
      stopStream();
      setBuffering(false);
    } else if (station) play(station);
    else if (category) play(category.stations[0]);
  };

  const closeYouTube = () => {
    stopYouTube();
    setPlaying(false);
    setBuffering(false);
  };

  // Medya tuşları ve işletim sistemi oynatıcısında kanal adı
  useEffect(() => {
    if (!('mediaSession' in navigator) || !station || station.kind === 'youtube') return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: station.name, artist: `Yüzbir Radyo · ${category?.name ?? ''}` });
    navigator.mediaSession.setActionHandler('nexttrack', () => nextFrom(station));
  }, [station, category]);

  const isYt = station?.kind === 'youtube';
  const status = error ?? (buffering ? 'Bağlanıyor…' : playing ? 'Çalıyor' : station ? 'Durduruldu' : 'Kanal seç');
  const nowName = isYt && songTitle ? songTitle : station?.name ?? '—';

  return (
    <>
      <button
        type="button"
        className={`radio-toggle ${playing ? 'on' : ''}`}
        aria-label={open ? 'Radyoyu kapat' : 'Radyoyu aç'}
        aria-expanded={open}
        title={station && playing ? `Radyo: ${nowName}` : 'Radyo'}
        onClick={() => setOpen((o) => !o)}
      >
        <RadioIcon />
        {playing && <span className="radio-dot" aria-hidden="true" />}
      </button>

      {/* YouTube kanalı çalarken görünür oynatıcı (YouTube kuralı: en az 200×200) */}
      <div className="yt-mini" hidden={!ytActive} aria-label="YouTube oynatıcısı">
        <div className="yt-mini-head">
          <span className="yt-mini-title">{station?.name ?? ''} · YouTube</span>
          <button type="button" className="yt-mini-btn" aria-label="Sonraki şarkı" title="Sonraki şarkı" onClick={() => yt.current?.nextVideo()}>
            ⏭
          </button>
          <button type="button" className="yt-mini-btn" aria-label="Kapat" title="Kapat" onClick={closeYouTube}>
            ×
          </button>
        </div>
        <div ref={ytHost} className="yt-mini-video" />
        {ytBlocked && station?.kind === 'youtube' && (
          <div className="yt-mini-help" role="alert">
            <span>
              YouTube "bot olmadığınızı doğrulayın" diyorsa bu tarayıcıda YouTube'a giriş yapıp tekrar dene. VPN ya da reklam engelleyici de buna yol açabilir.
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn small primary" onClick={() => playYouTube(station)}>Tekrar dene</button>
              <a className="btn small" href={station.url} target="_blank" rel="noopener noreferrer">YouTube'da aç</a>
            </div>
          </div>
        )}
      </div>

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
                {cats.map((c) => (
                  <button key={c.id} type="button" className="radio-cat" aria-pressed={c.id === category.id} onClick={() => setCatId(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>

              <ul className="radio-list" aria-label={`${category.name} kanalları`}>
                {category.stations.map((s) => {
                  const active = station?.id === s.id;
                  return (
                    <li key={s.id}>
                      <button type="button" className={`radio-station ${active ? 'active' : ''}`} aria-current={active} onClick={() => play(s)}>
                        <span className="radio-fav" aria-hidden="true">
                          {s.kind === 'youtube' ? (
                            <svg width="22" height="22" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="5" fill="#e8453c" /><path d="M10 8.5v7l6-3.5z" fill="#fff" /></svg>
                          ) : s.favicon ? (
                            <img src={s.favicon} alt="" width={22} height={22} loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />
                          ) : null}
                        </span>
                        <span className="radio-name">{s.name}</span>
                        <span className="radio-meta">{s.kind === 'youtube' ? 'Resmi klipler' : `${s.country}${s.bitrate ? ` · ${s.bitrate}k` : ''}`}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {category.stations.some((s) => s.kind === 'youtube') && (
                <div className="radio-msg" style={{ fontSize: 12 }}>
                  Sanatçı kanalları resmi YouTube kanalındaki klipleri karışık çalar; çalarken sol kenarda küçük bir video kutusu görünür.
                </div>
              )}
            </>
          )}

          <div className="radio-now" role="status" aria-live="polite">
            <span className="radio-now-name">{nowName}</span>
            <span className={`radio-now-status ${error ? 'error' : ''}`}>{status}</span>
          </div>

          <div className="radio-controls">
            <button type="button" className="btn small primary" onClick={toggle} disabled={!cats}>
              {playing || buffering ? 'Durdur' : 'Çal'}
            </button>
            <button type="button" className="btn small" onClick={() => nextFrom(station)} disabled={!category}>
              {isYt ? 'Sonraki şarkı' : 'Sonraki kanal'}
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
          <div className="radio-credit">Kanallar: radio-browser.info · Sanatçılar: YouTube</div>
        </div>
      )}
    </>
  );
}

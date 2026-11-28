// Radyo kanalları: Radio Browser (https://www.radio-browser.info) açık dizininden çekilir.
// Her kategori için çalıştığı doğrulanmış HTTPS yayınlar alınır, 6 saat önbellekte tutulur.
import type { RadioCategory, RadioStation } from '../shared/types';

const MIRRORS = ['de1', 'fi1', 'nl1', 'de2', 'at1'].map((m) => `https://${m}.api.radio-browser.info`);
const CACHE_MS = 6 * 60 * 60 * 1000;
const PER_CATEGORY = 8;

interface Query {
  tag?: string;
  countrycode?: string;
  language?: string;
}

const CATEGORIES: { id: string; name: string; queries: Query[] }[] = [
  { id: 'tr-pop', name: 'Türkçe Pop', queries: [{ countrycode: 'TR', tag: 'pop' }] },
  { id: 'tr-rock', name: 'Türkçe Rock', queries: [{ countrycode: 'TR', tag: 'rock' }] },
  { id: 'arabesk', name: 'Arabesk', queries: [{ tag: 'arabesk' }] },
  { id: 'tr-slow', name: 'Türkçe Slow', queries: [{ countrycode: 'TR', tag: 'slow' }, { countrycode: 'TR', tag: 'easy listening' }] },
  { id: 'pop', name: 'Yabancı Pop', queries: [{ countrycode: 'GB', tag: 'pop' }, { countrycode: 'US', tag: 'pop' }] },
  { id: 'rock', name: 'Yabancı Rock', queries: [{ countrycode: 'US', tag: 'classic rock' }, { countrycode: 'GB', tag: 'rock' }] },
  { id: 'metal', name: 'Metal', queries: [{ tag: 'heavy metal' }, { tag: 'metal' }] },
  { id: 'lofi', name: 'Lo-fi / Chill', queries: [{ tag: 'lofi' }, { tag: 'chillout' }] },
  { id: 'jazz', name: 'Caz', queries: [{ tag: 'jazz' }] },
];

// Sezonluk ya da tekrar eden içerik
const SKIP = /christmas|xmas|noel|weihnacht|navidad/i;

interface RbStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  countrycode: string;
  codec: string;
  bitrate: number;
  lastcheckok: number;
  votes: number;
}

async function search(q: Query): Promise<RbStation[]> {
  const params = new URLSearchParams({
    hidebroken: 'true',
    is_https: 'true',
    order: 'votes',
    reverse: 'true',
    limit: '40',
    ...(q.tag ? { tag: q.tag } : {}),
    ...(q.countrycode ? { countrycode: q.countrycode } : {}),
    ...(q.language ? { language: q.language } : {}),
  });
  let lastErr: unknown;
  for (const base of MIRRORS) {
    try {
      const res = await fetch(`${base}/json/stations/search?${params}`, {
        headers: { 'User-Agent': 'Yuzbir101Okey/0.1' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return (await res.json()) as RbStation[];
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

let cache: { at: number; data: RadioCategory[] } | null = null;
let loading: Promise<RadioCategory[]> | null = null;

async function load(): Promise<RadioCategory[]> {
  const out: RadioCategory[] = [];
  for (const cat of CATEGORIES) {
    const seenName = new Set<string>();
    const seenUrl = new Set<string>();
    const stations: RadioStation[] = [];
    for (const q of cat.queries) {
      let list: RbStation[] = [];
      try {
        list = await search(q);
      } catch (err) {
        console.error(`[radio] "${cat.name}" alınamadı:`, (err as Error).message);
      }
      for (const s of list) {
        const name = s.name.trim().replace(/\s+/g, ' ');
        const key = name.toLowerCase().replace(/[^a-z0-9çğıöşü]/g, '');
        if (
          !s.url_resolved.startsWith('https://') ||
          s.lastcheckok !== 1 ||
          !/^(mp3|aac|aac\+)$/i.test(s.codec) ||
          SKIP.test(name) ||
          seenName.has(key) ||
          seenUrl.has(s.url_resolved)
        )
          continue;
        seenName.add(key);
        seenUrl.add(s.url_resolved);
        stations.push({
          id: s.stationuuid,
          kind: 'stream',
          name: name.slice(0, 48),
          url: s.url_resolved,
          favicon: s.favicon?.startsWith('https://') ? s.favicon : null,
          country: s.countrycode,
          bitrate: s.bitrate || null,
        });
        if (stations.length >= PER_CATEGORY) break;
      }
      if (stations.length >= PER_CATEGORY) break;
    }
    if (stations.length) out.push({ id: cat.id, name: cat.name, stations });
  }
  return out;
}

/**
 * Sanatçı kanalları: resmi YouTube oynatma listeleri.
 * RADIO_YOUTUBE_CHANNELS="Ad|playlistId;Ad 2|playlistId2" ile değiştirilebilir.
 */
const DEFAULT_YOUTUBE = 'Manifest|PLN9sAeoGw4Fh12V2ruXxiIUTQIBz1yZjc';

function youtubeCategory(): RadioCategory | null {
  const raw = process.env.RADIO_YOUTUBE_CHANNELS ?? DEFAULT_YOUTUBE;
  const stations: RadioStation[] = raw
    .split(';')
    .map((part) => part.split('|').map((x) => x.trim()))
    .filter(([name, id]) => name && id && /^[A-Za-z0-9_-]{10,64}$/.test(id))
    .map(([name, id]) => ({
      id: `yt-${id}`,
      kind: 'youtube' as const,
      playlistId: id,
      name: name.slice(0, 48),
      url: `https://www.youtube.com/playlist?list=${id}`,
      favicon: null,
      country: 'YouTube',
      bitrate: null,
    }));
  return stations.length ? { id: 'sanatci', name: 'Sanatçılar', stations } : null;
}

/** Kategoriler ve kanalları (önbellekli). Dizine ulaşılamazsa eski önbellek döner. */
export async function radioCategories(): Promise<RadioCategory[]> {
  const yt = youtubeCategory();
  const withYt = (data: RadioCategory[]) => (yt ? [yt, ...data] : data);
  if (cache && Date.now() - cache.at < CACHE_MS) return withYt(cache.data);
  loading ??= load()
    .then((data) => {
      if (data.length) cache = { at: Date.now(), data };
      return data.length ? data : cache?.data ?? [];
    })
    .finally(() => {
      loading = null;
    });
  return withYt(await loading);
}

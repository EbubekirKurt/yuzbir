// Radyo kanalları: Radio Browser (https://www.radio-browser.info) açık dizininden çekilir.
// Her kategoride önce elle seçilmiş popüler istasyonlar (tam adıyla doğrulanır), kalan yer
// dizindeki etiketlerden doldurulur. Sadece HTTP yayını olan istasyonlar sunucu üzerinden
// aktarılır (/api/radio/stream/:id) ki güvenli (HTTPS) sitede çalabilsin. 6 saat önbellek.
import type { RadioCategory, RadioStation } from '../shared/types';

const MIRRORS = ['de1', 'fi1', 'nl1', 'de2', 'at1'].map((m) => `https://${m}.api.radio-browser.info`);
const CACHE_MS = 6 * 60 * 60 * 1000;
const PER_CATEGORY = 14;

/** Popüler istasyon: q ile aranır, adı re ile doğrulanır (yanlış istasyon gelmesin). */
interface Pick {
  q: string;
  re: RegExp;
  cc?: string;
}
interface TagQuery {
  tag: string;
  cc?: string;
}
interface CategoryDef {
  id: string;
  name: string;
  picks: Pick[];
  tags: TagQuery[];
}

const TR = 'TR';
const CATEGORIES: CategoryDef[] = [
  {
    id: 'tr-pop',
    name: 'Türkçe Pop',
    picks: [
      { q: 'Kral FM', cc: TR, re: /^kral fm$/ },
      { q: 'Power Türk', cc: TR, re: /^power ?t[üu]rk(?!.*dans)/ },
      { q: 'Süper FM', cc: TR, re: /^s[üu]per fm$/ },
      { q: 'Joy Türk', cc: TR, re: /^joy t[üu]rk/ },
      { q: 'Fenomen', cc: TR, re: /^radyo fenomen$|^fenomen t[üu]rk/ },
      { q: 'Kral Türk', cc: TR, re: /^kral t[üu]rk/ },
      { q: 'Alem FM', cc: TR, re: /^alem fm$/ },
      { q: 'Best FM', cc: TR, re: /^best fm$/ },
      { q: 'Show Radyo', cc: TR, re: /^show radyo$/ },
      { q: 'Radyo 7', cc: TR, re: /^radyo 7$/ },
      { q: 'Pal FM', cc: TR, re: /^pal fm$/ },
      { q: 'Radyo Sputnik', cc: TR, re: /sputnik/ },
    ],
    tags: [{ tag: 'pop', cc: TR }],
  },
  {
    id: 'tr-hit',
    name: "Türkiye'den Yabancı Hit",
    picks: [
      { q: 'Metro FM', cc: TR, re: /^metro fm$/ },
      { q: 'Virgin Radio', cc: TR, re: /virgin radio t[üu]rkiye/ },
      { q: 'PowerFM', cc: TR, re: /^power ?fm$/ },
      { q: 'Joy FM', cc: TR, re: /^joy fm$/ },
      { q: 'Radyo Voyage', cc: TR, re: /^radyo voyage$/ },
      { q: 'Pal Station', cc: TR, re: /^pal station$/ },
      { q: 'Lounge FM', re: /^lounge fm/ },
    ],
    tags: [{ tag: 'top 40', cc: TR }, { tag: 'hits', cc: TR }],
  },
  {
    id: 'tr-rock',
    name: 'Türkçe Rock & Alternatif',
    picks: [
      { q: 'Radyo Eksen', cc: TR, re: /^radyo eksen/ },
      { q: 'Kafa Radyo', cc: TR, re: /^kafa radyo/ },
      { q: 'Radyo Viva', cc: TR, re: /^radyo viva$/ },
      { q: 'Rock FM', cc: TR, re: /t[üu]rk rock fm/ },
      { q: 'Radyo Mydonose', cc: TR, re: /mydonose/ },
      { q: 'Radyo Sputnik', cc: TR, re: /sputnik/ },
    ],
    tags: [{ tag: 'rock', cc: TR }, { tag: 'alternative', cc: TR }],
  },
  {
    id: 'arabesk',
    name: 'Arabesk & Fantezi',
    picks: [
      { q: 'Damar', re: /^damar ?t[üu]rk/ },
      { q: 'Arabesk FM', re: /arabesk fm/ },
      { q: 'Radyo Seymen', re: /^radyo seymen$/ },
      { q: 'LP Arabesk', re: /lp arabesk/ },
      { q: 'Radyo 45lik', re: /45lik/ },
    ],
    tags: [{ tag: 'arabesk' }, { tag: 'fantezi', cc: TR }],
  },
  {
    id: 'turku',
    name: 'Türkü & Halk',
    picks: [],
    tags: [{ tag: 'türkü', cc: TR }, { tag: 'turku', cc: TR }, { tag: 'halk', cc: TR }, { tag: 'folk', cc: TR }],
  },
  {
    id: 'sanat',
    name: 'Türk Sanat',
    picks: [{ q: 'TRT Nağme', re: /^trt na[ğg]me$/ }],
    tags: [{ tag: 'türk sanat müziği' }, { tag: 'turkish classical' }, { tag: 'sanat', cc: TR }],
  },
  {
    id: 'slow',
    name: 'Slow & Romantik',
    picks: [
      { q: 'Power Love', re: /^power ?love$/ },
      { q: 'Kalp FM', cc: TR, re: /^kalp fm$/ },
    ],
    tags: [{ tag: 'slow', cc: TR }, { tag: 'romantic', cc: TR }, { tag: 'easy listening', cc: TR }],
  },
  {
    id: 'pop',
    name: 'Yabancı Pop & Hit',
    picks: [
      { q: 'Capital FM', cc: 'GB', re: /^capital fm london$|^capital( uk)?$/ },
      { q: 'Heart', cc: 'GB', re: /^heart( uk| london)?$/ },
      { q: 'Virgin Radio', cc: 'GB', re: /^virgin radio( uk)?$/ },
      { q: 'KISS', cc: 'GB', re: /^kiss( uk| fm)?$/ },
      { q: 'NRJ', cc: 'FR', re: /^nrj( hits)?$/ },
      { q: 'Z100', cc: 'US', re: /z100/ },
      { q: 'Los40', cc: 'ES', re: /^los ?40/ },
      { q: 'Radio Deejay', cc: 'IT', re: /^radio deejay$/ },
      { q: 'RTL 102.5', cc: 'IT', re: /rtl 102/ },
      { q: 'Kiss FM', cc: 'DE', re: /kiss fm/ },
      { q: 'Europa Plus', re: /^europa plus/ },
      { q: 'Heart 90s', cc: 'GB', re: /^heart 90s$/ },
    ],
    tags: [{ tag: 'pop', cc: 'GB' }, { tag: 'pop', cc: 'US' }],
  },
  {
    id: 'rock',
    name: 'Yabancı Rock',
    picks: [
      { q: 'Radio X', cc: 'GB', re: /^radio x$/ },
      { q: 'Absolute Radio', cc: 'GB', re: /^absolute radio$/ },
      { q: 'Planet Rock', re: /planet rock/ },
      { q: 'Kerrang', re: /kerrang/ },
      { q: 'KEXP', re: /kexp/ },
      { q: 'Hard Rock Heaven', re: /hard rock heaven/ },
      { q: 'SomaFM Indie Pop Rocks', re: /indie pop rocks/ },
      { q: '100.7 WZLX', re: /wzlx/ },
    ],
    tags: [{ tag: 'classic rock', cc: 'US' }, { tag: 'rock', cc: 'GB' }],
  },
  {
    id: 'metal',
    name: 'Metal',
    picks: [
      { q: 'Rock Antenne Heavy Metal', re: /rock antenne heavy metal/ },
      { q: 'Metal Express', re: /metal express/ },
    ],
    tags: [{ tag: 'heavy metal' }, { tag: 'metal' }],
  },
  {
    id: 'rap',
    name: 'Rap & Hip-Hop',
    picks: [
      { q: 'Hot 97', re: /hot 97/ },
      { q: 'Hot 108', re: /hot 108/ },
      { q: 'Capital XTRA', re: /capital xtra$/ },
      { q: 'Power 106', re: /power 106/ },
    ],
    tags: [{ tag: 'rap', cc: TR }, { tag: 'hip hop', cc: TR }, { tag: 'hip hop' }, { tag: 'rap' }],
  },
  {
    id: 'dance',
    name: 'Elektronik & Dans',
    picks: [
      { q: 'Ibiza Global', re: /ibiza global/ },
      { q: 'Deep House Radio', re: /deep house radio/ },
      { q: 'Power Türk', cc: TR, re: /power t[üu]rk dans/ },
    ],
    tags: [{ tag: 'dance' }, { tag: 'house' }, { tag: 'edm' }],
  },
  {
    id: 'lofi',
    name: 'Lo-fi & Chill',
    picks: [
      { q: 'SomaFM Groove Salad', re: /groove salad/ },
      { q: 'Chillhop', re: /chillhop/ },
    ],
    tags: [{ tag: 'lofi' }, { tag: 'chillout' }],
  },
  {
    id: 'jazz',
    name: 'Caz',
    picks: [
      { q: 'FIP Jazz', re: /fip jazz/ },
      { q: 'Radio Swiss Jazz', re: /swiss jazz/ },
      { q: 'SomaFM Secret Agent', re: /secret agent/ },
    ],
    tags: [{ tag: 'jazz' }, { tag: 'smooth jazz' }],
  },
  {
    id: 'klasik',
    name: 'Klasik',
    picks: [
      { q: 'Classic FM', cc: 'GB', re: /^classic fm$/ },
      { q: 'Radio Swiss Classic', re: /swiss classic/ },
    ],
    tags: [{ tag: 'classical' }],
  },
  {
    id: 'karisik',
    name: 'Karışık',
    picks: [
      { q: 'Radio Paradise', re: /radio paradise main mix/ },
      { q: 'FIP', cc: 'FR', re: /^fip$/ },
      { q: 'KEXP', re: /kexp/ },
    ],
    tags: [{ tag: 'eclectic' }],
  },
];

// Sezonluk ya da tekrar eden içerik
// Sezonluk ya da müzik dışı (dini, haber) içerik; Arap alfabeli adlar da çoğunlukla müzik dışı
const SKIP = /christmas|xmas|noel|weihnacht|navidad|quran|kuran|ilahi|dini|haber|news|\p{Script=Arabic}/iu;

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

async function rb(params: Record<string, string>): Promise<RbStation[]> {
  const qs = new URLSearchParams({ hidebroken: 'true', order: 'votes', reverse: 'true', limit: '40', ...params });
  let lastErr: unknown;
  for (const base of MIRRORS) {
    try {
      const res = await fetch(`${base}/json/stations/search?${qs}`, {
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

const usable = (s: RbStation) =>
  /^https?:\/\//.test(s.url_resolved) && s.lastcheckok === 1 && /^(mp3|aac|aac\+)$/i.test(s.codec) && !SKIP.test(s.name);

/** Gerçek yayın adresleri (aktarıcı için): istasyon id -> kaynak adres. */
let sources = new Map<string, string>();

function toStation(s: RbStation): RadioStation {
  const https = s.url_resolved.startsWith('https://');
  return {
    id: s.stationuuid,
    name: s.name.trim().replace(/\s+/g, ' ').slice(0, 48),
    // HTTP yayınlar güvenli sitede doğrudan çalamaz: sunucu üzerinden aktarılır.
    url: https ? s.url_resolved : `/api/radio/stream/${s.stationuuid}`,
    favicon: s.favicon?.startsWith('https://') ? s.favicon : null,
    country: s.countrycode,
    bitrate: s.bitrate || null,
  };
}

/** En fazla n işi aynı anda çalıştırır. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

async function load(): Promise<RadioCategory[]> {
  const newSources = new Map<string, string>();
  const nameKey = (n: string) => n.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9çğıöşü]/g, '');

  // 1) Bütün kategorilerin popüler istasyonları (aynı istasyon bilerek birden çok kategoride olabilir)
  const picksByCat = await pool(CATEGORIES, 4, (cat) =>
    pool(cat.picks, 4, async (p) => {
      try {
        const list = await rb({ name: p.q, limit: '15', ...(p.cc ? { countrycode: p.cc } : {}) });
        return list.find((s) => usable(s) && p.re.test(s.name.trim().toLowerCase())) ?? null;
      } catch {
        return null;
      }
    }),
  );
  // Etiketten gelen istasyonlar başka bir kategoride zaten varsa tekrar eklenmez.
  const usedAnywhere = new Set<string>();
  picksByCat.flat().forEach((s) => s && (usedAnywhere.add(s.url_resolved), usedAnywhere.add(nameKey(s.name))));

  // 2) Etiket sonuçları (paralel çekilir, sırayla dağıtılır)
  const tagLists = await pool(CATEGORIES, 4, (cat) =>
    pool(cat.tags, 2, async (t) => {
      try {
        return await rb({ tag: t.tag, ...(t.cc ? { countrycode: t.cc } : {}) });
      } catch (err) {
        console.error(`[radio] "${cat.name}" / ${t.tag} alınamadı:`, (err as Error).message);
        return [] as RbStation[];
      }
    }),
  );

  const out: RadioCategory[] = [];
  CATEGORIES.forEach((cat, ci) => {
    const seenName = new Set<string>();
    const seenUrl = new Set<string>();
    const stations: RadioStation[] = [];
    const add = (s: RbStation, fromTag: boolean) => {
      const key = nameKey(s.name);
      if (stations.length >= PER_CATEGORY || seenName.has(key) || seenUrl.has(s.url_resolved)) return;
      if (fromTag && (usedAnywhere.has(s.url_resolved) || usedAnywhere.has(key))) return;
      seenName.add(key);
      seenUrl.add(s.url_resolved);
      if (fromTag) {
        usedAnywhere.add(s.url_resolved);
        usedAnywhere.add(key);
      }
      stations.push(toStation(s));
      newSources.set(s.stationuuid, s.url_resolved);
    };
    picksByCat[ci].forEach((s) => s && add(s, false));
    for (const list of tagLists[ci]) list.filter(usable).forEach((s) => add(s, true));
    if (stations.length) out.push({ id: cat.id, name: cat.name, stations });
  });
  if (out.length) sources = newSources;
  return out;
}

let cache: { at: number; data: RadioCategory[] } | null = null;
let loading: Promise<RadioCategory[]> | null = null;

/** Yayından gerçekten ses geliyor mu? (ilk veri parçası, 7 sn içinde) */
async function alive(url: string): Promise<boolean> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Yuzbir radio check)' } });
    if (!res.ok || !res.body) return false;
    const { value } = await res.body.getReader().read();
    return !!value?.length;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    ac.abort();
  }
}

/** Arka planda bütün kanalları dener, ses gelmeyenleri listeden çıkarır. */
async function prune(data: RadioCategory[]) {
  const ids = [...new Set(data.flatMap((c) => c.stations.map((s) => s.id)))];
  const dead = new Set<string>();
  await pool(ids, 12, async (id) => {
    const src = sources.get(id);
    if (src && !(await alive(src))) dead.add(id);
  });
  if (!dead.size || !cache || cache.data !== data) return;
  cache.data = data
    .map((c) => ({ ...c, stations: c.stations.filter((s) => !dead.has(s.id)) }))
    .filter((c) => c.stations.length);
  console.log(`[radio] ${ids.length} kanal denendi, çalışmayan ${dead.size} kanal listeden çıkarıldı.`);
}

/** Kategoriler ve kanalları (önbellekli). Dizine ulaşılamazsa eski önbellek döner. */
export async function radioCategories(): Promise<RadioCategory[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  loading ??= load()
    .then((data) => {
      if (data.length) {
        cache = { at: Date.now(), data };
        void prune(data);
      }
      return data.length ? data : cache?.data ?? [];
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Aktarılacak yayının kaynak adresi; sadece listedeki HTTP istasyonlar (açık aktarıcı olmasın). */
export function streamSource(id: string): string | null {
  const url = sources.get(id);
  return url && url.startsWith('http://') ? url : null;
}

// Ses efektleri: dosya yerine Web Audio ile üretilen kısa sesler.
// Tarayıcılar ilk kullanıcı etkileşiminden önce ses çalmaya izin vermez; ilk tıklamada ses motoru açılır.

const KEY = 'yuzbir.sound';
let ctx: AudioContext | null = null;
let enabled = read() !== 'off';

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off');
  } catch {
    // yok say
  }
  if (v) sfx.draw();
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    ac();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; delay?: number; to?: number } = {}) {
  if (!enabled) return;
  const c = ac();
  if (!c || c.state !== 'running') return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  const vol = opts.vol ?? 0.12;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  /** Taş çekme: hafif "tık" */
  draw: () => tone(620, 0.07, { type: 'triangle', vol: 0.1, to: 760 }),
  /** Taş atma: masaya konan taş "tak" */
  discard: () => {
    tone(210, 0.07, { type: 'square', vol: 0.06, to: 150 });
    tone(140, 0.09, { type: 'triangle', vol: 0.12, delay: 0.01 });
  },
  /** El açma: yükselen akor */
  open: () => [523, 659, 784].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.09, delay: i * 0.07 })),
  /** İşleme / per indirme */
  lay: () => tone(700, 0.09, { type: 'triangle', vol: 0.09, to: 880 }),
  /** Okey alma: parıltı */
  okey: () => [988, 1319, 1568, 1976].forEach((f, i) => tone(f, 0.12, { type: 'sine', vol: 0.07, delay: i * 0.05 })),
  /** Ceza: alçak vızıltı */
  penalty: () => tone(150, 0.28, { type: 'sawtooth', vol: 0.06, to: 110 }),
  /** Sıra sende: iki notalı zil */
  turn: () => {
    tone(880, 0.14, { type: 'sine', vol: 0.11 });
    tone(1320, 0.2, { type: 'sine', vol: 0.11, delay: 0.12 });
  },
  /** El bitti: kısa fanfar */
  handEnd: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.4 : 0.14, { type: 'triangle', vol: 0.1, delay: i * 0.11 })),
};

// ---------- sıra bildirimi ----------

const NOTIF_KEY = 'yuzbir.notify';

export function notifySupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notifyEnabled() {
  if (!notifySupported() || Notification.permission !== 'granted') return false;
  try {
    return localStorage.getItem(NOTIF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export async function setNotifyEnabled(v: boolean): Promise<boolean> {
  if (!notifySupported()) return false;
  if (v && Notification.permission === 'default') await Notification.requestPermission();
  try {
    localStorage.setItem(NOTIF_KEY, v ? 'on' : 'off');
  } catch {
    // yok say
  }
  return notifyEnabled();
}

let titleTimer: number | null = null;
const baseTitle = typeof document !== 'undefined' ? document.title : 'Yüzbir';

/** Sekme arkadayken sıra gelince: başlık yanıp söner, izin varsa tarayıcı bildirimi. */
export function announceTurn(body: string) {
  if (typeof document === 'undefined' || !document.hidden) return;
  if (notifyEnabled()) {
    try {
      const n = new Notification('Sıra sende!', { body, icon: '/favicon.svg', tag: 'yuzbir-turn' });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // bazı tarayıcılarda sayfa içinden bildirim desteklenmez
    }
  }
  if (titleTimer !== null) return;
  let on = false;
  titleTimer = window.setInterval(() => {
    on = !on;
    document.title = on ? '● Sıra sende! — Yüzbir' : baseTitle;
  }, 900);
  const stop = () => {
    if (titleTimer !== null) window.clearInterval(titleTimer);
    titleTimer = null;
    document.title = baseTitle;
    document.removeEventListener('visibilitychange', onVis);
  };
  const onVis = () => {
    if (!document.hidden) stop();
  };
  document.addEventListener('visibilitychange', onVis);
}

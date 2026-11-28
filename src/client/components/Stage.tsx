import { useEffect, useState, type ReactNode } from 'react';

/** Telefon mu? Dar ekran ya da dokunmatik + küçük ekran. */
export function useIsMobile() {
  const query = '(max-width: 760px), (max-height: 520px), (pointer: coarse) and (max-width: 1100px)';
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

/**
 * Sahne:
 * - fixed: 1920×1080 tuvali pencereye sığdırır (masaüstü)
 * - game: telefonda yatay oyun için 1100×500 tuval; dik tutulursa "yan çevir" uyarısı
 * - page: telefonda menü ekranları; ölçekleme yok, sayfa dikey kayar
 */
export function Stage({ children, mode = 'fixed' }: { children: ReactNode; mode?: 'fixed' | 'game' | 'page' }) {
  const W = mode === 'game' ? 1100 : 1920;
  const H = mode === 'game' ? 500 : 1080;
  const [box, setBox] = useState({ scale: 1, x: 0, y: 0, portrait: false });
  useEffect(() => {
    const fit = () => {
      const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
      setBox({
        scale,
        x: (window.innerWidth - W * scale) / 2,
        y: (window.innerHeight - H * scale) / 2,
        portrait: window.innerHeight > window.innerWidth,
      });
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
    };
  }, [W, H]);

  if (mode === 'page') {
    return (
      <div className="stage-wrap">
        <Scene />
        <div className="mobile-page">{children}</div>
      </div>
    );
  }
  return (
    <div className="stage-wrap">
      <Scene />
      <div className="stage" style={{ width: W, height: H, transform: `translate(${box.x}px, ${box.y}px) scale(${box.scale})` }}>
        {children}
      </div>
      {mode === 'game' && box.portrait && (
        <div className="rotate-hint" role="alert">
          <svg aria-hidden="true" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M3 14a9 9 0 0 0 7 7" />
            <path d="M3 18v-4h4" />
          </svg>
          <b>Telefonunu yan çevir</b>
          <span>Oyun yatay ekranda oynanır.</span>
        </div>
      )}
    </div>
  );
}

/** Bütün pencereyi kaplayan manzara (gökyüzü, güneş, bulutlar, kanyonlar). */
function Scene() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="sun" />
      <div className="cloud" style={{ left: '25%', top: '7%', width: '10%', height: '4.5%' }} />
      <div className="cloud" style={{ left: '28%', top: '4.5%', width: '5.2%', height: '5.5%' }} />
      <div className="cloud" style={{ left: '66%', top: '11%', width: '8.3%', height: '3.7%' }} />
      <svg width="100%" height="56%" viewBox="0 0 1440 450" preserveAspectRatio="none">
        <path
          d="M0 260 L120 260 L150 200 L330 200 L360 260 L520 260 L560 170 L760 170 L790 240 L980 240 L1010 150 L1220 150 L1250 230 L1440 230 L1440 450 L0 450 Z"
          style={{ fill: 'var(--mesa1)' }}
        />
        <path
          d="M0 330 L200 330 L230 280 L420 280 L450 330 L860 330 L890 270 L1090 270 L1120 330 L1440 330 L1440 450 L0 450 Z"
          style={{ fill: 'var(--mesa2)' }}
        />
        <rect x="0" y="380" width="1440" height="70" style={{ fill: 'var(--ground)' }} />
      </svg>
    </div>
  );
}

export function Logo() {
  return (
    <div className="logo">
      <div className="mini-tile">101</div>
      <span className="word">YÜZBİR</span>
    </div>
  );
}

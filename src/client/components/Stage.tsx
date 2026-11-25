import { useEffect, useState, type ReactNode } from 'react';

/** 1920×1080 sahneyi pencereye sığacak şekilde ölçekler. */
export function Stage({ children }: { children: ReactNode }) {
  const [box, setBox] = useState({ scale: 1, x: 0, y: 0 });
  useEffect(() => {
    const fit = () => {
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      setBox({
        scale,
        x: (window.innerWidth - 1920 * scale) / 2,
        y: (window.innerHeight - 1080 * scale) / 2,
      });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="stage-wrap">
      <Scene />
      <div
        className="stage"
        style={{ transform: `translate(${box.x}px, ${box.y}px) scale(${box.scale})` }}
      >
        {children}
      </div>
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

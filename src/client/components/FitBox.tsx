import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * İçeriği kutuya sığdırır: içerik kutudan büyükse orantılı olarak küçültür (kaydırma çubuğu çıkmaz).
 * transform düzeni etkilemediği için içeriğin doğal boyutu ölçülebilir.
 */
export function FitBox(props: { className: string; innerClassName?: string; min?: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const min = props.min ?? 0.45;

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      const w = i.scrollWidth;
      const h = i.scrollHeight;
      if (!w || !h) return setScale(1);
      setScale(Math.max(min, Math.min(1, o.clientWidth / w, o.clientHeight / h)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(i);
    ro.observe(o);
    return () => ro.disconnect();
  }, [min]);

  return (
    <div ref={outer} className={props.className} style={{ overflow: 'hidden' }}>
      <div
        ref={inner}
        className={props.innerClassName}
        style={{ width: 'max-content', transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: 'top left' }}
      >
        {props.children}
      </div>
    </div>
  );
}

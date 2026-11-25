import { useState } from 'react';
import type { Settings } from '../../shared/types';
import { Logo, Scene } from '../components/Stage';
import { socket } from '../socket';

function Pills<T extends string | number>(props: {
  label: string;
  value: T;
  options: { v: T; l: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="pill-group" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          className="pill"
          aria-pressed={props.value === o.v}
          onClick={() => props.onChange(o.v)}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function rulesSummary(s: Settings): string[] {
  const esli = s.mode === 'esli';
  return [
    s.katlamali
      ? 'İlk açılış 101 seri veya 5 çift, sonrakiler en yüksek açılışın en az 1 üstü'
      : 'Herkes 101 seri veya 5 çift ile açar',
    'Baraj: 150+ seri veya 7+ çift açan -101 yazar',
    esli
      ? s.katlamali
        ? s.esKatlama
          ? 'Eşinin açılışı da senin sınırını yükseltir'
          : 'Sadece rakip takımın açılışı sınırını yükseltir'
        : 'Eşler karşılıklı oturur, eşli modda bot eklenemez'
      : 'Boş koltuklara bot eklenebilir, botlar el açmaz',
    `${s.hands} el · Hamle süresi ${s.turnSeconds} sn`,
  ];
}

export function CreateTable({ onCancel }: { onCancel: () => void }) {
  const [name, setName] = useState('');
  const [s, setS] = useState<Settings>({
    mode: 'tekli',
    katlamali: true,
    esKatlama: false,
    hands: 9,
    turnSeconds: 45,
  });
  const set = (patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch }));
  const esli = s.mode === 'esli';

  return (
    <>
      <Scene />
      <div style={{ position: 'absolute', left: 48, top: 32 }}>
        <Logo />
      </div>
      <button className="btn" style={{ position: 'absolute', right: 48, top: 44 }} onClick={onCancel}>
        Lobiye dön
      </button>
      <form
        className="panel"
        style={{ left: 260, top: 150, width: 1400, height: 860 }}
        onSubmit={(e) => {
          e.preventDefault();
          socket.emit('table:create', { name, settings: s });
        }}
      >
        <div className="panel-head">
          <h1>Yeni Masa Kur</h1>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '720px minmax(0, 1fr)', gap: 48, padding: '36px 48px 40px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="label" htmlFor="masaAdi">Masa adı</label>
              <input id="masaAdi" className="input" placeholder="Akşam masası" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="label">Oyun tipi</span>
              <Pills
                label="Oyun tipi"
                value={s.mode}
                options={[{ v: 'tekli', l: 'Tekli' }, { v: 'esli', l: 'Eşli (2’ye 2)' }]}
                onChange={(mode) => set({ mode, esKatlama: mode === 'esli' ? s.esKatlama : false })}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span className="label">Açma modu</span>
                <span className="hint">{s.katlamali ? 'Her açılış sınırı yükseltir' : 'Sınır hep 101 / 5 çift'}</span>
              </div>
              <Pills
                label="Açma modu"
                value={s.katlamali ? 'k' : 'n'}
                options={[{ v: 'k', l: 'Katlamalı' }, { v: 'n', l: 'Katlamasız' }]}
                onChange={(v) => set({ katlamali: v === 'k' })}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span className="label">Eşe katlama</span>
                {!(esli && s.katlamali) && <span className="hint">{esli ? 'Katlamasız modda etkisi yok' : 'Sadece eşli modda'}</span>}
              </div>
              {esli && s.katlamali ? (
                <Pills
                  label="Eşe katlama"
                  value={s.esKatlama ? 'e' : 'h'}
                  options={[{ v: 'e', l: 'Evet' }, { v: 'h', l: 'Hayır' }]}
                  onChange={(v) => set({ esKatlama: v === 'e' })}
                />
              ) : (
                <div style={{ height: 50, display: 'flex', alignItems: 'center', padding: '0 16px', border: '3px dashed #C9B48A', borderRadius: 14, fontWeight: 700, color: 'var(--ink-soft)' }}>
                  Eşli ve katlamalı modda açılır
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="label">El sayısı</span>
                <Pills label="El sayısı" value={s.hands} options={[5, 7, 9, 11].map((v) => ({ v, l: String(v) }))} onChange={(hands) => set({ hands })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="label">Hamle süresi</span>
                <Pills label="Hamle süresi" value={s.turnSeconds} options={[30, 45, 60].map((v) => ({ v, l: `${v} sn` }))} onChange={(turnSeconds) => set({ turnSeconds })} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'none', background: '#fff' }}>
              <span className="label" style={{ fontSize: 13 }}>Masa kuralları</span>
              {rulesSummary(s).map((l) => (
                <div key={l} style={{ display: 'flex', gap: 10, fontWeight: 700, fontSize: 17, lineHeight: 1.35 }}>
                  <span aria-hidden="true" style={{ flexShrink: 0, width: 9, height: 9, marginTop: 8, borderRadius: '50%', background: '#E0782E' }} />
                  <span>{l}</span>
                </div>
              ))}
            </div>
            <div className="hint" style={{ fontSize: 16, lineHeight: 1.5 }}>
              Masayı kurduktan sonra koltukları görür, {esli ? 'davet linkini eşine ve rakiplerine gönderirsin.' : 'boş koltuklara bot ekleyebilir ya da davet linkini paylaşabilirsin.'}
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', gap: 12 }}>
              <button type="submit" className="btn go big" style={{ flex: 1 }}>Masayı Kur</button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}

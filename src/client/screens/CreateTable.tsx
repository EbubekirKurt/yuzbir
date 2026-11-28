import { useState } from 'react';

const MAX_HANDS = 33;
import type { Settings } from '../../shared/types';
import { FriendPicker } from '../components/Friends';
import { Logo } from '../components/Stage';
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
    `${s.hands} el · Hamle süresi ${s.turnSeconds} sn · İşlek uyarısı ${s.islekUyari === false ? 'kapalı' : 'açık'}`,
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
    islekUyari: true,
  });
  const set = (patch: Partial<Settings>) => {
    setS((p) => ({ ...p, ...patch }));
    if (patch.hands !== undefined) setHandsText(String(patch.hands));
  };
  const [invite, setInvite] = useState<string[]>([]);
  const [customHands, setCustomHands] = useState(false);
  const [handsText, setHandsText] = useState('9');
  const esli = s.mode === 'esli';

  return (
    <>
      <div className="top-left" style={{ position: 'absolute', left: 48, top: 32 }}>
        <Logo />
      </div>
      <button className="btn top-right" style={{ position: 'absolute', right: 48, top: 44 }} onClick={onCancel}>
        Lobiye dön
      </button>
      <form
        className="panel"
        style={{ left: 260, top: 150, width: 1400, height: 860 }}
        onSubmit={(e) => {
          e.preventDefault();
          socket.emit('table:create', { name, settings: s, invite });
        }}
      >
        <div className="panel-head">
          <h1>Yeni Masa Kur</h1>
        </div>
        <div className="split" style={{ flex: 1, display: 'grid', gridTemplateColumns: '720px minmax(0, 1fr)', gap: 48, padding: '36px 48px 40px' }}>
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
                <div style={{ height: 50, display: 'flex', alignItems: 'center', padding: '0 16px', border: '3px dashed var(--line-strong)', borderRadius: 14, fontWeight: 700, color: 'var(--text-soft)' }}>
                  Eşli ve katlamalı modda açılır
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span className="label">El sayısı</span>
                <span className="hint">1-11 ya da "Diğer" ile en fazla {MAX_HANDS}</span>
              </div>
              <div className="pill-group compact" role="group" aria-label="El sayısı">
                {Array.from({ length: 11 }, (_, i) => i + 1).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="pill"
                    aria-pressed={!customHands && s.hands === v}
                    onClick={() => {
                      setCustomHands(false);
                      set({ hands: v });
                    }}
                  >
                    {v}
                  </button>
                ))}
                <button
                  type="button"
                  className="pill"
                  aria-pressed={customHands}
                  onClick={() => {
                    setCustomHands(true);
                    if (s.hands <= 11) set({ hands: 12 });
                  }}
                >
                  Diğer
                </button>
                {customHands && (
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={MAX_HANDS}
                    aria-label={`El sayısı (1-${MAX_HANDS})`}
                    style={{ width: 96, height: 46 }}
                    value={handsText}
                    onChange={(e) => {
                      setHandsText(e.target.value);
                      const n = Number(e.target.value);
                      if (Number.isInteger(n) && n >= 1 && n <= MAX_HANDS) set({ hands: n });
                    }}
                    onBlur={() => setHandsText(String(s.hands))}
                  />
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="label">Hamle süresi</span>
              <Pills label="Hamle süresi" value={s.turnSeconds} options={[30, 45, 60].map((v) => ({ v, l: `${v} sn` }))} onChange={(turnSeconds) => set({ turnSeconds })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span className="label">İşlek uyarısı</span>
                <span className="hint">İşlek taş ya da okey atmadan önce "101 ceza yazılır" diye sorar</span>
              </div>
              <Pills
                label="İşlek uyarısı"
                value={s.islekUyari === false ? 'h' : 'e'}
                options={[{ v: 'e', l: 'Açık' }, { v: 'h', l: 'Kapalı' }]}
                onChange={(v) => set({ islekUyari: v === 'e' })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'none', background: 'var(--surface)' }}>
              <span className="label" style={{ fontSize: 13 }}>Masa kuralları</span>
              {rulesSummary(s).map((l) => (
                <div key={l} style={{ display: 'flex', gap: 10, fontWeight: 700, fontSize: 17, lineHeight: 1.35 }}>
                  <span aria-hidden="true" style={{ flexShrink: 0, width: 9, height: 9, marginTop: 8, borderRadius: '50%', background: '#E0782E' }} />
                  <span>{l}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
              <span className="label">Arkadaşlarını davet et</span>
              <FriendPicker selected={invite} onChange={setInvite} />
            </div>
            <div className="hint" style={{ fontSize: 15, lineHeight: 1.5 }}>
              Seçtiğin çevrimiçi arkadaşlara masa kurulunca davet gider. {esli ? 'Davet linkini eşine ve rakiplerine de gönderebilirsin.' : 'Boş koltuklara bot da ekleyebilirsin.'}
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', gap: 12 }}>
              <button type="submit" className="btn go big" style={{ flex: 1 }}>
                {invite.length ? `Masayı Kur ve ${invite.length} kişiyi davet et` : 'Masayı Kur'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}

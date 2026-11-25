import type { GameView, Settings } from '../../shared/types';

const STATUS_LABEL = { bitti: 'Bitti', acti: 'Açtı', acmadi: 'Açmadı' } as const;

function openText(kind: 'seri' | 'cift' | null, value: number) {
  if (!kind) return '—';
  return kind === 'seri' ? `Seri ${value}` : `Çift ${value}`;
}

export function ranking(totals: number[]): number[] {
  return totals.map((t) => totals.filter((x) => x < t).length + 1);
}

const RANK_BG = ['#FFD23F', '#E3E3E3', '#F0B98A', '#F1E4CF'];

export function ScoreModal(props: {
  game: GameView;
  settings: Settings;
  tab: string;
  onTab: (t: string) => void;
  onClose?: () => void;
  banner?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const g = props.game;
  const names = g.players.map((p) => p.name);
  const live = g.phase === 'draw' || g.phase === 'play';
  const tabs = [
    { id: 'genel', label: 'Genel' },
    ...g.history.map((h) => ({ id: String(h.handNo), label: `El ${h.handNo}` })),
    ...(live ? [{ id: 'now', label: `El ${g.handNo} · sürüyor` }] : []),
  ];
  const tab = tabs.some((t) => t.id === props.tab) ? props.tab : 'genel';
  const ranks = ranking(g.totals);
  const handCols = `170px repeat(${g.totalHands}, minmax(0, 1fr)) 140px 100px`;
  const detailCols = '150px 130px 130px 110px 100px 120px minmax(0, 1fr) 100px 130px';
  const esli = props.settings.mode === 'esli';

  const hand = g.history.find((h) => String(h.handNo) === tab);

  return (
    <>
      <div className="overlay" onClick={props.onClose} />
      <div className="panel modal" role="dialog" aria-modal="true" aria-labelledby="puanBaslik">
        <div className="panel-head">
          <h2 id="puanBaslik">Puan Tablosu</h2>
          <span className="meta">
            {props.settings.mode === 'esli' ? 'Eşli' : 'Tekli'} · {props.settings.katlamali ? 'Katlamalı' : 'Katlamasız'} · {g.totalHands} el
          </span>
          {props.onClose && (
            <button className="icon-btn" style={{ marginLeft: 'auto', width: 52, height: 52 }} aria-label="Kapat" onClick={props.onClose}>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: '22px 32px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {props.banner}
          <div className="tabs" role="tablist" aria-label="Eller">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" className="pill" aria-pressed={tab === t.id} aria-selected={tab === t.id} onClick={() => props.onTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {tab === 'genel' && (
              <>
                <div className="grid-table" role="table" aria-label="Genel puan durumu">
                  <div className="grid-row head r" role="row" style={{ gridTemplateColumns: handCols }}>
                    <span role="columnheader" style={{ textAlign: 'left' }}>Oyuncu</span>
                    {Array.from({ length: g.totalHands }, (_, i) => (
                      <span key={i} role="columnheader">El {i + 1}</span>
                    ))}
                    <span role="columnheader">Toplam</span>
                    <span role="columnheader" style={{ textAlign: 'center' }}>Sıra</span>
                  </div>
                  {names.map((n, seat) => (
                    <div key={seat} className={`grid-row r ${ranks[seat] === 1 ? 'win' : ''}`} role="row" style={{ gridTemplateColumns: handCols, minHeight: 66, fontSize: 18 }}>
                      <span role="rowheader" style={{ textAlign: 'left', fontWeight: 900 }}>
                        {n}
                        {seat === g.you ? ' (sen)' : ''}
                      </span>
                      {Array.from({ length: g.totalHands }, (_, i) => {
                        const h = g.history[i];
                        const txt = h ? String(h.rows[seat].total) : i === g.handNo - 1 && live ? '…' : '—';
                        return (
                          <span key={i} role="cell" style={{ color: h ? undefined : 'var(--text-soft)' }}>{txt}</span>
                        );
                      })}
                      <span role="cell" className="baloo" style={{ fontWeight: 800, fontSize: 26 }}>{g.totals[seat]}</span>
                      <span role="cell" style={{ display: 'flex', justifyContent: 'center' }}>
                        <span className="rank" style={{ background: RANK_BG[ranks[seat] - 1] }}>{ranks[seat]}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {esli && (
                  <div className="grid-table" role="table" aria-label="Takım puanları">
                    {[0, 1].map((team) => (
                      <div key={team} className="grid-row" role="row" style={{ gridTemplateColumns: 'minmax(0, 1fr) 160px', fontSize: 18 }}>
                        <span role="rowheader" style={{ fontWeight: 900 }}>
                          Takım: {names[team]} + {names[team + 2]}
                        </span>
                        <span role="cell" className="r baloo" style={{ fontWeight: 800, fontSize: 26 }}>
                          {g.totals[team] + g.totals[team + 2]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="hint" style={{ margin: 0, fontSize: 15 }}>
                  Puanı düşük olan önde. Süren elin cezaları el bitince toplama eklenir. Bir elin ayrıntısı için üstteki sekmelerden o eli seç.
                </p>
              </>
            )}

            {hand && (
              <>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span className="chip white">{hand.finisher === null ? 'Bitiren yok' : `Bitiren: ${names[hand.finisher]}`}</span>
                  <span className="chip white">{hand.finishLabel}</span>
                  <span className="chip white">Kat k = {hand.k}</span>
                  <span className="chip white">Okey: {hand.okeyName}</span>
                </div>
                <div className="grid-table" role="table" aria-label="El detayı">
                  <div className="grid-row head" role="row" style={{ gridTemplateColumns: detailCols }}>
                    <span role="columnheader">Oyuncu</span>
                    <span role="columnheader">Durum</span>
                    <span role="columnheader">Açılış</span>
                    <span role="columnheader" className="r">Elde kalan</span>
                    <span role="columnheader" className="r">Kat</span>
                    <span role="columnheader" className="r">Kalan puanı</span>
                    <span role="columnheader" style={{ paddingLeft: 24 }}>Cezalar</span>
                    <span role="columnheader" className="r">Baraj</span>
                    <span role="columnheader" className="r">El puanı</span>
                  </div>
                  {hand.rows.map((r) => (
                    <div key={r.seat} className={`grid-row ${r.status === 'bitti' ? 'win' : ''}`} role="row" style={{ gridTemplateColumns: detailCols, minHeight: 72 }}>
                      <span role="rowheader" style={{ fontWeight: 900, fontSize: 19 }}>{names[r.seat]}</span>
                      <span role="cell"><span className={`status ${r.status}`}>{STATUS_LABEL[r.status]}</span></span>
                      <span role="cell">{openText(r.openKind, r.openValue)}</span>
                      <span role="cell" className="r">{r.remaining ?? '—'}</span>
                      <span role="cell" className="r">×{r.kat}</span>
                      <span role="cell" className="r">{r.base}</span>
                      <span role="cell" style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                        {r.penalties.length === 0 ? (
                          <span style={{ color: 'var(--text-soft)' }}>—</span>
                        ) : (
                          r.penalties.map((p, i) => (
                            <span key={i} className="pen">{p.reason} · +{p.amount}</span>
                          ))
                        )}
                      </span>
                      <span role="cell" className="r">{r.baraj ? '-101' : '—'}</span>
                      <span role="cell" className="r baloo" style={{ fontWeight: 800, fontSize: 24 }}>{r.total}</span>
                    </div>
                  ))}
                </div>
                <p className="hint" style={{ margin: 0, fontSize: 15 }}>
                  Kalan puanı = elde kalan × k (çiftle açan için × 2k). Açmayan oyuncu 202 × k yazar. Elde kalan okey 101 sayılır. Cezalar ve baraj ayrıca eklenir.
                </p>
              </>
            )}

            {tab === 'now' && (
              <>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span className="chip white">El sürüyor</span>
                  <span className="chip white">Destede {g.deckCount} taş</span>
                </div>
                <div className="grid-table" role="table" aria-label="Süren el">
                  <div className="grid-row head" role="row" style={{ gridTemplateColumns: '200px 160px 160px minmax(0, 1fr) 120px' }}>
                    <span role="columnheader">Oyuncu</span>
                    <span role="columnheader">Durum</span>
                    <span role="columnheader">Açılış</span>
                    <span role="columnheader">Şimdiye kadarki cezalar</span>
                    <span role="columnheader" className="r">Baraj</span>
                  </div>
                  {g.players.map((p) => (
                    <div key={p.seat} className="grid-row" role="row" style={{ gridTemplateColumns: '200px 160px 160px minmax(0, 1fr) 120px', minHeight: 66 }}>
                      <span role="rowheader" style={{ fontWeight: 900, fontSize: 19 }}>{p.name}</span>
                      <span role="cell"><span className={`status ${p.opened ? 'acti' : 'acmadi'}`}>{p.opened ? 'Açtı' : 'Açmadı'}</span></span>
                      <span role="cell">{openText(p.opened, p.openValue)}</span>
                      <span role="cell" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {g.currentPenalties[p.seat].length === 0 ? (
                          <span style={{ color: 'var(--text-soft)' }}>—</span>
                        ) : (
                          g.currentPenalties[p.seat].map((x, i) => (
                            <span key={i} className="pen">{x.reason} · +{x.amount}</span>
                          ))
                        )}
                      </span>
                      <span role="cell" className="r">{g.currentBaraj[p.seat] ? '-101' : '—'}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {props.footer}
        </div>
      </div>
    </>
  );
}

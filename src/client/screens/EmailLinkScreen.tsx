import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Me } from '../../shared/types';
import { Logo } from '../components/Stage';
import { api } from '../socket';

export type EmailLink = { kind: 'verify' | 'reset'; token: string };

/** Mail linkleri: /dogrula/<token> ve /sifre/<token> */
export function emailLinkFromUrl(): EmailLink | null {
  const m = /^\/(dogrula|sifre)\/([A-Za-z0-9_-]{20,100})\/?$/.exec(location.pathname);
  return m ? { kind: m[1] === 'dogrula' ? 'verify' : 'reset', token: m[2] } : null;
}

export function EmailLinkScreen(props: { link: EmailLink; onDone: (me?: Me) => void }) {
  return props.link.kind === 'verify' ? <VerifyEmail token={props.link.token} onDone={() => props.onDone()} /> : <ResetPassword token={props.link.token} onDone={props.onDone} />;
}

function Shell(props: { title: string; height: number; children: ReactNode }) {
  return (
    <>
      <div className="top-left" style={{ position: 'absolute', left: 48, top: 32 }}>
        <Logo />
      </div>
      <div className="panel" style={{ left: 610, top: 180, width: 700, height: props.height }}>
        <div className="panel-head">
          <h1>{props.title}</h1>
        </div>
        <div style={{ padding: '30px 44px 36px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>{props.children}</div>
      </div>
    </>
  );
}

function VerifyEmail({ token, onDone }: { token: string; onDone: () => void }) {
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // StrictMode'da iki kez çalışıp tek kullanımlık linki harcamasın
    started.current = true;
    api
      .verifyEmail(token)
      .then((r) => setState({ ok: true, text: `Teşekkürler ${r.displayName}, e-posta adresin doğrulandı.` }))
      .catch((err) => setState({ ok: false, text: (err as Error).message }));
  }, [token]);

  return (
    <Shell title="E-posta doğrulama" height={420}>
      <div role="status" style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.45, color: state && !state.ok ? 'var(--bad-text)' : undefined }}>
        {state ? state.text : 'Doğrulanıyor…'}
      </div>
      {state && !state.ok && (
        <p className="hint" style={{ margin: 0, fontSize: 16 }}>Giriş yaptıktan sonra profilinden yeni bir doğrulama linki isteyebilirsin.</p>
      )}
      <button className="btn go big" style={{ marginTop: 'auto' }} disabled={!state} onClick={onDone}>
        Devam et
      </button>
    </Shell>
  );
}

function ResetPassword({ token, onDone }: { token: string; onDone: (me?: Me) => void }) {
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (password !== password2) return setError('Şifreler aynı değil.');
    setBusy(true);
    try {
      onDone(await api.resetPassword(token, password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Yeni şifre belirle" height={560}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="label" htmlFor="newPassword">Yeni şifre</label>
          <input id="newPassword" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="hint">En az 6 karakter. Kaydedince diğer cihazlardaki oturumların kapanır.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="label" htmlFor="newPassword2">Yeni şifre (tekrar)</label>
          <input id="newPassword2" className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
        </div>
        {error && (
          <div role="alert" style={{ fontWeight: 800, fontSize: 16, color: 'var(--bad-text)' }}>{error}</div>
        )}
        <div style={{ marginTop: 'auto', display: 'flex', gap: 12 }}>
          <button type="button" className="btn big" onClick={() => onDone()}>
            Vazgeç
          </button>
          <button type="submit" className="btn go big" style={{ flex: 1 }} disabled={busy || !password || !password2}>
            Şifremi kaydet
          </button>
        </div>
      </form>
    </Shell>
  );
}

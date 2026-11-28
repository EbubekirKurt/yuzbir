import { useState } from 'react';
import type { Me } from '../../shared/types';
import { Logo } from '../components/Stage';
import { api } from '../socket';

type Mode = 'login' | 'register' | 'forgot';

export function AuthScreen({ onAuthed, invited }: { onAuthed: (me: Me) => void; invited: boolean }) {
  const [mode, setMode] = useState<Mode>(invited ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const register = mode === 'register';
  const forgot = mode === 'forgot';

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setSent(false);
  };

  const submit = async () => {
    setError(null);
    if (register && password !== password2) return setError('Şifreler aynı değil.');
    setBusy(true);
    try {
      if (forgot) {
        await api.forgotPassword(email.trim());
        setSent(true);
      } else {
        const me = register ? await api.register(username, password, email.trim()) : await api.login(username, password);
        onAuthed(me);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const height = register ? 900 : forgot ? 560 : 720;
  const disabled = busy || (forgot ? !email.trim() || sent : !username.trim() || !password || (register && (!password2 || !email.trim())));

  return (
    <>
      <div className="top-left" style={{ position: 'absolute', left: 48, top: 32 }}>
        <Logo />
      </div>
      <form
        className="panel"
        style={{ left: 610, top: register ? 100 : 150, width: 700, height }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="panel-head">
          <h1>{register ? 'Hesap oluştur' : forgot ? 'Şifremi unuttum' : 'Giriş yap'}</h1>
        </div>
        <div style={{ padding: '30px 44px 36px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
          {invited && !forgot && (
            <div className="card" style={{ padding: '14px 18px', boxShadow: 'none', background: 'var(--chip)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 17 }}>
              Bir masaya davet edildin. Oynamak için giriş yap ya da hesap oluştur.
            </div>
          )}
          {!forgot && (
            <div className="pill-group" role="tablist" aria-label="Giriş ya da kayıt">
              <button type="button" role="tab" className="pill" aria-pressed={!register} aria-selected={!register} onClick={() => switchMode('login')}>
                Giriş yap
              </button>
              <button type="button" role="tab" className="pill" aria-pressed={register} aria-selected={register} onClick={() => switchMode('register')}>
                Hesap oluştur
              </button>
            </div>
          )}

          {forgot ? (
            <>
              <p className="hint" style={{ margin: 0, fontSize: 17, lineHeight: 1.5 }}>
                Hesabına kayıtlı e-posta adresini yaz. Yeni şifre belirlemen için bir link göndereceğiz.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="label" htmlFor="email">E-posta</label>
                <input id="email" className="input" type="email" autoComplete="email" value={email} maxLength={254} onChange={(e) => { setEmail(e.target.value); setSent(false); }} />
              </div>
              {sent && (
                <div role="status" className="card" style={{ padding: '14px 18px', boxShadow: 'none', background: 'var(--surface)', fontWeight: 800, fontSize: 16, lineHeight: 1.45 }}>
                  Bu adrese bağlı bir hesap varsa sıfırlama linkini gönderdik. Gelen kutunu ve gereksiz (spam) klasörünü kontrol et. Link 30 dakika geçerli.
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="label" htmlFor="username">Kullanıcı adı</label>
                <input id="username" className="input" autoComplete="username" value={username} maxLength={20} onChange={(e) => setUsername(e.target.value)} />
                {register && <span className="hint">3-20 karakter; harf, rakam, nokta ve alt çizgi.</span>}
              </div>
              {register && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="label" htmlFor="email">E-posta</label>
                  <input id="email" className="input" type="email" autoComplete="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
                  <span className="hint">Şifreni unutursan sıfırlamak için. Doğrulama linki göndereceğiz; kimseye gösterilmez.</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <label className="label" htmlFor="password">Şifre</label>
                  {!register && (
                    <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
                      Şifremi unuttum
                    </button>
                  )}
                </div>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete={register ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {register && <span className="hint">En az 6 karakter.</span>}
              </div>
              {register && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="label" htmlFor="password2">Şifre (tekrar)</label>
                  <input id="password2" className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
                </div>
              )}
            </>
          )}

          {error && (
            <div role="alert" style={{ fontWeight: 800, fontSize: 16, color: 'var(--bad-text)' }}>{error}</div>
          )}
          <div style={{ marginTop: 'auto', display: 'flex', gap: 12 }}>
            {forgot && (
              <button type="button" className="btn big" onClick={() => switchMode('login')}>
                Geri
              </button>
            )}
            <button type="submit" className="btn go big" style={{ flex: 1 }} disabled={disabled}>
              {register ? 'Hesabımı oluştur' : forgot ? 'Sıfırlama linki gönder' : 'Giriş yap'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

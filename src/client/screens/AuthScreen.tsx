import { useState } from 'react';
import type { Me } from '../../shared/types';
import { Logo } from '../components/Stage';
import { api } from '../socket';

export function AuthScreen({ onAuthed, invited }: { onAuthed: (me: Me) => void; invited: boolean }) {
  const [mode, setMode] = useState<'login' | 'register'>(invited ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const register = mode === 'register';

  const submit = async () => {
    setError(null);
    if (register && password !== password2) return setError('Şifreler aynı değil.');
    setBusy(true);
    try {
      const me = register ? await api.register(username, password) : await api.login(username, password);
      onAuthed(me);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="top-left" style={{ position: 'absolute', left: 48, top: 32 }}>
        <Logo />
      </div>
      <form
        className="panel"
        style={{ left: 610, top: 150, width: 700, height: register ? 780 : 680 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="panel-head">
          <h1>{register ? 'Hesap oluştur' : 'Giriş yap'}</h1>
        </div>
        <div style={{ padding: '30px 44px 36px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
          {invited && (
            <div className="card" style={{ padding: '14px 18px', boxShadow: 'none', background: 'var(--chip)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 17 }}>
              Bir masaya davet edildin. Oynamak için giriş yap ya da hesap oluştur.
            </div>
          )}
          <div className="pill-group" role="tablist" aria-label="Giriş ya da kayıt">
            <button type="button" role="tab" className="pill" aria-pressed={!register} aria-selected={!register} onClick={() => { setMode('login'); setError(null); }}>
              Giriş yap
            </button>
            <button type="button" role="tab" className="pill" aria-pressed={register} aria-selected={register} onClick={() => { setMode('register'); setError(null); }}>
              Hesap oluştur
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="label" htmlFor="username">Kullanıcı adı</label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              value={username}
              maxLength={20}
              onChange={(e) => setUsername(e.target.value)}
            />
            {register && <span className="hint">3-20 karakter; harf, rakam, nokta ve alt çizgi.</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="label" htmlFor="password">Şifre</label>
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
              <input
                id="password2"
                className="input"
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </div>
          )}
          {error && (
            <div role="alert" style={{ fontWeight: 800, fontSize: 16, color: 'var(--bad-text)' }}>{error}</div>
          )}
          <button
            type="submit"
            className="btn go big"
            style={{ marginTop: 'auto' }}
            disabled={busy || !username.trim() || !password || (register && !password2)}
          >
            {register ? 'Hesabımı oluştur' : 'Giriş yap'}
          </button>
        </div>
      </form>
    </>
  );
}

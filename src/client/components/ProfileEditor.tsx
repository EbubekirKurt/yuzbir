import { useRef, useState } from 'react';
import type { Me } from '../../shared/types';
import { api } from '../socket';
import { Avatar } from './Avatar';

/** Seçilen resmi ortadan kare kırpıp 192×192 JPEG'e küçültür. */
async function toAvatarDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Resim okunamadı.'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 192, 192);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfileEditor({ me, onChange }: { me: Me; onChange: (me: Me) => void }) {
  const [name, setName] = useState(me.displayName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (patch: { displayName?: string; avatar?: string | null }, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const updated = await api.updateProfile(patch);
      onChange(updated);
      setName(updated.displayName);
      setMsg({ text: okText });
    } catch (err) {
      setMsg({ text: (err as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setMsg({ text: 'Lütfen bir resim dosyası seç.', error: true });
    try {
      const dataUrl = await toAvatarDataUrl(file);
      await save({ avatar: dataUrl }, 'Profil fotoğrafın güncellendi.');
    } catch (err) {
      setMsg({ text: (err as Error).message, error: true });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Avatar url={me.avatarUrl} name={me.displayName} size={132} bg="var(--orange)" />
        <input ref={fileRef} id="avatarFile" type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button type="button" className="btn small" disabled={busy} onClick={() => fileRef.current?.click()}>
          Fotoğraf seç
        </button>
        {me.avatarUrl && (
          <button type="button" className="btn small" disabled={busy} onClick={() => save({ avatar: null }, 'Profil fotoğrafın kaldırıldı.')}>
            Fotoğrafı kaldır
          </button>
        )}
      </div>
      <form
        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          save({ displayName: name }, 'Görünen adın kaydedildi.');
        }}
      >
        <label className="label" htmlFor="displayName">Masada görünen adın</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input id="displayName" className="input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" type="submit" disabled={busy || !name.trim() || name.trim() === me.displayName}>
            Kaydet
          </button>
        </div>
        <span className="hint">Kullanıcı adın: {me.username} (giriş için kullanılır, değişmez)</span>
        {msg && (
          <span role="status" style={{ fontWeight: 800, color: msg.error ? 'var(--bad-text)' : 'var(--good-text)' }}>
            {msg.text}
          </span>
        )}
      </form>
    </div>
  );
}

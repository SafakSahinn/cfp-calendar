// Profil fotoğrafı: kendi fotoğrafım (menü, profil), grup arkadaşlarının onaylı fotoğrafları (PeerAvatar).

import { useRef, useState } from 'react';
import { useApp } from '../lib/app';
import { initialsOf, removeAvatar, resizeToAvatar, uploadAvatar, useAvatarSrc } from '../lib/avatar';
import { useI18n } from '../lib/i18n';

function Circle({ src, name, size }: { src: string | null; name: string | null | undefined; size: number }) {
  return src ? (
    <img src={src} alt="" className="avatar" style={{ width: size, height: size }} referrerPolicy="no-referrer" loading="lazy" />
  ) : (
    <span className="avatar avatar-initials" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">{initialsOf(name)}</span>
  );
}

/** Kendi fotoğrafım: son yüklenen (onay bekliyor olsa da) → Google fotoğrafı → baş harfler. */
export function Avatar({ size = 32 }: { size?: number }) {
  const { profile, session } = useApp();
  const src = useAvatarSrc(profile);
  return <Circle src={src} name={profile?.display_name ?? session?.user.email} size={size} />;
}

/** Başka bir üyenin fotoğrafı (yalnızca onaylıysa adres gelir; yoksa baş harfler). */
export function PeerAvatar({ src, name, size = 28 }: { src: string | undefined; name: string | null | undefined; size?: number }) {
  return <Circle src={src ?? null} name={name} size={size} />;
}

/** Profil sayfası: fotoğraf + yükle / değiştir / kaldır + onay durumu. */
export function AvatarEditor() {
  const { t } = useI18n();
  const { profile, session, reloadProfile, showToast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!profile || !session) return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadAvatar(session.user.id, await resizeToAvatar(file));
      await reloadProfile();
      showToast(t.avatarSaved);
    } catch (e) {
      const m = (e as Error).message;
      showToast(m === 'too_large' ? t.avatarTooLarge : m === 'not_image' || m === 'unsupported' ? t.avatarUnsupported : `${t.avatarError}: ${m}`);
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  };
  const remove = async () => {
    setBusy(true);
    try {
      await removeAvatar();
      await reloadProfile();
    } catch (e) {
      showToast((e as Error).message);
    }
    setBusy(false);
  };

  const status = profile.avatar_status;
  return (
    <div className="avatar-editor">
      <Avatar size={72} />
      <div className="avatar-actions">
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} aria-label={t.avatarUpload} />
        <button className="small" disabled={busy} onClick={() => input.current?.click()}>
          📷 {profile.avatar_path ? t.avatarChange : t.avatarUpload}
        </button>
        {(profile.avatar_path || profile.avatar_approved_path) && <button className="small ghost" disabled={busy} onClick={remove}>{t.avatarRemove}</button>}
        {status === 'pending' && <span className="tag avatar-pending">⏳ {t.avatarPending}</span>}
        {status === 'approved' && <span className="tag avatar-approved">✓ {t.avatarApproved}</span>}
        {status === 'rejected' && <span className="tag avatar-rejected">✕ {t.avatarRejected}</span>}
        <span className="muted small">{t.avatarHint}</span>
      </div>
    </div>
  );
}

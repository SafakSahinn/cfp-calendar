// Profil fotoğrafı: üst menüde ve profil sayfasında, yalnızca kişinin kendisine gösterilir.

import { useRef, useState } from 'react';
import { useApp } from '../lib/app';
import { initialsOf, removeAvatar, resizeToAvatar, uploadAvatar, useAvatarSrc } from '../lib/avatar';
import { useI18n } from '../lib/i18n';

export function Avatar({ size = 32 }: { size?: number }) {
  const { profile, session } = useApp();
  const src = useAvatarSrc(profile);
  const name = profile?.display_name ?? session?.user.email ?? '';
  return src ? (
    <img src={src} alt="" className="avatar" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar avatar-initials" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">{initialsOf(name)}</span>
  );
}

/** Profil sayfası: fotoğraf + yükle / değiştir / kaldır. */
export function AvatarEditor() {
  const { t } = useI18n();
  const { profile, session, updateProfile, showToast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!profile || !session) return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await resizeToAvatar(file);
      const path = await uploadAvatar(session.user.id, blob, profile.avatar_path);
      await updateProfile({ avatar_path: path });
      showToast(t.avatarSaved);
    } catch (e) {
      const m = (e as Error).message;
      showToast(m === 'too_large' ? t.avatarTooLarge : m === 'not_image' || m === 'unsupported' ? t.avatarUnsupported : `${t.avatarError}: ${m}`);
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  };
  const remove = async () => {
    if (!profile.avatar_path) return;
    setBusy(true);
    await removeAvatar(profile.avatar_path);
    await updateProfile({ avatar_path: null });
    setBusy(false);
  };

  return (
    <div className="avatar-editor">
      <Avatar size={72} />
      <div className="avatar-actions">
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} aria-label={t.avatarUpload} />
        <button className="small" disabled={busy} onClick={() => input.current?.click()}>
          📷 {profile.avatar_path ? t.avatarChange : t.avatarUpload}
        </button>
        {profile.avatar_path && <button className="small ghost" disabled={busy} onClick={remove}>{t.avatarRemove}</button>}
        <span className="muted small">{t.avatarHint}</span>
      </div>
    </div>
  );
}

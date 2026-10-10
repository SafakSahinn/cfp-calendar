import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/app';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { authError, NewPasswordFields, validateNewPassword } from './EmailAuth';
import { GoogleIcon, MicrosoftIcon } from '../pages/LandingPage';

/** Ad soyad, giriş yöntemleri ve (e-posta üyeleri için) şifre değiştirme. */
export function AccountCard() {
  const { t } = useI18n();
  const { session, profile, updateProfile, showToast } = useApp();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const identities = session?.user.identities ?? [];
  const hasEmail = identities.some((i) => i.provider === 'email');

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    await updateProfile({ display_name: name.trim() || null });
    showToast(t.saved);
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = validateNewPassword(password, confirm, t);
    if (invalid) return setPwError(invalid);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setPwError(authError(error.message, t));
    setPwError(null);
    setPassword('');
    setConfirm('');
    showToast(t.passwordChanged);
  };

  return (
    <div className="card">
      <h3>{t.accountTitle}</h3>
      <form className="row" onSubmit={saveName}>
        <label className="grow inline-field">
          <span className="small muted">{t.displayName}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <button type="submit" className="small" disabled={name === (profile?.display_name ?? '')}>{t.save}</button>
      </form>

      <h4>{t.signInMethods}</h4>
      <div className="chips">
        {identities.map((i) => (
          <span key={i.identity_id} className="chip static method">
            {i.provider === 'google' ? <GoogleIcon /> : i.provider === 'azure' ? <MicrosoftIcon /> : '✉️'}{' '}
            {i.provider === 'email' ? t.methodEmail : i.provider === 'azure' ? 'Microsoft' : 'Google'}
            {i.identity_data?.email ? ` · ${i.identity_data.email}` : ''}
          </span>
        ))}
      </div>

      {hasEmail && (
        <>
          <h4>{t.changePassword}</h4>
          <form className="email-auth left" onSubmit={changePassword} noValidate>
            <NewPasswordFields label={t.newPassword} password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} />
            {pwError && <p className="form-error" role="alert">{pwError}</p>}
            <button type="submit" className="small" disabled={busy || !password}>{t.changePassword}</button>
          </form>
        </>
      )}
    </div>
  );
}

/** Hesabı kalıcı olarak silme (onay kelimesi yazılmadan buton açılmaz). */
export function DangerZone() {
  const { t } = useI18n();
  const { profile, deleteAccount } = useApp();
  const [withCalendar, setWithCalendar] = useState(true);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const confirmed = word.trim().toLocaleUpperCase('tr') === t.deleteWord.toLocaleUpperCase('tr');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmed) return;
    setBusy(true);
    const ok = await deleteAccount(withCalendar);
    if (!ok) setBusy(false);
  };

  return (
    <form className="card danger" onSubmit={submit}>
      <h3>{t.dangerTitle}</h3>
      <p className="muted">{t.dangerText}</p>
      {profile?.calendar_provider && (
        <label className="check">
          <input type="checkbox" checked={withCalendar} onChange={(e) => setWithCalendar(e.target.checked)} /> {t.deleteCalendarToo}
        </label>
      )}
      <label className="inline-field">
        <span className="small muted">{t.typeToConfirm(t.deleteWord)}</span>
        <input value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
      </label>
      <button type="submit" className="danger-btn" disabled={!confirmed || busy}>{t.deleteButton}</button>
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/app';
import { useI18n, type Dict } from '../lib/i18n';
import { siteRoot, supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup' | 'forgot';

/** Supabase hata mesajlarını kullanıcı diline çevirir. */
function authError(message: string, t: Dict): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return t.errInvalidLogin;
  if (m.includes('not confirmed')) return t.errNotConfirmed;
  if (m.includes('already registered') || m.includes('already been registered')) return t.errAlreadyRegistered;
  if (m.includes('password should be') || m.includes('weak')) return t.errWeakPassword;
  if (m.includes('rate limit') || m.includes('too many')) return t.errRateLimit;
  return message;
}

export function EmailAuth() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(authError(error.message, t));
    } else if (mode === 'signup') {
      if (password.length < 8) {
        setError(t.errWeakPassword);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: siteRoot, data: { full_name: name.trim() || undefined } },
        });
        if (error) setError(authError(error.message, t));
        // E-posta zaten kayıtlıysa Supabase hata yerine boş kimlik listesi döndürür.
        else if (data.user && data.user.identities?.length === 0) setError(t.errAlreadyRegistered);
        else if (!data.session) setInfo(t.checkEmailSignup);
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteRoot });
      if (error) setError(authError(error.message, t));
      else setInfo(t.checkEmailReset);
    }
    setBusy(false);
  };

  return (
    <form className="email-auth" onSubmit={submit}>
      {mode !== 'forgot' && (
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'on' : ''} onClick={() => switchMode('signin')}>
            {t.signInTab}
          </button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => switchMode('signup')}>
            {t.signUpTab}
          </button>
        </div>
      )}

      {mode === 'signup' && (
        <label>
          {t.name}
          <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <label>
        {t.email}
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {mode !== 'forgot' && (
        <label>
          {t.password}
          <input
            type="password"
            required
            minLength={mode === 'signup' ? 8 : undefined}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'signup' && <span className="muted small">{t.passwordHint}</span>}
        </label>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {info && <p className="form-info" role="status">{info}</p>}

      <button type="submit" className="primary" disabled={busy}>
        {mode === 'signin' ? t.signInBtn : mode === 'signup' ? t.signUpBtn : t.sendReset}
      </button>

      {mode === 'signin' && (
        <button type="button" className="ghost small" onClick={() => switchMode('forgot')}>{t.forgot}</button>
      )}
      {mode === 'forgot' && (
        <button type="button" className="ghost small" onClick={() => switchMode('signin')}>{t.backToSignIn}</button>
      )}
    </form>
  );
}

/** Şifre sıfırlama bağlantısından dönen kullanıcı için yeni şifre formu. */
export function NewPasswordForm() {
  const { t } = useI18n();
  const { endRecovery, showToast } = useApp();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError(t.errWeakPassword);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(authError(error.message, t));
    showToast(t.passwordUpdated);
    endRecovery();
  };

  return (
    <section className="landing">
      <form className="email-auth card" onSubmit={submit}>
        <label>
          {t.newPassword}
          <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="muted small">{t.passwordHint}</span>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{t.saveNewPassword}</button>
      </form>
    </section>
  );
}

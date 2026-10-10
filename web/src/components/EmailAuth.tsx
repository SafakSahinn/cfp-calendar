import { useId, useState, type FormEvent } from 'react';
import { useApp } from '../lib/app';
import { useI18n, type Dict } from '../lib/i18n';
import { siteRoot, supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup' | 'forgot';

const MIN_PASSWORD = 8;

/** Supabase hata mesajlarını kullanıcı diline çevirir. */
export function authError(message: string, t: Dict): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return t.errInvalidLogin;
  if (m.includes('not confirmed')) return t.errNotConfirmed;
  if (m.includes('already registered') || m.includes('already been registered')) return t.errAlreadyRegistered;
  if (m.includes('password should be') || m.includes('weak')) return t.errWeakPassword;
  if (m.includes('rate limit') || m.includes('too many')) return t.errRateLimit;
  return message;
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M3 3l18 18" />}
    </svg>
  );
}

/** Göster/gizle butonlu şifre kutusu. */
function PasswordInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
  invalid?: boolean;
  minLength?: number;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <div className={`password-wrap ${props.invalid ? 'invalid' : ''}`}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required
          minLength={props.minLength}
          autoComplete={props.autoComplete}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={props.invalid || undefined}
        />
        <button
          type="button"
          className="reveal"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t.hidePassword : t.showPassword}
          title={visible ? t.hidePassword : t.showPassword}
          aria-pressed={visible}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
      {props.hint && <span className={`small ${props.invalid ? 'hint-error' : 'muted'}`}>{props.hint}</span>}
    </div>
  );
}

/** Yeni şifre + tekrarı; eşleşme durumunu canlı gösterir. */
export function NewPasswordFields(props: {
  password: string;
  confirm: string;
  setPassword: (v: string) => void;
  setConfirm: (v: string) => void;
  label: string;
}) {
  const { t } = useI18n();
  const tooShort = props.password.length > 0 && props.password.length < MIN_PASSWORD;
  const mismatch = props.confirm.length > 0 && props.confirm !== props.password;
  const matches = props.confirm.length > 0 && props.confirm === props.password && !tooShort;
  return (
    <>
      <PasswordInput
        label={props.label}
        value={props.password}
        onChange={props.setPassword}
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        hint={t.passwordHint}
        invalid={tooShort}
      />
      <PasswordInput
        label={t.confirmPassword}
        value={props.confirm}
        onChange={props.setConfirm}
        autoComplete="new-password"
        invalid={mismatch}
        hint={mismatch ? t.errPasswordMismatch : matches ? `✓ ${t.passwordsMatch}` : undefined}
      />
    </>
  );
}

/** Gönderimden önce yeni şifreyi doğrular; hata yoksa null döner. */
export function validateNewPassword(password: string, confirm: string, t: Dict): string | null {
  if (password.length < MIN_PASSWORD) return t.errWeakPassword;
  if (password !== confirm) return t.errPasswordMismatch;
  return null;
}

export function EmailAuth() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
    setConfirm('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === 'signup') {
      const invalid = validateNewPassword(password, confirm, t);
      if (invalid) return setError(invalid);
    }

    setBusy(true);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(authError(error.message, t));
    } else if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: siteRoot, data: { full_name: name.trim() || undefined } },
      });
      if (error) setError(authError(error.message, t));
      // E-posta zaten kayıtlıysa Supabase hata yerine boş kimlik listesi döndürür.
      else if (data.user && data.user.identities?.length === 0) setError(t.errAlreadyRegistered);
      else if (!data.session) {
        setInfo(t.checkEmailSignup);
        setPassword('');
        setConfirm('');
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteRoot });
      if (error) setError(authError(error.message, t));
      else setInfo(t.checkEmailReset);
    }
    setBusy(false);
  };

  return (
    <form className="email-auth" onSubmit={submit} noValidate={mode === 'signup'}>
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
        <div className="field">
          <label htmlFor="auth-name">{t.name}</label>
          <input id="auth-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="auth-email">{t.email}</label>
        <input id="auth-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      {mode === 'signin' && (
        <PasswordInput label={t.password} value={password} onChange={setPassword} autoComplete="current-password" />
      )}
      {mode === 'signup' && (
        <NewPasswordFields label={t.password} password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} />
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
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = validateNewPassword(password, confirm, t);
    if (invalid) return setError(invalid);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(authError(error.message, t));
    showToast(t.passwordUpdated);
    endRecovery();
  };

  return (
    <section className="landing">
      <form className="email-auth card" onSubmit={submit} noValidate>
        <h2>{t.setNewPassword}</h2>
        <NewPasswordFields label={t.newPassword} password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{t.saveNewPassword}</button>
      </form>
    </section>
  );
}

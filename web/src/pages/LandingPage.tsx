import { EmailAuth } from '../components/EmailAuth';
import { useApp } from '../lib/app';
import { useI18n } from '../lib/i18n';

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

export function LandingPage() {
  const { t } = useI18n();
  const { signIn, providers } = useApp();

  return (
    <section className="landing">
      <div className="hero">
        <a className="login-back" href="#/">{t.loginBack}</a>
        <h1>{t.loginTitle}</h1>
        <p className="lead">{t.tagline}</p>
        <div className="signin">
          <button className="provider" onClick={() => signIn('google')}>
            <GoogleIcon /> {t.signInGoogle}
          </button>
          {providers.microsoft && (
            <button className="provider" onClick={() => signIn('microsoft')}>
              <MicrosoftIcon /> {t.signInMicrosoft}
            </button>
          )}
          <p className="muted small">{t.signInNote}</p>
          <div className="divider"><span>{t.orEmail}</span></div>
          <EmailAuth />
        </div>
      </div>
    </section>
  );
}

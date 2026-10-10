import { useEffect, useState } from 'react';
import { useApp } from './lib/app';
import { useI18n } from './lib/i18n';
import { configured } from './lib/supabase';
import { EventsPage } from './pages/EventsPage';
import { InboxPage } from './pages/InboxPage';
import { LandingPage } from './pages/LandingPage';
import { ProfilePage } from './pages/ProfilePage';

type Route = 'events' | 'inbox' | 'profile';

function routeFromHash(): Route {
  const h = window.location.hash;
  if (h.startsWith('#/mesajlar')) return 'inbox';
  if (h.startsWith('#/profil')) return 'profile';
  return 'events';
}

export function App() {
  const { t, lang, setLang } = useI18n();
  const { session, ready, profile, unread, toast, signOut, updateProfile } = useApp();
  const [route, setRoute] = useState<Route>(routeFromHash);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const switchLang = () => {
    const next = lang === 'tr' ? 'en' : 'tr';
    setLang(next);
    if (profile) updateProfile({ locale: next });
  };

  const nav: [Route, string, string][] = [
    ['events', '#/', t.navEvents],
    ['inbox', '#/mesajlar', t.navInbox],
    ['profile', '#/profil', t.navProfile],
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark">📅</span>
          <span>CFP Takvim</span>
        </a>
        {session && (
          <nav className="nav">
            {nav.map(([r, href, label]) => (
              <a key={r} href={href} className={route === r ? 'active' : ''}>
                {label}
                {r === 'inbox' && unread > 0 && <span className="badge">{unread}</span>}
              </a>
            ))}
          </nav>
        )}
        <div className="topbar-right">
          <button className="ghost small" onClick={switchLang} aria-label={t.language}>
            {lang === 'tr' ? 'EN' : 'TR'}
          </button>
          {session && (
            <button className="ghost small" onClick={signOut}>
              {t.signOut}
            </button>
          )}
        </div>
      </header>

      <main className="main">
        {!configured ? (
          <div className="notice">{t.notConfigured}</div>
        ) : !ready ? (
          <p className="muted center">{t.loading}</p>
        ) : !session ? (
          <LandingPage />
        ) : route === 'inbox' ? (
          <InboxPage />
        ) : route === 'profile' ? (
          <ProfilePage />
        ) : (
          <EventsPage />
        )}
      </main>

      <footer className="footer muted">{t.sourceNote}</footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

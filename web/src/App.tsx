import { useEffect, useState } from 'react';
import { useApp } from './lib/app';
import { useI18n } from './lib/i18n';
import { NewPasswordForm } from './components/EmailAuth';
import { Logo } from './components/Logo';
import { REPO_URL, SITE_NAME } from './lib/site';
import { LegalPage } from './pages/LegalPage';
import { AdminPage } from './pages/AdminPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { GroupPage, GroupsPage, JoinGroupPage } from './pages/GroupsPage';
import { MyCalendarPage } from './pages/MyCalendarPage';
import { configured } from './lib/supabase';
import { EventsPage } from './pages/EventsPage';
import { InboxPage } from './pages/InboxPage';
import { LandingPage } from './pages/LandingPage';
import { ThemeButton } from './components/ThemeButton';
import { ProfilePage } from './pages/ProfilePage';

type Route = 'events' | 'inbox' | 'profile' | 'privacy' | 'terms' | 'admin' | 'detail' | 'mycal' | 'groups' | 'group' | 'join';

function routeFromHash(h: string): Route {
  if (h.startsWith('#/mesajlar')) return 'inbox';
  if (h.startsWith('#/profil')) return 'profile';
  if (h.startsWith('#/gizlilik')) return 'privacy';
  if (h.startsWith('#/kosullar')) return 'terms';
  if (h.startsWith('#/yonetim')) return 'admin';
  if (h.startsWith('#/etkinlik/')) return 'detail';
  if (h.startsWith('#/takvimim')) return 'mycal';
  if (h.startsWith('#/gruplar')) return 'groups';
  if (h.startsWith('#/grup/')) return 'group';
  if (h.startsWith('#/katil/')) return 'join';
  return 'events';
}

export function App() {
  const { t, lang, setLang } = useI18n();
  const { session, ready, profile, unread, toast, signOut, updateProfile, recovery, isAdmin } = useApp();
  // Adresin tamamı izlenir: aynı sayfa türünde farklı içerik (detay → detay) de yeniden çizilsin
  const [hash, setHash] = useState(() => window.location.hash);
  const route = routeFromHash(hash);

  useEffect(() => {
    const onHash = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const switchLang = () => {
    const next = lang === 'tr' ? 'en' : 'tr';
    setLang(next);
    if (profile) updateProfile({ locale: next });
  };

  const nav: [Route, string, string, string][] = [
    ['events', '#/', t.navEvents, '🔎'],
    ['mycal', '#/takvimim', t.navMyCalendar, '📅'],
    ['groups', '#/gruplar', t.navGroups, '👥'],
    ['inbox', '#/mesajlar', t.navInbox, '✉️'],
    ['profile', '#/profil', t.navProfile, '👤'],
    ...(isAdmin ? ([['admin', '#/yonetim', t.navAdmin, '🛠️']] as [Route, string, string, string][]) : []),
  ];
  const activeOf = (r: Route) => route === r || (r === 'events' && route === 'detail') || (r === 'groups' && (route === 'group' || route === 'join'));

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <Logo />
          <span>{SITE_NAME}</span>
        </a>
        {session && (
          <nav className="nav">
            {nav.map(([r, href, label, icon]) => (
              <a key={r} href={href} className={activeOf(r) ? 'active' : ''}>
                <span className="nav-icon" aria-hidden="true">{icon}</span>
                <span className="nav-label">{label}</span>
                {r === 'inbox' && unread > 0 && <span className="badge">{unread}</span>}
              </a>
            ))}
          </nav>
        )}
        <div className="topbar-right">
          <button className="ghost small" onClick={switchLang} aria-label={t.language}>
            {lang === 'tr' ? 'EN' : 'TR'}
          </button>
          <ThemeButton />
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
        ) : route === 'privacy' || route === 'terms' ? (
          <LegalPage doc={route} />
        ) : !ready ? (
          <p className="muted center">{t.loading}</p>
        ) : recovery && session ? (
          <NewPasswordForm />
        ) : !session ? (
          <LandingPage />
        ) : route === 'inbox' ? (
          <InboxPage />
        ) : route === 'profile' ? (
          <ProfilePage />
        ) : route === 'admin' ? (
          <AdminPage />
        ) : route === 'mycal' ? (
          <MyCalendarPage />
        ) : route === 'groups' ? (
          <GroupsPage />
        ) : route === 'group' ? (
          <GroupPage key={hash} id={hash.slice('#/grup/'.length)} />
        ) : route === 'join' ? (
          <JoinGroupPage code={hash.slice('#/katil/'.length)} />
        ) : route === 'detail' ? (
          <EventDetailPage key={hash} id={hash.slice('#/etkinlik/'.length)} />
        ) : (
          <EventsPage />
        )}
      </main>

      <footer className="footer muted">
        <p>{t.sourceNote}</p>
        <nav className="footer-links">
          <a href="#/gizlilik">{t.privacy}</a>
          <a href="#/kosullar">{t.terms}</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

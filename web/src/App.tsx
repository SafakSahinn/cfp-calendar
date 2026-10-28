import { lazy, Suspense, useEffect, useState } from 'react';
import { useApp } from './lib/app';
import { useI18n } from './lib/i18n';
import { NewPasswordForm } from './components/EmailAuth';
import { Logo } from './components/Logo';
import { REPO_URL, SITE_NAME } from './lib/site';
import { configured } from './lib/supabase';
import { EventsPage } from './pages/EventsPage';
import { LandingPage } from './pages/LandingPage';
import { Landing, goSignIn } from './pages/Landing';
import { ThemeButton } from './components/ThemeButton';
import { Avatar } from './components/Avatar';

// Sık kullanılmayan sayfalar ayrı parçalar hâlinde, ihtiyaç olunca yüklenir (ilk açılış hızlansın)
const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage').then((m) => ({ default: m.EventDetailPage })));
const MyCalendarPage = lazy(() => import('./pages/MyCalendarPage').then((m) => ({ default: m.MyCalendarPage })));
const InboxPage = lazy(() => import('./pages/InboxPage').then((m) => ({ default: m.InboxPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const JoinSubmissionPage = lazy(() => import('./components/SubmissionTeam').then((m) => ({ default: m.JoinSubmissionPage })));
const GroupPage = lazy(() => import('./pages/GroupsPage').then((m) => ({ default: m.GroupPage })));
const GroupsPage = lazy(() => import('./pages/GroupsPage').then((m) => ({ default: m.GroupsPage })));
const JoinGroupPage = lazy(() => import('./pages/GroupsPage').then((m) => ({ default: m.JoinGroupPage })));

type Route = 'login' | 'events' | 'inbox' | 'profile' | 'privacy' | 'terms' | 'admin' | 'detail' | 'mycal' | 'groups' | 'group' | 'join' | 'coauthor';

function routeFromHash(h: string): Route {
  if (h.startsWith('#/giris')) return 'login';
  if (h.startsWith('#/mesajlar')) return 'inbox';
  if (h.startsWith('#/profil')) return 'profile';
  if (h.startsWith('#/gizlilik')) return 'privacy';
  if (h.startsWith('#/kosullar')) return 'terms';
  if (h.startsWith('#/yonetim')) return 'admin';
  if (h.startsWith('#/etkinlik/')) return 'detail';
  if (h.startsWith('#/takvimim')) return 'mycal';
  if (h.startsWith('#/gruplar')) return 'groups';
  if (h.startsWith('#/grup/')) return 'group';
  if (h.startsWith('#/ortak/')) return 'coauthor';
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

  // Giriş yapıldıktan sonra #/giris adreste kalmasın
  useEffect(() => {
    if (session && route === 'login') {
      history.replaceState(null, '', '#/');
      setHash('#/');
    }
  }, [session, route]);

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
                <span className="nav-icon" aria-hidden="true">{r === 'profile' ? <Avatar size={20} /> : icon}</span>
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
          {session ? (
            <button className="ghost small" onClick={signOut}>
              {t.signOut}
            </button>
          ) : ready && route !== 'login' && (
            <button className="primary small" onClick={goSignIn}>
              {t.signInBtn}
            </button>
          )}
        </div>
      </header>

      <main className="main">
        <Suspense fallback={<p className="muted center">{t.loading}</p>}>
        {!configured ? (
          <div className="notice">{t.notConfigured}</div>
        ) : route === 'privacy' || route === 'terms' ? (
          <LegalPage doc={route} />
        ) : !ready ? (
          <p className="muted center">{t.loading}</p>
        ) : recovery && session ? (
          <NewPasswordForm />
        ) : !session ? (
          // Kök adres tanıtım sayfasını, paylaşılan bağlantılar doğrudan girişi açar
          route === 'events' && (hash === '' || hash === '#' || hash === '#/') ? <Landing /> : <LandingPage />
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
        ) : route === 'coauthor' ? (
          <JoinSubmissionPage code={hash.slice('#/ortak/'.length)} />
        ) : route === 'join' ? (
          <JoinGroupPage code={hash.slice('#/katil/'.length)} />
        ) : route === 'detail' ? (
          <EventDetailPage key={hash} id={hash.slice('#/etkinlik/'.length)} />
        ) : (
          <EventsPage />
        )}
        </Suspense>
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

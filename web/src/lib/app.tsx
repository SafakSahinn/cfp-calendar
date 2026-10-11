import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { requestGoogleCalendarCode } from './googleCalendar';
import { useI18n } from './i18n';
import { authProvider, configured, siteRoot, supabase, type Profile, type Provider } from './supabase';

const PENDING_KEY = 'cfp.pendingCalendar';

const SCOPES: Record<Provider, { login: string; calendar: string }> = {
  google: {
    login: 'openid email profile',
    calendar: 'openid email profile https://www.googleapis.com/auth/calendar.events',
  },
  microsoft: {
    login: 'openid email profile',
    calendar: 'openid email profile offline_access Calendars.ReadWrite',
  },
};

interface AppState {
  session: Session | null;
  ready: boolean;
  profile: Profile | null;
  followed: Set<string>;
  topics: Set<string>;
  unread: number;
  toast: string | null;
  showToast: (msg: string) => void;
  signIn: (p: Provider) => Promise<void>;
  signOut: () => Promise<void>;
  connectCalendar: (p: Provider) => Promise<void>;
  disconnectCalendar: () => Promise<void>;
  toggleFollow: (eventId: string) => Promise<void>;
  toggleTopic: (topic: string) => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, 'locale' | 'topic_notifications' | 'email_notifications' | 'display_name'>>) => Promise<void>;
  refreshUnread: () => Promise<void>;
  addToCalendar: (eventId: string) => Promise<boolean>;
  /** Şifre sıfırlama bağlantısıyla gelindi: yeni şifre formu gösterilmeli. */
  recovery: boolean;
  endRecovery: () => void;
  /** Supabase'te hangi giriş sağlayıcıları açık (kapalı olanların butonu gizlenir). */
  providers: Record<Provider, boolean>;
  deleteAccount: (deleteCalendarEntries: boolean) => Promise<boolean>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { t, setLang } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [topics, setTopics] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [providers, setProviders] = useState<Record<Provider, boolean>>({ google: true, microsoft: false });

  useEffect(() => {
    if (!configured) return;
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    })
      .then((r) => r.json())
      .then((s) => setProviders({ google: !!s.external?.google, microsoft: !!s.external?.azure }))
      .catch(() => {});
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 4000);
  }, []);

  useEffect(() => {
    try {
      const flash = sessionStorage.getItem('cfp.flash');
      if (flash) {
        sessionStorage.removeItem('cfp.flash');
        showToast(flash);
      }
    } catch {
      // yok say
    }
  }, [showToast]);

  const userId = session?.user.id;

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) setProfile(data as Profile);
  }, [userId]);

  const loadInterests = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('interests').select('event_id, topic').eq('user_id', userId);
    setFollowed(new Set((data ?? []).map((r) => r.event_id).filter(Boolean)));
    setTopics(new Set((data ?? []).map((r) => r.topic).filter(Boolean)));
  }, [userId]);

  const refreshUnread = useCallback(async () => {
    if (!userId) return;
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    setUnread(count ?? 0);
  }, [userId]);

  // Oturum + takvim bağlama dönüşü
  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setReady(true);
      let pending: string | null = null;
      try {
        pending = localStorage.getItem(PENDING_KEY);
      } catch {
        // yok say
      }
      if (s && pending && s.provider_token) {
        try {
          localStorage.removeItem(PENDING_KEY);
        } catch {
          // yok say
        }
        // onAuthStateChange içinde doğrudan Supabase çağrısı kilitlenmeye yol açabilir; sonraya ertele.
        window.setTimeout(async () => {
          const { error } = await supabase.functions.invoke('save-calendar-token', {
            body: {
              provider: pending,
              provider_token: s.provider_token,
              provider_refresh_token: s.provider_refresh_token,
            },
          });
          showToast(error ? `${t.calendarError}: ${error.message}` : t.calendarConnected);
          window.location.hash = '#/profil';
          const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
          if (data) setProfile(data as Profile);
        }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setFollowed(new Set());
      setTopics(new Set());
      setUnread(0);
      return;
    }
    loadProfile();
    loadInterests();
    refreshUnread();

    // Yeni bildirimler anlık gelsin
    const channel = supabase
      .channel(`notif-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () =>
        refreshUnread(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadProfile, loadInterests, refreshUnread]);

  // Profil dili arayüz dilini belirler
  useEffect(() => {
    if (profile?.locale) setLang(profile.locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.locale]);

  const signIn = async (p: Provider) => {
    await supabase.auth.signInWithOAuth({
      provider: authProvider(p),
      options: { redirectTo: siteRoot, scopes: SCOPES[p].login },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const connectCalendar = async (p: Provider) => {
    if (p === 'google') return connectGoogleCalendar();
    try {
      localStorage.setItem(PENDING_KEY, p);
    } catch {
      // yok say
    }
    const options = {
      redirectTo: siteRoot, // hash eklenmez: PKCE ?code= parametresi bozulur
      scopes: SCOPES[p].calendar,
      // Microsoft: refresh token için onay ekranı (Google kendi açılır penceresiyle bağlanır, bkz. connectGoogleCalendar)
      queryParams: { prompt: 'consent' },
    };
    const hasIdentity = session?.user.identities?.some((i) => i.provider === authProvider(p));
    if (hasIdentity) {
      await supabase.auth.signInWithOAuth({ provider: authProvider(p), options });
    } else {
      // Google ile girip Outlook takvimi bağlamak gibi durumlar: kimliği hesaba bağla.
      const { error } = await supabase.auth.linkIdentity({ provider: authProvider(p), options });
      if (error) showToast(`${t.calendarError}: ${error.message}`);
    }
  };

  const connectGoogleCalendar = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) return showToast(`${t.calendarError}: VITE_GOOGLE_CLIENT_ID`);
    try {
      const code = await requestGoogleCalendarCode(clientId, session?.user.email);
      const { data, error } = await supabase.functions.invoke('save-calendar-token', {
        body: { provider: 'google', code },
      });
      if (error) {
        // Fonksiyonun döndürdüğü hata kodunu göster (ör. calendar_scope_missing)
        const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(detail?.error ?? error.message);
      }
      if (data?.ok) showToast(t.calendarConnected);
      await loadProfile();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'popup_closed') return; // kullanıcı pencereyi kapattı
      showToast(msg === 'calendar_scope_missing' ? t.calendarScopeMissing : `${t.calendarError}: ${msg}`);
    }
  };

  const disconnectCalendar = async () => {
    await supabase.functions.invoke('save-calendar-token', { body: { action: 'disconnect' } });
    await loadProfile();
  };

  const toggleFollow = async (eventId: string) => {
    if (!userId) return;
    const next = new Set(followed);
    if (followed.has(eventId)) {
      next.delete(eventId);
      setFollowed(next);
      await supabase.from('interests').delete().eq('user_id', userId).eq('event_id', eventId);
    } else {
      next.add(eventId);
      setFollowed(next);
      await supabase.from('interests').insert({ user_id: userId, event_id: eventId });
    }
  };

  const toggleTopic = async (topic: string) => {
    if (!userId) return;
    const next = new Set(topics);
    if (topics.has(topic)) {
      next.delete(topic);
      setTopics(next);
      await supabase.from('interests').delete().eq('user_id', userId).eq('topic', topic);
    } else {
      next.add(topic);
      setTopics(next);
      await supabase.from('interests').insert({ user_id: userId, topic });
    }
  };

  const updateProfile: AppState['updateProfile'] = async (patch) => {
    if (!userId) return;
    setProfile((p) => (p ? { ...p, ...patch } : p));
    await supabase.from('profiles').update(patch).eq('id', userId);
  };

  const deleteAccount = async (deleteCalendarEntries: boolean) => {
    const { error } = await supabase.functions.invoke('delete-account', {
      body: { delete_calendar_entries: deleteCalendarEntries },
    });
    if (error) {
      showToast(error.message);
      return false;
    }
    // Kullanıcı sunucuda silindi: oturum sunucuya sorulmadan yerelde temizlenir (signOut silinmiş kullanıcı için 403 alır).
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k));
      sessionStorage.setItem('cfp.flash', t.accountDeleted);
    } catch {
      // yok say
    }
    window.location.replace(siteRoot);
    return true;
  };

  const addToCalendar = async (eventId: string) => {
    const { data, error } = await supabase.functions.invoke('respond', {
      body: { event_id: eventId, response: 'interested' },
    });
    if (error || data?.calendar_error) {
      showToast(`${t.calendarError}: ${error?.message ?? data.calendar_error}`);
      return false;
    }
    setFollowed((prev) => new Set(prev).add(eventId));
    showToast(t.addedToCalendar);
    return true;
  };

  return (
    <AppContext.Provider
      value={{
        session, ready, profile, followed, topics, unread, toast, showToast,
        signIn, signOut, connectCalendar, disconnectCalendar, toggleFollow, toggleTopic,
        updateProfile, refreshUnread, addToCalendar,
        recovery, endRecovery: () => setRecovery(false),
        providers, deleteAccount,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp, AppProvider içinde kullanılmalı');
  return ctx;
}

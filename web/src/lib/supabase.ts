import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && anonKey);

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
});

/** OAuth dönüşü için: GitHub Pages alt dizini dahil sitenin kök adresi. */
export const siteRoot = `${window.location.origin}${import.meta.env.BASE_URL}`;

export type Provider = 'google' | 'microsoft';

export const ACADEMIC_TITLES = [
  'prof', 'assoc_prof', 'asst_prof', 'lecturer', 'research_assistant', 'postdoc',
  'phd_student', 'msc_student', 'undergrad', 'engineer', 'researcher', 'other',
] as const;
export type AcademicTitle = (typeof ACADEMIC_TITLES)[number];
export const authProvider = (p: Provider) => (p === 'microsoft' ? 'azure' : 'google') as 'azure' | 'google';

export interface EventRow {
  id: string;
  kind: 'conference' | 'workshop' | 'journal';
  acronym: string | null;
  title: string;
  url: string | null;
  source_url: string | null;
  location: string | null;
  fields: string[];
  topics: string[];
  ranks: Record<string, string>;
  is_ieee: boolean;
  /** Kalite işaretleri (jobs/src/quality.ts): indexing_claims, organizer_prefix, ei_duplicate, generic_journal */
  flags: string[];
  submission_open: string | null;
  abstract_deadline: string | null;
  submission_deadline: string | null;
  deadlines: { deadline: string; abstract?: string; comment?: string }[];
  deadline_tz: string | null;
  notification_date: string | null;
  event_start: string | null;
  event_end: string | null;
  first_seen_at: string;
  source: string;
  dedupe_key: string;
  /** Konferans serisi (ör. "ICASSP"); dergilerde null */
  series_key: string | null;
  /** Etkinlik yerinin koordinatı (harita); dergi/çevrim içi/çözümlenemeyen → null */
  lat: number | null;
  lng: number | null;
}

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  academic_title: AcademicTitle | null;
  institution: string | null;
  department: string | null;
  avatar_url: string | null;
  /** Yüklenen profil fotoğrafının depodaki yolu (null = yok) */
  avatar_path: string | null;
  locale: 'tr' | 'en';
  calendar_provider: Provider | null;
  calendar_account: string | null;
  topic_notifications: boolean;
  email_notifications: boolean;
  email_frequency: 'weekly' | 'instant';
  /** Son başvurudan kaç gün önce hatırlatılsın (14/7/3/1) */
  reminder_days: number[];
  ics_token: string;
}

export interface Notification {
  id: string;
  event_id: string | null;
  type: 'submission_open' | 'topic_match' | 'dates_changed' | 'deadline_reminder' | 'announcement' | 'group_recommendation' | 'series_new' | 'group_comment' | 'saved_search' | 'submission_task' | 'coauthor_update';
  payload: { deadline?: string; old_deadline?: string; topics?: string[]; group_name?: string; by?: string | null; note?: string | null; days?: number; search?: string; task?: 'camera_ready' | 'registration' | 'presentation'; date?: string; paper?: string | null; status?: string };
  group_id: string | null;
  announcements: { title: string; body: string; url: string | null } | null;
  response: 'interested' | 'not_interested' | null;
  read_at: string | null;
  created_at: string;
  events: EventRow | null;
}

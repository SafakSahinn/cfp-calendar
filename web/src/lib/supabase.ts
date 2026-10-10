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
export const authProvider = (p: Provider) => (p === 'microsoft' ? 'azure' : 'google') as 'azure' | 'google';

export interface EventRow {
  id: string;
  kind: 'conference' | 'workshop' | 'journal';
  acronym: string | null;
  title: string;
  url: string | null;
  location: string | null;
  fields: string[];
  topics: string[];
  ranks: Record<string, string>;
  is_ieee: boolean;
  submission_open: string | null;
  abstract_deadline: string | null;
  submission_deadline: string | null;
  deadlines: { deadline: string; abstract?: string; comment?: string }[];
  deadline_tz: string | null;
  event_start: string | null;
  event_end: string | null;
  first_seen_at: string;
  source: string;
}

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  locale: 'tr' | 'en';
  calendar_provider: Provider | null;
  calendar_account: string | null;
  topic_notifications: boolean;
  ics_token: string;
}

export interface Notification {
  id: string;
  event_id: string | null;
  type: 'submission_open' | 'topic_match' | 'dates_changed' | 'deadline_reminder';
  payload: { deadline?: string; old_deadline?: string; topics?: string[] };
  response: 'interested' | 'not_interested' | null;
  read_at: string | null;
  created_at: string;
  events: EventRow | null;
}

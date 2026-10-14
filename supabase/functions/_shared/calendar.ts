// Google Takvim + Microsoft Graph entegrasyonu.
// Hem Edge Function'lar ("İlgileniyorum" butonu) hem de 12 saatlik GitHub Actions işi bu dosyayı kullanır;
// bu yüzden yalnızca fetch + WebCrypto kullanır, Deno/Node'a özgü API kullanmaz.

import { decrypt, encrypt } from './crypto.ts';

export type Provider = 'google' | 'microsoft';
export type EntryType = 'submission_open' | 'abstract' | 'deadline' | 'event_days';

/** Başvuru açılınca eklenen kayıtlar (konferans günleri ayrıca, "İlgileniyorum" ile eklenir). */
export const SUBMISSION_ENTRY_TYPES: EntryType[] = ['submission_open', 'abstract', 'deadline'];
export type Locale = 'tr' | 'en';

export interface CalendarEnv {
  TOKEN_ENC_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MS_CLIENT_ID: string;
  MS_CLIENT_SECRET: string;
  SITE_URL: string;
}

export interface EventRow {
  id: string;
  kind: 'conference' | 'workshop' | 'journal';
  acronym: string | null;
  title: string;
  url: string | null;
  location: string | null;
  submission_open: string | null;
  first_seen_at: string;
  abstract_deadline: string | null;
  submission_deadline: string | null;
  deadline_tz: string | null;
  event_start: string | null;
  event_end: string | null;
}

export const EVENT_COLUMNS =
  'id, kind, acronym, title, url, location, submission_open, first_seen_at, abstract_deadline, submission_deadline, deadline_tz, event_start, event_end';

// deno-lint-ignore no-explicit-any
type Db = { from(table: string): any };

export type SyncResult = 'created' | 'updated' | 'unchanged' | 'skipped';

// ---------------------------------------------------------------------------
// Tarih yardımcıları
// ---------------------------------------------------------------------------

/** Başvuru başlangıcı: kaynak vermediyse etkinliği ilk gördüğümüz gün. */
export function openDateOf(e: EventRow): string {
  return e.submission_open ?? e.first_seen_at.slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Bu kayıt türü için etkinlikte yeterli tarih var mı? */
export function isApplicable(e: EventRow, type: EntryType): boolean {
  if (type === 'deadline') return !!e.submission_deadline;
  // Özet son tarihi ayrı bir tarihse (aynıysa son başvuru kaydı yeterli)
  if (type === 'abstract') {
    return !!e.abstract_deadline && !!e.submission_deadline &&
      new Date(e.abstract_deadline).getTime() < new Date(e.submission_deadline).getTime();
  }
  if (type === 'event_days') return !!e.event_start && e.kind !== 'journal';
  return !!e.submission_deadline; // başvuru açılışı sadece son tarihi olan çağrılar için anlamlı
}

/** Son tarih kayıtlarının hatırlatıcıları kullanıcının seçtiği günlerden gelir (profiles.reminder_days); verilmezse eski varsayılan 7 + 1 gün. */
export const DEFAULT_CAL_REMINDER_DAYS = [7, 1];
const remKey = (days?: number[]) => (days ? `:r${[...days].sort((a, b) => b - a).join(',')}` : '');

export function entryHash(e: EventRow, type: EntryType, reminderDays?: number[]): string {
  if (type === 'submission_open') return `open:${openDateOf(e)}`;
  if (type === 'deadline') return `dl:${e.submission_deadline}${remKey(reminderDays)}`;
  if (type === 'abstract') return `abs:${e.abstract_deadline}${remKey(reminderDays)}`;
  return `days:${e.event_start}:${e.event_end ?? e.event_start}`;
}

// ---------------------------------------------------------------------------
// Takvim kaydının içeriği
// ---------------------------------------------------------------------------

interface CalItem {
  summary: string;
  description: string;
  location: string | null;
  allDay?: { start: string; endExclusive: string };
  timed?: { startIso: string; endIso: string };
  reminders: number[]; // dakika
}

const LABELS: Record<Locale, Record<EntryType, string>> = {
  tr: { submission_open: '📝 Başvuru açıldı', abstract: '✍️ Özet son tarihi', deadline: '⏰ Son başvuru', event_days: '🎤' },
  en: { submission_open: '📝 Submissions open', abstract: '✍️ Abstract deadline', deadline: '⏰ Submission deadline', event_days: '🎤' },
};

function displayName(e: EventRow): string {
  return e.acronym ? `${e.acronym} – ${e.title}` : e.title;
}

export function buildItem(e: EventRow, type: EntryType, locale: Locale, siteUrl: string, reminderDays?: number[]): CalItem {
  const label = LABELS[locale][type];
  const name = e.acronym ?? e.title;
  const tz = e.deadline_tz ? ` (${e.deadline_tz})` : '';
  const lines = [
    displayName(e),
    e.location ? `📍 ${e.location}` : '',
    e.url ? `🔗 ${e.url}` : '',
    e.abstract_deadline && isApplicable(e, 'abstract')
      ? `${LABELS[locale].abstract}: ${e.abstract_deadline.replace('T', ' ').slice(0, 16)} UTC${tz}`
      : '',
    e.submission_deadline
      ? `${LABELS[locale].deadline}: ${e.submission_deadline.replace('T', ' ').slice(0, 16)} UTC${tz}`
      : '',
    '',
    locale === 'tr' ? `CFP Calendar tarafından eklendi — ${siteUrl}` : `Added by CFP Calendar — ${siteUrl}`,
  ].filter((l, i) => l !== '' || i === 5);

  const base = { description: lines.join('\n'), location: e.location };

  if (type === 'submission_open') {
    const d = openDateOf(e);
    return { ...base, summary: `${label}: ${name}`, allDay: { start: d, endExclusive: addDays(d, 1) }, reminders: [] };
  }
  if (type === 'deadline' || type === 'abstract') {
    const end = new Date((type === 'abstract' ? e.abstract_deadline : e.submission_deadline)!);
    const start = new Date(end.getTime() - 30 * 60_000);
    return {
      ...base,
      summary: `${label}: ${name}`,
      timed: { startIso: start.toISOString(), endIso: end.toISOString() },
      // Google en fazla 4 hafta önceye izin verir; 14 gün sorun değil
      reminders: [...new Set(reminderDays ?? DEFAULT_CAL_REMINDER_DAYS)].sort((a, b) => b - a).map((d) => d * 24 * 60),
    };
  }
  const start = e.event_start!;
  return {
    ...base,
    summary: `${label} ${displayName(e)}`,
    allDay: { start, endExclusive: addDays(e.event_end ?? start, 1) },
    reminders: [7 * 24 * 60],
  };
}

// ---------------------------------------------------------------------------
// Erişim token'ı (gerekirse refresh)
// ---------------------------------------------------------------------------

export async function getAccessToken(
  db: Db,
  env: CalendarEnv,
  userId: string,
): Promise<{ provider: Provider; token: string } | null> {
  const { data: conn } = await db
    .from('calendar_connections')
    .select('provider, refresh_token_enc, access_token_enc, access_expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (!conn) return null;

  const provider = conn.provider as Provider;
  if (conn.access_token_enc && conn.access_expires_at && new Date(conn.access_expires_at).getTime() > Date.now() + 60_000) {
    return { provider, token: await decrypt(conn.access_token_enc, env.TOKEN_ENC_KEY) };
  }

  const refreshToken = await decrypt(conn.refresh_token_enc, env.TOKEN_ENC_KEY);
  const body =
    provider === 'google'
      ? new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
        })
      : new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: env.MS_CLIENT_ID,
          client_secret: env.MS_CLIENT_SECRET,
          scope: 'offline_access Calendars.ReadWrite',
        });
  const url =
    provider === 'google'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

  const res = await fetch(url, { method: 'POST', body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (json.error === 'invalid_grant') {
      // Kullanıcı izni geri çekmiş: bağlantıyı kaldır.
      await disconnect(db, userId);
      return null;
    }
    throw new Error(`${provider} token yenileme hatası: ${res.status} ${JSON.stringify(json)}`);
  }

  const update: Record<string, unknown> = {
    access_token_enc: await encrypt(json.access_token, env.TOKEN_ENC_KEY),
    access_expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Microsoft refresh token'ı döndürür (rotasyon); yenisini sakla.
  if (json.refresh_token) update.refresh_token_enc = await encrypt(json.refresh_token, env.TOKEN_ENC_KEY);
  await db.from('calendar_connections').update(update).eq('user_id', userId);

  return { provider, token: json.access_token };
}

export async function disconnect(db: Db, userId: string): Promise<void> {
  await db.from('calendar_connections').delete().eq('user_id', userId);
  await db.from('profiles').update({ calendar_provider: null, calendar_account: null }).eq('id', userId);
}

// ---------------------------------------------------------------------------
// Sağlayıcı API çağrıları
// ---------------------------------------------------------------------------

type ApiResult = { id: string } | 'gone';

async function googleWrite(token: string, item: CalItem, siteUrl: string, externalId?: string): Promise<ApiResult> {
  const body: Record<string, unknown> = {
    summary: item.summary,
    description: item.description,
    location: item.location ?? undefined,
    transparency: 'transparent',
    source: { title: 'CFP Calendar', url: siteUrl },
    reminders: { useDefault: false, overrides: item.reminders.map((minutes) => ({ method: 'popup', minutes })) },
  };
  if (item.allDay) {
    body.start = { date: item.allDay.start };
    body.end = { date: item.allDay.endExclusive };
  } else {
    body.start = { dateTime: item.timed!.startIso, timeZone: 'UTC' };
    body.end = { dateTime: item.timed!.endIso, timeZone: 'UTC' };
  }

  const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const res = await fetch(externalId ? `${base}/${encodeURIComponent(externalId)}` : base, {
    method: externalId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (externalId && (res.status === 404 || res.status === 410)) return 'gone';
  const json = await res.json();
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${JSON.stringify(json)}`);
  // Kullanıcı takviminden silinen etkinlikler Google'da "cancelled" olarak kalır.
  if (json.status === 'cancelled') return 'gone';
  return { id: json.id };
}

async function microsoftWrite(token: string, item: CalItem, externalId?: string): Promise<ApiResult> {
  const body: Record<string, unknown> = {
    subject: item.summary,
    body: { contentType: 'text', content: item.description },
    location: item.location ? { displayName: item.location } : undefined,
    showAs: 'free',
    isReminderOn: item.reminders.length > 0,
    reminderMinutesBeforeStart: item.reminders[0] ?? 0, // Outlook tek hatırlatıcı destekler: en erken olan
  };
  if (item.allDay) {
    body.isAllDay = true;
    body.start = { dateTime: `${item.allDay.start}T00:00:00`, timeZone: 'UTC' };
    body.end = { dateTime: `${item.allDay.endExclusive}T00:00:00`, timeZone: 'UTC' };
  } else {
    body.isAllDay = false;
    body.start = { dateTime: item.timed!.startIso.replace('Z', ''), timeZone: 'UTC' };
    body.end = { dateTime: item.timed!.endIso.replace('Z', ''), timeZone: 'UTC' };
  }

  const base = 'https://graph.microsoft.com/v1.0/me/events';
  const res = await fetch(externalId ? `${base}/${encodeURIComponent(externalId)}` : base, {
    method: externalId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (externalId && (res.status === 404 || res.status === 410)) return 'gone';
  const json = await res.json();
  if (!res.ok) throw new Error(`Microsoft Graph ${res.status}: ${JSON.stringify(json)}`);
  return { id: json.id };
}

// ---------------------------------------------------------------------------
// Hesap silme: eklediğimiz kayıtları takvimden kaldır, izni geri çek
// ---------------------------------------------------------------------------

/** Kullanıcının takvimine eklediğimiz tüm kayıtları siler; silinen kayıt sayısını döndürür. */
export async function deleteAllEntries(db: Db, env: CalendarEnv, userId: string): Promise<number> {
  const access = await getAccessToken(db, env, userId);
  if (!access) return 0;
  const { data: entries } = await db
    .from('calendar_entries')
    .select('id, provider, external_id, status')
    .eq('user_id', userId);

  let deleted = 0;
  for (const e of entries ?? []) {
    if (e.status !== 'active' || !e.external_id || e.provider !== access.provider) continue;
    const url =
      access.provider === 'google'
        ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(e.external_id)}`
        : `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(e.external_id)}`;
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${access.token}` } });
    // 404/410: kullanıcı zaten silmiş
    if (res.ok || res.status === 404 || res.status === 410) deleted++;
  }
  return deleted;
}

/** Google izinlerini geri çeker (Microsoft'ta karşılığı yok; kullanıcı hesap ayarlarından kaldırır). */
export async function revokeAccess(db: Db, env: CalendarEnv, userId: string): Promise<void> {
  const { data: conn } = await db
    .from('calendar_connections')
    .select('provider, refresh_token_enc')
    .eq('user_id', userId)
    .maybeSingle();
  if (conn?.provider !== 'google') return;
  const token = await decrypt(conn.refresh_token_enc, env.TOKEN_ENC_KEY);
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Tek bir kaydı takvimle eşitle (oluştur / güncelle / dokunma)
// ---------------------------------------------------------------------------

export async function syncEntry(
  db: Db,
  env: CalendarEnv,
  userId: string,
  event: EventRow,
  type: EntryType,
  locale: Locale,
  access?: { provider: Provider; token: string } | null,
  reminderDays?: number[],
): Promise<SyncResult> {
  if (!isApplicable(event, type)) return 'skipped';
  access ??= await getAccessToken(db, env, userId);
  if (!access) return 'skipped';

  const { data: existing } = await db
    .from('calendar_entries')
    .select('id, provider, external_id, synced_hash, status')
    .eq('user_id', userId)
    .eq('event_id', event.id)
    .eq('entry_type', type)
    .maybeSingle();

  // Kullanıcı takviminden sildiyse tekrar eklemiyoruz.
  if (existing?.status === 'removed_by_user') return 'skipped';

  const hash = entryHash(event, type, reminderDays);
  const sameProvider = existing && existing.provider === access.provider && existing.external_id;
  if (sameProvider && existing.synced_hash === hash) return 'unchanged';

  const item = buildItem(event, type, locale, env.SITE_URL, reminderDays);
  const externalId = sameProvider ? existing.external_id : undefined;
  const result =
    access.provider === 'google'
      ? await googleWrite(access.token, item, env.SITE_URL, externalId)
      : await microsoftWrite(access.token, item, externalId);

  const now = new Date().toISOString();
  if (result === 'gone') {
    await db.from('calendar_entries').update({ status: 'removed_by_user', updated_at: now }).eq('id', existing.id);
    return 'skipped';
  }

  await db.from('calendar_entries').upsert(
    {
      user_id: userId,
      event_id: event.id,
      entry_type: type,
      provider: access.provider,
      external_id: result.id,
      synced_hash: hash,
      status: 'active',
      updated_at: now,
    },
    { onConflict: 'user_id,event_id,entry_type' },
  );
  return externalId ? 'updated' : 'created';
}

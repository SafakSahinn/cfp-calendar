// 2. adım: her kullanıcı için başvurusu açılan / tarihi değişen / yaklaşan etkinlikleri bul;
// site içi bildirim oluştur ve takvim bağlıysa kayıtları ekle/güncelle.

import {
  EVENT_COLUMNS, getAccessToken, openDateOf, SUBMISSION_ENTRY_TYPES, syncEntry,
  type EventRow, type Locale, type Provider,
} from '../../supabase/functions/_shared/calendar.ts';
import { calendarEnv, db, selectAll } from './db.ts';
import { isCaution } from './quality.ts';
import { runStats } from './runStats.ts';

type Event = EventRow & { topics: string[]; ranks: Record<string, string>; is_ieee: boolean; flags: string[]; series_key: string | null };

interface Profile {
  id: string;
  locale: Locale;
  calendar_provider: Provider | null;
  topic_notifications: boolean;
}

interface Notif {
  event_id: string | null;
  type: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const TOPIC_MATCH_LIMIT = 15;      // kullanıcı başına çalıştırma başına en fazla konu bildirimi
const TOPIC_MATCH_FRESH_DAYS = 14; // sadece yeni yayınlanan çağrılar
const REMINDER_DAYS = 7;

const DAY = 86_400_000;

export async function runDispatch(log: (msg: string) => void = console.log): Promise<void> {
  const env = calendarEnv();
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  const events = await selectAll<Event>((from, to) =>
    db
      .from('events')
      .select(`${EVENT_COLUMNS}, topics, ranks, is_ieee, flags, series_key`)
      .or(`submission_deadline.gt.${new Date(now - DAY).toISOString()},event_end.gte.${today}`)
      .range(from, to),
  );
  const eventById = new Map(events.map((e) => [e.id, e]));
  log(`Dağıtım: ${events.length} güncel etkinlik`);

  const profiles = await selectAll<Profile>((from, to) =>
    db.from('profiles').select('id, locale, calendar_provider, topic_notifications').range(from, to),
  );
  const interests = await selectAll<{ user_id: string; event_id: string | null; topic: string | null }>((from, to) =>
    db.from('interests').select('user_id, event_id, topic').range(from, to),
  );

  const seriesFollows = await selectAll<{ user_id: string; series_key: string }>((from, to) =>
    db.from('series_follows').select('user_id, series_key').range(from, to),
  );
  // Seri → henüz son tarihi geçmemiş edisyonlar
  const bySeries = new Map<string, Event[]>();
  for (const ev of events) {
    if (!ev.series_key || !ev.submission_deadline || new Date(ev.submission_deadline).getTime() <= now) continue;
    bySeries.set(ev.series_key, [...(bySeries.get(ev.series_key) ?? []), ev]);
  }

  let notified = 0;
  let synced = 0;

  for (const profile of profiles) {
    const mine = interests.filter((i) => i.user_id === profile.id);
    const followed = new Set(mine.map((i) => i.event_id).filter(Boolean) as string[]);
    const topics = new Set(mine.map((i) => i.topic).filter(Boolean) as string[]);

    const { data: notifData } = await db
      .from('notifications')
      .select('event_id, type, dedupe_key, payload, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: true });
    const notifs = (notifData ?? []) as Notif[];
    const seenKeys = new Set(notifs.map((n) => n.dedupe_key));
    const notifiedEvents = new Set(notifs.map((n) => n.event_id));

    const pending: { event_id: string; type: string; dedupe_key: string; payload: Record<string, unknown> }[] = [];
    const notify = (event_id: string, type: string, dedupe_key: string, payload: Record<string, unknown> = {}) => {
      if (seenKeys.has(dedupe_key)) return;
      seenKeys.add(dedupe_key);
      pending.push({ event_id, type, dedupe_key, payload });
    };

    // Takvim: token'ı kullanıcı başına bir kez al.
    let access: Awaited<ReturnType<typeof getAccessToken>> = null;
    let entryTypes = new Map<string, Set<string>>();
    if (profile.calendar_provider) {
      try {
        access = await getAccessToken(db, env, profile.id);
        const { data } = await db.from('calendar_entries').select('event_id, entry_type').eq('user_id', profile.id);
        entryTypes = new Map();
        for (const r of data ?? []) {
          if (!entryTypes.has(r.event_id)) entryTypes.set(r.event_id, new Set());
          entryTypes.get(r.event_id)!.add(r.entry_type);
        }
      } catch (e) {
        log(`  ${profile.id}: takvim erişimi alınamadı: ${e}`);
      }
    }

    // --- 0) Takip edilen seriler: yeni edisyon yayımlanınca otomatik takip + bildirim ----------
    const autoFollow: string[] = [];
    for (const s of seriesFollows) {
      if (s.user_id !== profile.id) continue;
      for (const ev of bySeries.get(s.series_key) ?? []) {
        if (seenKeys.has(`series:${ev.id}`)) continue; // daha önce bildirildi (kullanıcı sonradan bırakmış olabilir)
        notify(ev.id, 'series_new', `series:${ev.id}`, { series: s.series_key, deadline: ev.submission_deadline });
        if (!followed.has(ev.id)) {
          followed.add(ev.id);
          autoFollow.push(ev.id);
        }
      }
    }
    if (autoFollow.length > 0) {
      const { error } = await db
        .from('interests')
        .upsert(autoFollow.map((event_id) => ({ user_id: profile.id, event_id })), { onConflict: 'user_id,event_id', ignoreDuplicates: true });
      if (error) log(`  ${profile.id}: seri takibi yazılamadı: ${error.message}`);
    }

    // --- 1) Takip edilen etkinlikler -------------------------------------------------
    for (const eventId of followed) {
      const ev = eventById.get(eventId);
      if (!ev) continue;
      const deadline = ev.submission_deadline ? new Date(ev.submission_deadline).getTime() : null;
      const isOpen = deadline !== null && deadline > now && openDateOf(ev) <= today;

      if (isOpen) {
        notify(ev.id, 'submission_open', `open:${ev.id}`, { deadline: ev.submission_deadline });

        // Son tarih değişti mi? (en son bildirdiğimiz tarihle karşılaştır)
        const last = [...notifs, ...pending]
          .filter((n) => n.event_id === ev.id && (n.type === 'submission_open' || n.type === 'dates_changed'))
          .map((n) => n.payload.deadline as string | undefined)
          .filter(Boolean)
          .at(-1);
        if (last && new Date(last).getTime() !== deadline) {
          notify(ev.id, 'dates_changed', `chg:${ev.id}:${ev.submission_deadline}`, {
            old_deadline: last,
            deadline: ev.submission_deadline,
          });
        }

        if (deadline - now < REMINDER_DAYS * DAY) {
          notify(ev.id, 'deadline_reminder', `rem:${ev.id}:${ev.submission_deadline}`, { deadline: ev.submission_deadline });
        }
      }

      if (access) {
        try {
          const existing = entryTypes.get(ev.id) ?? new Set();
          // Başvuru kayıtları: açıkken eklenir; daha önce eklendiyse tarih değişikliğinde güncellenir.
          for (const type of SUBMISSION_ENTRY_TYPES) {
            if (isOpen || existing.has(type)) {
              const r = await syncEntry(db, env, profile.id, ev, type, profile.locale, access);
              if (r === 'created' || r === 'updated') synced++;
            }
          }
          // Konferans günleri: sadece kullanıcı "ilgileniyorum" dediyse (kayıt zaten varsa) güncellenir.
          if (existing.has('event_days')) {
            const r = await syncEntry(db, env, profile.id, ev, 'event_days', profile.locale, access);
            if (r === 'updated') synced++;
          }
        } catch (e) {
          log(`  ${profile.id} / ${ev.acronym ?? ev.id}: takvim hatası: ${e}`);
        }
      }
    }

    // --- 2) Konu eşleşmeleri ("İlgileniyor musunuz?" bildirimleri) --------------------
    if (profile.topic_notifications && topics.size > 0) {
      const candidates = events
        .filter((ev) => {
          if (followed.has(ev.id) || notifiedEvents.has(ev.id)) return false;
          if (isCaution(ev.flags ?? [])) return false; // ticari/indeks vaatli çağrılar önerilmez
          if (!ev.submission_deadline || new Date(ev.submission_deadline).getTime() < now + 2 * DAY) return false;
          if (openDateOf(ev) > today) return false;
          if (now - new Date(ev.first_seen_at).getTime() > TOPIC_MATCH_FRESH_DAYS * DAY) return false;
          return ev.topics.some((t) => topics.has(t));
        })
        // Önce dereceli (CORE/CCF) ve IEEE etkinlikler, sonra en yakın son tarih
        .sort((a, b) => {
          const score = (e: Event) => (Object.keys(e.ranks).length ? 2 : 0) + (e.is_ieee ? 1 : 0);
          return score(b) - score(a) || a.submission_deadline!.localeCompare(b.submission_deadline!);
        })
        .slice(0, TOPIC_MATCH_LIMIT);

      for (const ev of candidates) {
        notify(ev.id, 'topic_match', `topic:${ev.id}`, {
          deadline: ev.submission_deadline,
          topics: ev.topics.filter((t) => topics.has(t)),
        });
      }
    }

    if (pending.length > 0) {
      const { error } = await db
        .from('notifications')
        .upsert(pending.map((p) => ({ ...p, user_id: profile.id })), { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
      if (error) log(`  ${profile.id}: bildirim yazılamadı: ${error.message}`);
      else notified += pending.length;
    }
  }

  log(`Dağıtım bitti: ${profiles.length} kullanıcı, ${notified} bildirim, ${synced} takvim kaydı`);
  Object.assign(runStats, { notifications: notified, calendar_entries: synced });
}

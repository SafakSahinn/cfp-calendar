// Bildirimdeki "İlgileniyorum / İlgilenmiyorum" butonları.
// İlgileniyorsa: etkinlik takibe alınır, başvuru tarihleri + konferans günlerinin tamamı anında takvime eklenir.
//
// POST { notification_id, response: "interested" | "not_interested" }

import { EVENT_COLUMNS, SUBMISSION_ENTRY_TYPES, syncEntry, type EntryType, type EventRow } from '../_shared/calendar.ts';
import { adminClient, calendarEnv, corsHeaders, json, requireUser } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const admin = adminClient();
  const user = await requireUser(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);

  // Bildirimden: { notification_id, response }  |  Etkinlik kartındaki "Takvime ekle": { event_id, response: "interested" }
  const body = await req.json().catch(() => ({}));
  const response = body.response;
  if (response !== 'interested' && response !== 'not_interested') return json({ error: 'response' }, 400);

  let eventId: string | null = null;
  const now = new Date().toISOString();

  if (body.notification_id) {
    const { data: notif } = await admin
      .from('notifications')
      .select('id, event_id')
      .eq('id', body.notification_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!notif) return json({ error: 'not_found' }, 404);
    await admin.from('notifications').update({ response, responded_at: now, read_at: now }).eq('id', notif.id);
    eventId = notif.event_id;
  } else {
    eventId = body.event_id ?? null;
  }

  if (response === 'not_interested' || !eventId) return json({ ok: true, calendar: {} });

  const { data: event } = await admin.from('events').select(EVENT_COLUMNS).eq('id', eventId).maybeSingle();
  if (!event) return json({ error: 'event_not_found' }, 404);

  // Takibe al (sonraki tarih değişiklikleri de takvime yansısın).
  await admin.from('interests').upsert({ user_id: user.id, event_id: eventId }, { onConflict: 'user_id,event_id', ignoreDuplicates: true });
  const { data: profile } = await admin.from('profiles').select('locale, reminder_days').eq('id', user.id).single();

  const results: Record<string, string> = {};
  const types: EntryType[] = ['event_days'];
  if (event.submission_deadline && new Date(event.submission_deadline) > new Date()) {
    types.unshift(...SUBMISSION_ENTRY_TYPES);
  }
  try {
    for (const type of types) {
      results[type] = await syncEntry(admin, calendarEnv(), user.id, event as EventRow, type, profile?.locale ?? 'tr', undefined, profile?.reminder_days ?? undefined);
    }
  } catch (e) {
    return json({ ok: true, calendar: results, calendar_error: String(e) });
  }
  return json({ ok: true, calendar: results });
});

// Kişiye özel ICS takvim aboneliği (takvim izni vermek istemeyenler / Apple Takvim için).
// GET /functions/v1/ics?token=<profiles.ics_token>
// JWT doğrulaması kapalı deploy edilir (--no-verify-jwt); güvenlik tahmin edilemez token ile sağlanır.

import { buildItem, EVENT_COLUMNS, isApplicable, SUBMISSION_ENTRY_TYPES, type EntryType, type EventRow } from '../_shared/calendar.ts';
import { adminClient, env } from '../_shared/http.ts';

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545: satırlar 75 oktette katlanır. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
}

const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const day = (date: string) => date.replace(/-/g, '');

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const token = params.get('token') ?? '';
  const groupId = params.get('group');
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response('Not found', { status: 404 });
  if (groupId !== null && !/^[0-9a-f-]{36}$/i.test(groupId)) return new Response('Not found', { status: 404 });

  const admin = adminClient();
  const { data: profile } = await admin.from('profiles').select('id, locale, reminder_days').eq('ics_token', token).maybeSingle();
  if (!profile) return new Response('Not found', { status: 404 });

  // ?group=… → grubun ortak takvimi (yalnızca token sahibi o grubun ÜYESİYSE); yoksa kişisel takip listesi.
  let calName = 'CFP Calendar';
  let rows: unknown[] | null;
  if (groupId) {
    const { data: member } = await admin
      .from('group_members').select('group_id, groups (name)').eq('group_id', groupId).eq('user_id', profile.id).maybeSingle();
    if (!member) return new Response('Not found', { status: 404 });
    calName = `CFP Calendar · ${(member as unknown as { groups: { name: string } }).groups.name}`;
    ({ data: rows } = await admin.from('group_events').select(`events (${EVENT_COLUMNS})`).eq('group_id', groupId));
  } else {
    // Takip edilen etkinlikler + "ilgileniyorum" denenler (ikisi de interests tablosuna yazılır).
    ({ data: rows } = await admin
      .from('interests')
      .select(`events (${EVENT_COLUMNS})`)
      .eq('user_id', profile.id)
      .not('event_id', 'is', null));
  }

  const siteUrl = env('SITE_URL');
  const now = stamp(new Date().toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CFP Calendar//TR', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(calName)}`];

  for (const row of rows ?? []) {
    const e = (row as unknown as { events: EventRow }).events;
    if (!e) continue;
    for (const type of [...SUBMISSION_ENTRY_TYPES, 'event_days'] as EntryType[]) {
      if (!isApplicable(e, type)) continue;
      const item = buildItem(e, type, profile.locale, siteUrl, profile.reminder_days ?? undefined);
      lines.push('BEGIN:VEVENT', `UID:${e.id}-${type}@cfp-calendar`, `DTSTAMP:${now}`);
      if (item.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${day(item.allDay.start)}`, `DTEND;VALUE=DATE:${day(item.allDay.endExclusive)}`);
      } else {
        lines.push(`DTSTART:${stamp(item.timed!.startIso)}`, `DTEND:${stamp(item.timed!.endIso)}`);
      }
      lines.push(fold(`SUMMARY:${esc(item.summary)}`), fold(`DESCRIPTION:${esc(item.description)}`));
      if (item.location) lines.push(fold(`LOCATION:${esc(item.location)}`));
      if (e.url) lines.push(fold(`URL:${e.url}`));
      lines.push('TRANSP:TRANSPARENT');
      for (const minutes of item.reminders) {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(item.summary)}`, `TRIGGER:-PT${minutes}M`, 'END:VALARM');
      }
      lines.push('END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=3600' },
  });
});

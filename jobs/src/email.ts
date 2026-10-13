// 3. adım: e-postalar (Gmail SMTP: SMTP_USER / SMTP_PASS = uygulama şifresi).
//  * Anında (email_frequency='instant'): yeni site içi mesajların özeti, 12 saatte en fazla bir.
//  * Haftalık (varsayılan): pazartesi (Türkiye saati) ilk çalışmada — bu hafta kapanan takip edilenler,
//    ilgi alanında yaklaşanlar, gruplardan öneriler. 'instant' kullanıcılar da haftalık özeti alır.
//  * Yeni geri bildirimler yöneticiye (ADMIN_EMAIL) iletilir.
// Güvenli deneme: EMAIL_ONLY_TO="a@x.com,b@y.com" verilirse yalnızca bu adreslere gönderilir (diğerleri hiç işaretlenmez);
// FORCE_WEEKLY=1 haftalık özeti günü beklemeden gönderir.

import nodemailer, { type Transporter } from 'nodemailer';
import { db } from './db.ts';
import { runStats } from './runStats.ts';
import { buildWeekly, EV_COLS, type Ev } from './weekly.ts';
import { BRAND, renderDigest, renderWeekly, type DigestEvent, type DigestItem } from './emailRender.ts';

type NotifType = DigestItem['type'];

/** Bu süreden eski, hiç gönderilmemiş bildirimler toplu gönderilmez (özellik açılırken birikmiş yığın olmasın). */
const BACKLOG_HOURS = 36;
/** Gerçek olmayan alan adlarına gönderme (testler, örnek hesaplar): geri dönen e-postalar Gmail itibarını düşürür. */
const UNDELIVERABLE = /@[^@]+\.(test|example|invalid|localhost)$/i;
const DAY = 86_400_000;

interface Row {
  id: string;
  user_id: string;
  type: NotifType | 'announcement';
  payload: DigestItem['payload'];
  events: DigestEvent | null;
}

interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  locale: string;
  email_notifications: boolean;
  email_frequency: 'weekly' | 'instant';
  email_token: string;
  last_weekly_email_at: string | null;
}

const PROFILE_COLS = 'id, email, display_name, locale, email_notifications, email_frequency, email_token, last_weekly_email_at';

export async function runEmails(log: (msg: string) => void = console.log): Promise<void> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    log('E-posta: SMTP_USER/SMTP_PASS tanımlı değil, atlandı');
    return;
  }
  const onlyTo = (process.env.EMAIL_ONLY_TO ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (onlyTo.length) log(`E-posta: deneme modu — yalnızca ${onlyTo.length} adrese gönderilecek`);
  const allowed = (email: string | null): email is string =>
    !!email && !UNDELIVERABLE.test(email) && (onlyTo.length === 0 || onlyTo.includes(email.toLowerCase()));

  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  const ctx = { transport, from: user, siteUrl: process.env.SITE_URL!, fnBase: `${process.env.SUPABASE_URL}/functions/v1`, allowed, onlyTo, log };

  await sendInstant(ctx);
  await sendWeekly(ctx);
  if (onlyTo.length === 0) await forwardFeedback(transport, user, log);
}

interface Ctx {
  transport: Transporter;
  from: string;
  siteUrl: string;
  fnBase: string;
  allowed: (email: string | null) => email is string;
  onlyTo: string[];
  log: (msg: string) => void;
}

async function send(ctx: Ctx, p: Profile, mail: { subject: string; html: string; text: string }) {
  const unsubscribeUrl = `${ctx.fnBase}/unsubscribe?token=${p.email_token}`;
  await ctx.transport.sendMail({
    from: { name: BRAND, address: ctx.from },
    to: p.email!,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  });
}

// ---------------------------------------------------------------------------
// Anında özet
// ---------------------------------------------------------------------------
async function sendInstant(ctx: Ctx) {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - BACKLOG_HOURS * 3600_000).toISOString();
  if (ctx.onlyTo.length === 0) {
    // Eski birikmiş bildirimleri e-postalamadan "gönderilmiş" say
    await db.from('notifications').update({ emailed_at: now }).is('emailed_at', null).lt('created_at', cutoff);
  }

  const { data, error } = await db
    .from('notifications')
    .select('id, user_id, type, payload, events (acronym, title, url, location, submission_deadline, event_start, event_end)')
    .is('emailed_at', null)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  const byUser = new Map<string, Row[]>();
  for (const r of (data ?? []) as unknown as Row[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  if (byUser.size === 0) return ctx.log('E-posta (anında): yeni bildirim yok');

  const { data: profiles } = await db.from('profiles').select(PROFILE_COLS).in('id', [...byUser.keys()]);
  let sent = 0;
  for (const p of (profiles ?? []) as Profile[]) {
    // Deneme modunda listede olmayanlara dokunma (gerçek gönderimde sırası gelince alırlar)
    if (ctx.onlyTo.length && !ctx.allowed(p.email)) continue;
    const items = byUser.get(p.id)!;
    const eventItems = items.filter((i) => i.type !== 'announcement' && i.events);
    const wantsInstant = p.email_notifications && p.email_frequency === 'instant';
    if (wantsInstant && ctx.allowed(p.email) && eventItems.length) {
      const mail = renderDigest({
        locale: p.locale === 'en' ? 'en' : 'tr',
        name: p.display_name,
        items: eventItems.map((i) => ({ type: i.type as NotifType, payload: i.payload ?? {}, event: i.events })),
        siteUrl: ctx.siteUrl,
        unsubscribeUrl: `${ctx.fnBase}/unsubscribe?token=${p.email_token}`,
      });
      try {
        await send(ctx, p, mail);
        sent++;
      } catch (e) {
        ctx.log(`  ${p.id}: e-posta gönderilemedi: ${e}`);
        continue; // işaretleme: sonraki çalışmada yeniden denenir
      }
    }
    // Haftalık/kapalı kullanıcıların bildirimleri de işaretlenir (birikmesin; haftalık özet ayrıca hesaplanır)
    await db.from('notifications').update({ emailed_at: new Date().toISOString() }).in('id', items.map((i) => i.id));
  }
  ctx.log(`E-posta (anında): ${sent} özet gönderildi (${byUser.size} kullanıcının yeni bildirimi vardı)`);
  runStats.emails_instant = sent;
}

// ---------------------------------------------------------------------------
// Haftalık özet
// ---------------------------------------------------------------------------
/** Türkiye saatine göre pazartesi mi? */
function isMondayInTurkey(d = new Date()): boolean {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', weekday: 'short' }).format(d) === 'Mon';
}

async function sendWeekly(ctx: Ctx) {
  const force = process.env.FORCE_WEEKLY === '1';
  if (!force && !isMondayInTurkey()) return;
  const now = Date.now();

  const { data: profData } = await db.from('profiles').select(PROFILE_COLS).eq('email_notifications', true);
  const due = ((profData ?? []) as Profile[]).filter(
    (p) => ctx.allowed(p.email) && (force || !p.last_weekly_email_at || now - new Date(p.last_weekly_email_at).getTime() > 6 * DAY),
  );
  if (due.length === 0) return ctx.log('E-posta (haftalık): sırası gelen kullanıcı yok');

  const ids = due.map((p) => p.id);
  const [{ data: interests }, { data: open }, { data: memberships }] = await Promise.all([
    db.from('interests').select('user_id, event_id, topic').in('user_id', ids),
    db.from('events').select(EV_COLS).gt('submission_deadline', new Date(now).toISOString()).lt('submission_deadline', new Date(now + 22 * DAY).toISOString()).limit(2000),
    db.from('group_members').select('user_id, group_id').in('user_id', ids),
  ]);
  const followedIds = [...new Set((interests ?? []).map((i) => i.event_id).filter(Boolean) as string[])];
  const { data: followedEvents } = followedIds.length
    ? await db.from('events').select(EV_COLS).in('id', followedIds)
    : { data: [] };
  const groupIds = [...new Set((memberships ?? []).map((m) => m.group_id))];
  const { data: news } = groupIds.length
    ? await db.from('group_events')
      .select(`group_id, added_by, note, created_at, groups (name), events (${EV_COLS})`)
      .in('group_id', groupIds).gt('created_at', new Date(now - 7 * DAY).toISOString())
    : { data: [] };
  const adders = [...new Set((news ?? []).map((n) => n.added_by).filter(Boolean) as string[])];
  const { data: adderProfiles } = adders.length ? await db.from('profiles').select('id, display_name').in('id', adders) : { data: [] };
  const nameOf = new Map((adderProfiles ?? []).map((p) => [p.id, p.display_name as string | null]));
  const eventById = new Map(((followedEvents ?? []) as unknown as Ev[]).map((e) => [e.id, e]));

  let sent = 0;
  for (const p of due) {
    const mine = (interests ?? []).filter((i) => i.user_id === p.id);
    const followed = new Set(mine.map((i) => i.event_id).filter(Boolean) as string[]);
    const myGroups = new Set((memberships ?? []).filter((m) => m.user_id === p.id).map((m) => m.group_id));
    const data = buildWeekly({
      now,
      followed,
      topics: new Set(mine.map((i) => i.topic).filter(Boolean) as string[]),
      open: (open ?? []) as unknown as Ev[],
      followedEvents: [...followed].map((id) => eventById.get(id)).filter(Boolean) as Ev[],
      groupNews: ((news ?? []) as unknown as { group_id: string; added_by: string | null; note: string | null; groups: { name: string }; events: Ev }[])
        .filter((n) => myGroups.has(n.group_id) && n.added_by !== p.id && n.events)
        .map((n) => ({ group: n.groups.name, by: n.added_by ? nameOf.get(n.added_by) ?? null : null, note: n.note, event: n.events })),
    });
    const mail = renderWeekly({
      locale: p.locale === 'en' ? 'en' : 'tr', name: p.display_name, data, siteUrl: ctx.siteUrl,
      unsubscribeUrl: `${ctx.fnBase}/unsubscribe?token=${p.email_token}`,
    });
    if (mail) {
      try {
        await send(ctx, p, mail);
        sent++;
      } catch (e) {
        ctx.log(`  ${p.id}: haftalık özet gönderilemedi: ${e}`);
        continue;
      }
    }
    await db.from('profiles').update({ last_weekly_email_at: new Date().toISOString() }).eq('id', p.id);
  }
  ctx.log(`E-posta (haftalık): ${sent} özet gönderildi (${due.length} kullanıcı sıradaydı)`);
  runStats.emails_weekly = sent;
}

// ---------------------------------------------------------------------------
// Geri bildirimleri yöneticiye ilet
// ---------------------------------------------------------------------------
async function forwardFeedback(transport: Transporter, from: string, log: (msg: string) => void) {
  const admin = process.env.ADMIN_EMAIL;
  if (!admin) return;
  const { data } = await db
    .from('feedback')
    .select('id, kind, url, message, created_at, user_id, events (acronym, title, url)')
    .is('notified_at', null)
    .order('created_at');
  const rows = (data ?? []) as unknown as {
    id: string; kind: string; url: string | null; message: string; created_at: string; user_id: string | null;
    events: { acronym: string | null; title: string; url: string | null } | null;
  }[];
  if (rows.length === 0) return;

  const { data: users } = await db.from('profiles').select('id, email').in('id', rows.map((r) => r.user_id).filter(Boolean) as string[]);
  const emailOf = new Map((users ?? []).map((u) => [u.id, u.email]));
  const kinds: Record<string, string> = { suggest_event: '➕ Etkinlik önerisi', wrong_info: '⚠️ Hatalı bilgi', other: '💬 Diğer' };

  const text = rows.map((r) => [
    `${kinds[r.kind] ?? r.kind} — ${r.created_at.slice(0, 16).replace('T', ' ')} UTC`,
    `Gönderen: ${(r.user_id && emailOf.get(r.user_id)) ?? '?'}`,
    ...(r.events ? [`Etkinlik: ${r.events.acronym ?? ''} ${r.events.title} ${r.events.url ?? ''}`] : []),
    ...(r.url ? [`Bağlantı: ${r.url}`] : []),
    `Mesaj: ${r.message}`,
  ].join('\n')).join('\n\n----\n\n');

  await transport.sendMail({
    from: { name: BRAND, address: from },
    to: admin,
    subject: `${BRAND} · ${rows.length} yeni geri bildirim`,
    text: `${text}\n\nYönetim paneli → Geri bildirimler sekmesinden yanıtlayabilirsiniz.`,
  });
  await db.from('feedback').update({ notified_at: new Date().toISOString() }).in('id', rows.map((r) => r.id));
  log(`Geri bildirim: ${rows.length} kayıt yöneticiye iletildi`);
}

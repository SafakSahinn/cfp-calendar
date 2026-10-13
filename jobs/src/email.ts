// 3. adım: yeni site içi bildirimleri kullanıcı başına TEK özet e-postası olarak gönderir (12 saatte en fazla bir).
// Gönderim Gmail SMTP ile (SMTP_USER / SMTP_PASS = uygulama şifresi). Ayrıca yeni geri bildirimleri yöneticiye iletir.

import nodemailer, { type Transporter } from 'nodemailer';
import { db } from './db.ts';
import { BRAND, renderDigest, type DigestEvent, type DigestItem } from './emailRender.ts';

type NotifType = DigestItem['type'];

/** Bu süreden eski, hiç gönderilmemiş bildirimler toplu gönderilmez (özellik açılırken birikmiş yığın olmasın). */
const BACKLOG_HOURS = 36;
/** Gerçek olmayan alan adlarına gönderme (testler, örnek hesaplar): geri dönen e-postalar Gmail itibarını düşürür. */
const UNDELIVERABLE = /@[^@]+.(test|example|invalid|localhost)$/i;

interface Row {
  id: string;
  user_id: string;
  type: NotifType;
  payload: DigestItem['payload'];
  events: DigestEvent | null;
}

export async function runEmails(log: (msg: string) => void = console.log): Promise<void> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const siteUrl = process.env.SITE_URL!;
  const fnBase = `${process.env.SUPABASE_URL}/functions/v1`;
  if (!user || !pass) {
    log('E-posta: SMTP_USER/SMTP_PASS tanımlı değil, atlandı');
    return;
  }
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - BACKLOG_HOURS * 3600_000).toISOString();

  // Eski birikmiş bildirimleri e-postalamadan "gönderilmiş" say
  await db.from('notifications').update({ emailed_at: now }).is('emailed_at', null).lt('created_at', cutoff);

  const { data, error } = await db
    .from('notifications')
    .select('id, user_id, type, payload, events (acronym, title, url, location, submission_deadline, event_start, event_end)')
    .is('emailed_at', null)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];

  const byUser = new Map<string, Row[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  const { data: profiles } = byUser.size
    ? await db.from('profiles').select('id, email, display_name, locale, email_notifications, email_token').in('id', [...byUser.keys()])
    : { data: [] };

  let sent = 0;
  for (const p of profiles ?? []) {
    const items = byUser.get(p.id)!;
    const ids = items.map((i) => i.id);
    const eligible = p.email_notifications && p.email && !UNDELIVERABLE.test(p.email) && items.some((i) => i.events);
    if (eligible) {
      const unsubscribeUrl = `${fnBase}/unsubscribe?token=${p.email_token}`;
      const mail = renderDigest({
        locale: p.locale === 'en' ? 'en' : 'tr',
        name: p.display_name,
        items: items.filter((i) => i.type !== ('announcement' as string)).map((i) => ({ type: i.type, payload: i.payload ?? {}, event: i.events })),
        siteUrl,
        unsubscribeUrl,
      });
      try {
        await transport.sendMail({
          from: { name: BRAND, address: user },
          to: p.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        sent++;
      } catch (e) {
        log(`  ${p.id}: e-posta gönderilemedi: ${e}`);
        continue; // işaretleme: sonraki çalışmada yeniden denenir
      }
    }
    await db.from('notifications').update({ emailed_at: now }).in('id', ids);
  }
  log(`E-posta: ${sent} özet gönderildi (${byUser.size} kullanıcının yeni bildirimi vardı)`);

  await forwardFeedback(transport, user, log);
}

/** Yeni geri bildirimleri (etkinlik önerisi, hatalı bilgi) yöneticiye tek e-postada iletir. */
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
    `Kayıt: feedback.id = ${r.id}`,
  ].join('\n')).join('\n\n----\n\n');

  await transport.sendMail({
    from: { name: BRAND, address: from },
    to: admin,
    subject: `${BRAND} · ${rows.length} yeni geri bildirim`,
    text: `${text}\n\nDurumu güncellemek için Supabase → Table Editor → feedback (status: done / rejected).`,
  });
  await db.from('feedback').update({ notified_at: new Date().toISOString() }).in('id', rows.map((r) => r.id));
  log(`Geri bildirim: ${rows.length} kayıt yöneticiye iletildi`);
}

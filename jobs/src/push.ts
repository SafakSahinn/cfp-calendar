// Yeni site içi bildirimleri, kullanıcının bildirim izni verdiği cihazlara Web Push olarak gönderir.
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY yoksa sessizce atlanır.

import webpush from 'web-push';
import { chunks, db } from './db.ts';
import { renderPush, type Locale, type PushItem } from './pushRender.ts';
import { runStats } from './runStats.ts';

const BACKLOG_HOURS = 24; // daha eski bildirimler push'lanmaz (ilk kurulumda geçmiş yığılması olmasın)

interface Row {
  id: string;
  user_id: string;
  type: string;
  payload: PushItem['payload'];
  events: PushItem['event'];
  announcements: PushItem['announcement'];
}

export async function runPush(log: (m: string) => void = console.log): Promise<void> {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return log('Anlık bildirim: VAPID anahtarı yok, atlandı');
  webpush.setVapidDetails(`mailto:${process.env.ADMIN_EMAIL || 'noreply@example.org'}`, pub, priv);

  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - BACKLOG_HOURS * 3600_000).toISOString();
  await db.from('notifications').update({ pushed_at: now }).is('pushed_at', null).lt('created_at', cutoff);

  const { data, error } = await db
    .from('notifications')
    .select('id, user_id, type, payload, events (id, acronym, title, submission_deadline), announcements (title)')
    .is('pushed_at', null)
    .order('created_at')
    .limit(5000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return log('Anlık bildirim: yeni bildirim yok');

  const byUser = new Map<string, Row[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  const users = [...byUser.keys()];
  const subs: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  const locales = new Map<string, Locale>();
  for (const ids of chunks(users, 200)) {
    const [{ data: s }, { data: p }] = await Promise.all([
      db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', ids),
      db.from('profiles').select('id, locale').in('id', ids),
    ]);
    subs.push(...(s ?? []));
    for (const x of p ?? []) locales.set(x.id, x.locale === 'en' ? 'en' : 'tr');
  }

  let sent = 0, removed = 0;
  for (const sub of subs) {
    const msg = renderPush(
      byUser.get(sub.user_id)!.map((r) => ({ type: r.type, event: r.events, announcement: r.announcements, payload: r.payload ?? {} })),
      locales.get(sub.user_id) ?? 'tr',
    );
    if (!msg) continue;
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(msg), { TTL: 2 * 86_400 });
      await db.from('push_subscriptions').update({ last_ok_at: now }).eq('id', sub.id);
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Abonelik iptal edilmiş / süresi dolmuş
        await db.from('push_subscriptions').delete().eq('id', sub.id);
        removed++;
      } else {
        log(`  push ${sub.id}: ${status ?? ''} ${(e as Error).message}`);
      }
    }
  }
  for (const ids of chunks(rows.map((r) => r.id), 300)) await db.from('notifications').update({ pushed_at: now }).in('id', ids);
  log(`Anlık bildirim: ${byUser.size} kullanıcı, ${subs.length} cihaz, ${sent} gönderildi, ${removed} geçersiz abonelik silindi`);
  runStats.push_sent = sent;
}

// Yeni site içi bildirimleri, kullanıcının bildirim izni verdiği cihazlara Web Push olarak gönderir.
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY yoksa sessizce atlanır.

import webpush from 'web-push';
import { chunks, db } from './db.ts';
import { renderPush, type Locale, type PushItem } from './pushRender.ts';
import { runStats } from './runStats.ts';

const BACKLOG_HOURS = 36; // daha eski bildirimler push'lanmaz (12 saatlik döngü + 8 saat bekletme payı)
/** Bir cihaza bu süre içinde push gittiyse yenisi gönderilmez, bir sonraki özete kalır → günde en fazla ~2 bildirim */
const MIN_GAP_HOURS = 8;

interface Row {
  id: string;
  user_id: string;
  type: string;
  group_id: string | null;
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
    .select('id, user_id, type, group_id, payload, events (id, acronym, title, submission_deadline), announcements (title)')
    .is('pushed_at', null)
    .order('created_at')
    .limit(5000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return log('Anlık bildirim: yeni bildirim yok');

  const byUser = new Map<string, Row[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  const users = [...byUser.keys()];
  const subs: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; last_ok_at: string | null }[] = [];
  const locales = new Map<string, Locale>();
  for (const ids of chunks(users, 200)) {
    const [{ data: s }, { data: p }] = await Promise.all([
      db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, last_ok_at').in('user_id', ids),
      db.from('profiles').select('id, locale').in('id', ids),
    ]);
    subs.push(...(s ?? []));
    for (const x of p ?? []) locales.set(x.id, x.locale === 'en' ? 'en' : 'tr');
  }

  // Yakın zamanda bildirim almış kullanıcıları bu çalışmada atla; bildirimleri işaretlenmez, sonraki çalışmada özetlenir
  const gap = Date.now() - MIN_GAP_HOURS * 3600_000;
  const waiting = new Set(subs.filter((s) => s.last_ok_at && new Date(s.last_ok_at).getTime() > gap).map((s) => s.user_id));

  let sent = 0, removed = 0;
  for (const sub of subs) {
    if (waiting.has(sub.user_id)) continue;
    const msg = renderPush(
      byUser.get(sub.user_id)!.map((r) => ({ type: r.type, event: r.events, announcement: r.announcements, payload: r.payload ?? {}, group_id: r.group_id })),
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
  for (const ids of chunks(rows.filter((r) => !waiting.has(r.user_id)).map((r) => r.id), 300)) await db.from('notifications').update({ pushed_at: now }).in('id', ids);
  log(`Anlık bildirim: ${byUser.size} kullanıcı, ${subs.length} cihaz, ${sent} gönderildi, ${removed} geçersiz abonelik silindi, ${waiting.size} kullanıcı sonraki özete bırakıldı (son ${MIN_GAP_HOURS} saatte bildirim almış)`);
  runStats.push_sent = sent;
}

/** Deneme: son 2 saatte abone olan cihazlara tek seferlik "çalışıyor" bildirimi (kişisel veri kaydedilmez, sadece sayı). */
export async function runPushTest(log: (m: string) => void = console.log): Promise<void> {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return log('Push denemesi: VAPID anahtarı yok');
  webpush.setVapidDetails(`mailto:${process.env.ADMIN_EMAIL || 'noreply@example.org'}`, pub, priv);
  const since = new Date(Date.now() - 2 * 3600_000).toISOString();
  const { data } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').gte('created_at', since);
  let ok = 0;
  for (const s of data ?? []) {
    const msg = { title: 'CFP Calendar', body: 'Sunucudan gelen deneme bildirimi: bildirimler bu cihazda çalışıyor ✅', url: '#/profil', tag: 'cfp-server-test' };
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 3600 });
      ok++;
    } catch (e) {
      log(`  deneme ${s.id}: ${(e as { statusCode?: number }).statusCode ?? ''} ${(e as Error).message}`);
    }
  }
  log(`Push denemesi: son 2 saatte abone olan ${(data ?? []).length} cihaz, ${ok} gönderildi`);
}

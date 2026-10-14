import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderPush, type PushItem } from '../src/pushRender.ts';

const ev = (id: string, acronym: string | null, title: string, deadline: string | null = '2026-11-20T11:59:59Z') => ({ id, acronym, title, submission_deadline: deadline });

test('push: tek bildirim → başlık türü, gövde çağrı adı + son tarih, tıklayınca çağrı sayfası', () => {
  const m = renderPush([{ type: 'submission_open', event: ev('e1', 'ICASSP', 'Int. Conf. on Acoustics'), announcement: null, payload: {} }], 'tr')!;
  assert.equal(m.title, '📝 Başvuru açıldı');
  assert.match(m.body, /^ICASSP – Int\. Conf\. on Acoustics · son başvuru 20 Kas/);
  assert.equal(m.url, '#/etkinlik/e1');
});

test('push: birden çok bildirim tek mesajda toplanır, en acil olan öne alınır', () => {
  const items: PushItem[] = [
    { type: 'topic_match', event: ev('a', 'AAA', 'x'), announcement: null, payload: {} },
    { type: 'deadline_reminder', event: ev('b', 'BBB', 'y'), announcement: null, payload: {} },
    { type: 'submission_open', event: ev('c', null, 'Some Workshop'), announcement: null, payload: {} },
    { type: 'topic_match', event: ev('d', 'DDD', 'z'), announcement: null, payload: {} },
  ];
  const m = renderPush(items, 'en')!;
  assert.equal(m.title, 'CFP Calendar · 4 new notifications');
  assert.match(m.body, /^⏰ Less than a week to the deadline: BBB, Some Workshop, AAA…$/);
  assert.equal(m.url, '#/mesajlar');
});

test('push: duyuru ve boş liste', () => {
  const m = renderPush([{ type: 'announcement', event: null, announcement: { title: 'Bakım çalışması' }, payload: {} }], 'tr')!;
  assert.equal(m.title, '📣 Duyuru');
  assert.equal(m.body, 'Bakım çalışması');
  assert.equal(m.url, '#/mesajlar');
  assert.equal(renderPush([], 'tr'), null);
});

test('hatırlatma eşiği: kalan süreyi kapsayan en küçük gün; birikmiş eşikler toplu gelmez', async () => {
  const { reminderThreshold } = await import('../src/reminders.ts');
  const D = 86_400_000;
  assert.equal(reminderThreshold(10 * D, [7]), null); // 7 güne daha var
  assert.equal(reminderThreshold(6 * D, [7]), 7);
  assert.equal(reminderThreshold(10 * D, [14, 7, 3]), 14);
  assert.equal(reminderThreshold(5 * D, [14, 7, 3]), 7);
  assert.equal(reminderThreshold(2 * D, [14, 7, 3]), 3); // geç takip: sadece 3 günlük gelir
  assert.equal(reminderThreshold(2 * D, [14, 7]), 7);
  assert.equal(reminderThreshold(-1, [7]), null); // geçmiş
  assert.equal(reminderThreshold(2 * D, []), null); // hatırlatma kapalı
});

test('push: seçilen güne göre hatırlatma başlığı ve grup yorumu', () => {
  const r = renderPush([{ type: 'deadline_reminder', event: ev('e', 'DAC', 'Design Automation'), announcement: null, payload: { days: 3 } }], 'tr')!;
  assert.equal(r.title, '⏰ Son başvuruya 3 günden az kaldı');
  const c = renderPush([{ type: 'group_comment', event: ev('e', 'DAC', 'x'), announcement: null, payload: { by: 'Ayşe', note: 'Ben de gönderiyorum' }, group_id: 'g1' }], 'tr')!;
  assert.equal(c.title, '💬 Grubunuzda yeni yorum');
  assert.equal(c.body, 'Ayşe: Ben de gönderiyorum · DAC');
  assert.equal(c.url, '#/grup/g1');
});

test('kabul sonrası işler: sahip ve ortak yazara, seçilen eşikte; reddedilen/geçmiş tarihli hariç', async () => {
  const { taskReminders } = await import('../src/reminders.ts');
  const now = Date.parse('2026-10-14T09:00:00Z');
  const sub = (o: Record<string, unknown>) => ({ id: 's', user_id: 'owner', event_id: 'e', status: 'accepted', paper_title: 'P', camera_ready_due: null, registration_due: null, presentation_at: null, submission_members: [{ user_id: 'co' }], ...o });
  const subs = [sub({ camera_ready_due: '2026-10-16', registration_due: '2026-11-30' })];
  const own = taskReminders(subs, 'owner', [7, 3], now);
  assert.equal(own.length, 1); // kayıt tarihi 7 günden uzak
  assert.deepEqual(own[0].payload, { task: 'camera_ready', date: '2026-10-16', paper: 'P', days: 3 });
  assert.equal(taskReminders(subs, 'co', [7], now)[0].payload.days, 7); // ortak yazar kendi eşiğiyle
  assert.equal(taskReminders(subs, 'stranger', [7], now).length, 0);
  assert.equal(taskReminders([sub({ status: 'rejected', camera_ready_due: '2026-10-16' })], 'owner', [7], now).length, 0);
  assert.equal(taskReminders([sub({ camera_ready_due: '2026-10-01' })], 'owner', [7], now).length, 0);
});

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

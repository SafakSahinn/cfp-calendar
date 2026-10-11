import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderDigest, type DigestItem } from '../src/emailRender.ts';

const ev = (acronym: string, deadline = '2026-11-16T11:59:59.000Z') => ({
  acronym, title: `${acronym} Conference <2027>`, url: `https://example.org/${acronym}`, location: 'Ankara',
  submission_deadline: deadline, event_start: '2027-06-20', event_end: '2027-06-24',
});

const base = { name: 'Ayşe', siteUrl: 'https://site/cfp/', unsubscribeUrl: 'https://fn/unsubscribe?token=abc' };

test('tek bildirim: konu satırı çağrıyı adlandırır', () => {
  const m = renderDigest({ ...base, locale: 'tr', items: [{ type: 'submission_open', payload: {}, event: ev('DAC') }] });
  assert.equal(m.subject, 'CFP Calendar · Başvuru açıldı: DAC');
  assert.match(m.html, /Merhaba Ayşe,/);
  assert.match(m.html, /16 Kasım 2026 14:59 TSİ/); // AoE 23:59 → TSİ 14:59 (ertesi gün)
  assert.match(m.html, /https:\/\/fn\/unsubscribe\?token=abc/);
  assert.match(m.text, /Son başvuru: 16 Kasım 2026 14:59 TSİ/);
});

test('HTML kaçışı: başlıktaki < > zararsız', () => {
  const m = renderDigest({ ...base, locale: 'tr', items: [{ type: 'submission_open', payload: {}, event: ev('X') }] });
  assert.ok(m.html.includes('X Conference &lt;2027&gt;'));
  assert.ok(!m.html.includes('<2027>'));
});

test('çoklu bildirim: sayı, tarih değişikliği ve "ilgileniyor musunuz" bağlantısı', () => {
  const items: DigestItem[] = [
    { type: 'dates_changed', payload: { old_deadline: '2026-11-01T11:59:59.000Z' }, event: ev('ICASSP') },
    { type: 'topic_match', payload: {}, event: ev('ISCAS') },
    { type: 'deadline_reminder', payload: {}, event: ev('DATE') },
  ];
  const m = renderDigest({ ...base, locale: 'en', items });
  assert.equal(m.subject, 'CFP Calendar · 3 new notifications — Deadline changed: ICASSP');
  assert.match(m.html, /was: 1 November 2026( at)? 11:59 UTC/);
  assert.match(m.html, /Interested\? Reply with one click/);
  assert.match(m.html, /https:\/\/site\/cfp\/#\/mesajlar/);
});

test('25\'ten fazla bildirim kısaltılır', () => {
  const items: DigestItem[] = Array.from({ length: 30 }, (_, i) => ({ type: 'topic_match' as const, payload: {}, event: ev(`C${i}`) }));
  const m = renderDigest({ ...base, locale: 'tr', items });
  assert.match(m.html, /…ve 5 bildirim daha/);
  assert.equal((m.html.match(/İlgi alanınızda yeni çağrı/g) ?? []).length, 25);
});

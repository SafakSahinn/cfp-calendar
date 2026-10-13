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

test('haftalık özet: bölümler, bağlantılar, boşsa gönderilmez', async () => {
  const { renderWeekly } = await import('../src/emailRender.ts');
  const e = { ...ev('DAC'), id: 'e1', ranks: { core: 'A' }, is_ieee: true, abstract_deadline: '2026-11-09T11:59:59.000Z' };
  const m = renderWeekly({ ...base, locale: 'tr', data: {
    followedSoon: [e], forYou: [{ ...ev('ISCAS'), id: 'e2' }],
    groupNews: [{ group: 'Gömülü Lab', by: 'Doç. Dr. X', note: 'Tezinle uyumlu', event: { ...ev('DATE'), id: 'e3' } }],
  } })!;
  assert.equal(m.subject, 'CFP Calendar · Bu hafta: 1 son tarih');
  assert.match(m.html, /Takip ettikleriniz/);
  assert.match(m.html, /Gruplarınızdan öneriler/);
  assert.match(m.html, /Doç\. Dr\. X · Gömülü Lab — “Tezinle uyumlu”/);
  assert.match(m.html, /https:\/\/site\/cfp\/#\/etkinlik\/e1/);
  assert.match(m.html, /CORE A/);
  assert.match(m.html, /Özet: 9 Kasım 2026 14:59 TSİ/);
  assert.match(m.html, /#\/takvimim/);
  assert.equal(renderWeekly({ ...base, locale: 'tr', data: { followedSoon: [], forYou: [], groupNews: [] } }), null);
});

test('haftalık özet içeriği: pencereler, dikkat işaretlileri, takip edilenler hariç', async () => {
  const { buildWeekly } = await import('../src/weekly.ts');
  const now = Date.parse('2026-10-12T06:00:00Z');
  const d = (days: number) => new Date(now + days * 86_400_000).toISOString();
  const e = (id: string, deadlineDays: number, extra: object = {}) => ({
    id, acronym: id, title: id, url: null, location: null, submission_deadline: d(deadlineDays), event_start: null, event_end: null,
    abstract_deadline: null, topics: ['vlsi'], ranks: {}, is_ieee: false, flags: [], ...extra,
  });
  const w = buildWeekly({
    now, followed: new Set(['F1', 'F2']), topics: new Set(['vlsi']),
    followedEvents: [e('F1', 3), e('F2', 20, { abstract_deadline: d(5) })],
    open: [e('F1', 3), e('A', 10, { ranks: { core: 'B' } }), e('B', 5), e('C', 1), e('D', 30), e('X', 8, { flags: ['organizer_prefix'] }), e('Y', 9, { topics: ['ai-ml'] })],
    groupNews: [],
  });
  assert.deepEqual(w.followedSoon.map((x) => x.id), ['F1', 'F2']); // F2: özet son tarihi bu hafta
  assert.deepEqual(w.forYou.map((x) => x.id), ['A', 'B']); // dereceli önce; C çok yakın, D uzak, X dikkat, Y konu dışı, F1 takipte
});

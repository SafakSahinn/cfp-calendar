import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildItem, entryHash, type EventRow } from '../../supabase/functions/_shared/calendar.ts';
import { decrypt, encrypt } from '../../supabase/functions/_shared/crypto.ts';
import { merge } from '../src/merge.ts';
import { parseDateRange } from '../src/sources/ccf.ts';
import { parseListing } from '../src/sources/wikicfp.ts';
import { localToUtcIso, makeDedupeKey, parseShortDate, type NormalizedEvent } from '../src/types.ts';

test('ccf tarih aralıkları', () => {
  assert.deepEqual(parseDateRange('February 25 - March 4, 2025'), ['2025-02-25', '2025-03-04']);
  assert.deepEqual(parseDateRange('June 9 - 12, 2026'), ['2026-06-09', '2026-06-12']);
  assert.deepEqual(parseDateRange('Nov 6-10, 2026'), ['2026-11-06', '2026-11-10']);
  assert.deepEqual(parseDateRange('January 29-February 1, 2024'), ['2024-01-29', '2024-02-01']);
  assert.deepEqual(parseDateRange('September 30 - October 3, 2026'), ['2026-09-30', '2026-10-03']);
  assert.deepEqual(parseDateRange('April 4, 2025'), ['2025-04-04', '2025-04-04']);
  assert.deepEqual(parseDateRange('December 30 - January 2, 2027'), ['2026-12-30', '2027-01-02']);
  assert.equal(parseDateRange('TBD'), null);
});

test('saat dilimi dönüşümü', () => {
  // AoE 23:59:59 → ertesi gün 11:59:59 UTC
  assert.equal(localToUtcIso('2026-08-15 23:59:59', 'AoE'), '2026-08-16T11:59:59.000Z');
  assert.equal(localToUtcIso('2026-08-15 23:59:59', 'UTC-12'), '2026-08-16T11:59:59.000Z');
  assert.equal(localToUtcIso('2026-08-15 23:59:59', 'UTC+8'), '2026-08-15T15:59:59.000Z');
  assert.equal(localToUtcIso('2026-08-15 23:59:59', 'UTC'), '2026-08-15T23:59:59.000Z');
  assert.equal(localToUtcIso('2026-08-15 23:59:59', 'PT'), '2026-08-16T06:59:59.000Z');
});

test('kısa tarih + dedupe anahtarı', () => {
  assert.equal(parseShortDate('Oct 9, 2026 (Sep 1, 2026)'), '2026-10-09');
  assert.equal(parseShortDate('Sept 3, 2026'), '2026-09-03');
  assert.equal(makeDedupeKey('IEEE ICASSP 2027', 'x', 2027), 'ICASSP-2027');
  assert.equal(makeDedupeKey('ICASSP', 'x', 2027), 'ICASSP-2027');
  assert.equal(makeDedupeKey('Springer ICPSG', 'x', 2026), makeDedupeKey('ICPSG', 'y', 2026));
});

test('WikiCFP listeleme tablosu', () => {
  const html = readFileSync(new URL('./fixtures/wikicfp_ee.html', import.meta.url), 'utf8');
  const rows = parseListing(html);
  assert.equal(rows.length, 20);
  const first = rows[0];
  assert.equal(first.eventId, '195387');
  assert.equal(first.short, 'ICOECAI 2026');
  assert.match(first.title, /Electrical, Control, and Artificial Intelligence/);
  assert.equal(first.when, 'Oct 23, 2026 - Oct 25, 2026');
  assert.equal(first.where, 'Guangzhou, China');
  assert.equal(first.deadline, 'Oct 9, 2026');
});

test('kaynak birleştirme: ccf öncelikli, boşlukları wikicfp doldurur', () => {
  const base = {
    dedupe_key: 'X-2027', kind: 'conference', acronym: 'X', fields: ['cs'], ranks: {}, is_ieee: false,
    submission_open: null, abstract_deadline: null, deadlines: [], deadline_tz: 'AoE', notification_date: null,
    event_end: null,
  } as const;
  const [m] = merge([
    { ...base, source: 'wikicfp', source_id: '1', title: 'W', url: 'w', location: 'Ankara', topics: ['vlsi'], is_ieee: true,
      submission_deadline: '2027-01-01T11:59:59.000Z', event_start: '2027-05-01' } as unknown as NormalizedEvent,
    { ...base, source: 'ccf', source_id: 'x27', title: 'C', url: 'c', location: null, topics: ['ai-ml'],
      submission_deadline: null, event_start: null } as unknown as NormalizedEvent,
  ]);
  assert.equal(m.source, 'ccf');
  assert.equal(m.title, 'C');
  assert.equal(m.location, 'Ankara');
  assert.equal(m.submission_deadline, '2027-01-01T11:59:59.000Z');
  assert.deepEqual(m.source_ids, { ccf: 'x27', wikicfp: '1' });
  assert.deepEqual(m.topics.sort(), ['ai-ml', 'vlsi']);
  assert.equal(m.is_ieee, true);
});

test('token şifreleme gidiş-dönüş', async () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const packed = await encrypt('1//refresh-token', key);
  assert.notEqual(packed, '1//refresh-token');
  assert.equal(await decrypt(packed, key), '1//refresh-token');
});

test('takvim kaydı içeriği', () => {
  const e: EventRow = {
    id: 'e1', kind: 'conference', acronym: 'DAC', title: 'Design Automation Conference', url: 'https://dac.com',
    location: 'San Francisco', submission_open: null, first_seen_at: '2026-10-10T08:00:00Z',
    abstract_deadline: null, submission_deadline: '2026-11-16T11:59:59.000Z', deadline_tz: 'AoE', event_start: '2027-06-20', event_end: '2027-06-24',
  };
  const open = buildItem(e, 'submission_open', 'tr', 'https://x');
  assert.deepEqual(open.allDay, { start: '2026-10-10', endExclusive: '2026-10-11' });
  assert.match(open.summary, /Başvuru açıldı: DAC/);

  const dl = buildItem(e, 'deadline', 'en', 'https://x');
  assert.equal(dl.timed?.endIso, '2026-11-16T11:59:59.000Z');
  assert.deepEqual(dl.reminders, [10080, 1440]);

  const days = buildItem(e, 'event_days', 'tr', 'https://x');
  assert.deepEqual(days.allDay, { start: '2027-06-20', endExclusive: '2027-06-25' });
  assert.equal(entryHash(e, 'event_days'), 'days:2027-06-20:2027-06-24');

  // Kullanıcının seçtiği hatırlatma günleri (14/3) takvim kaydına ve özetine yansır; seçim değişince kayıt güncellenir
  assert.deepEqual(buildItem(e, 'deadline', 'tr', 'https://x', [3, 14]).reminders, [20160, 4320]);
  assert.deepEqual(buildItem(e, 'deadline', 'tr', 'https://x', []).reminders, []);
  assert.equal(entryHash(e, 'deadline', [3, 14]), 'dl:2026-11-16T11:59:59.000Z:r14,3');
  assert.notEqual(entryHash(e, 'deadline', [7]), entryHash(e, 'deadline', [7, 1]));
});

test('WikiCFP: resmi site bağlantısı ayrıştırılır, güvensiz bağlantı reddedilir', async () => {
  const { parseOfficialLink } = await import('../src/sources/wikicfp.ts');
  assert.equal(parseOfficialLink('<td>\n\tLink: <a href="https://aaiee.net" target="_newtab">https://aaiee.net</a>\n</td>'), 'https://aaiee.net');
  assert.equal(parseOfficialLink('Link: <a href="javascript:alert(1)">x</a>'), null);
  assert.equal(parseOfficialLink('Link: <a href="http://www.wikicfp.com/cfp/x">x</a>'), null);
  assert.equal(parseOfficialLink('<p>no link here</p>'), null);
});

test('seri anahtarı: kısaltmalı konferanslar seri olur, dergiler ve kısaltmasızlar olmaz', async () => {
  const { seriesKeyOf, makeDedupeKey } = await import('../src/types.ts');
  const conf = (acronym: string | null, title: string, year: number | null, kind: 'conference' | 'journal' = 'conference') =>
    seriesKeyOf({ kind, acronym, dedupe_key: makeDedupeKey(acronym, title, year) });
  assert.equal(conf('ICASSP', 'Int. Conf. on Acoustics', 2027), 'ICASSP');
  assert.equal(conf('IEEE ICC 2026', 'International Conference on Communications', 2026), 'ICC');
  assert.equal(conf('ISCAS', 'x', null), 'ISCAS');
  assert.equal(conf('TNNLS', 'IEEE Trans. Neural Networks', 2026, 'journal'), null);
  assert.equal(conf(null, 'Some Workshop on Things', 2026), null);
  assert.equal(conf('2026', 'x', 2026), null); // sadece yıl → anlamsız
  // Aynı serinin iki yılı aynı anahtara düşer
  assert.equal(conf('NeurIPS', 'a', 2026), conf('NeurIPS 2027', 'b', 2027));
});

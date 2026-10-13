import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TR_SERIES, type TrSeries } from '../../shared/turkiye.ts';
import { computeMaintenance } from '../src/maintenance.ts';
import { fetchTurkiye, turkiyeToEvent } from '../src/sources/turkiye.ts';
import { seriesKeyOf } from '../src/types.ts';

test('Türkiye serileri: anahtarlar benzersiz ve seri anahtarı biçimiyle uyumlu', () => {
  const keys = TR_SERIES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const s of TR_SERIES) {
    for (const e of s.editions) {
      const ev = turkiyeToEvent(s, e);
      assert.equal(seriesKeyOf(ev), s.key, `${s.key} ${e.year}`);
      assert.ok(e.eventStart <= e.eventEnd, `${s.key} ${e.year} tarih sırası`);
      if (e.deadline) assert.ok(e.deadline < e.eventStart, `${s.key} ${e.year} son başvuru etkinlikten önce`);
    }
  }
  assert.ok(fetchTurkiye().every((e) => e.source === 'turkiye' && e.kind === 'conference'));
});

test('Türkiye: son başvuru Türkiye saatiyle gün sonu; uzatılmış tarih iki tur olarak saklanır', () => {
  const s = TR_SERIES.find((x) => x.key === 'ELECO')!;
  const ev = turkiyeToEvent(s, s.editions[0]);
  assert.equal(ev.submission_deadline, '2026-10-02T20:59:59.000Z');
  assert.equal(ev.deadlines.length, 2);
  assert.equal(ev.dedupe_key, 'ELECO-2026');
});

test('bakım: gelecek edisyonu olmayan ve beklenen aya 4 aydan az kalan seri hatırlatılır', () => {
  const series: TrSeries[] = [
    { key: 'AAA', acronym: 'AAA', name: { tr: 'a', en: 'a' }, home: null, fields: ['cs'], topics: [], ieee: true, deadlineMonth: 3, eventMonth: 7,
      editions: [{ year: 2026, deadline: '2026-03-13', eventStart: '2026-07-07', eventEnd: '2026-07-10', location: 'x', url: 'x' }] },
    { key: 'BBB', acronym: 'BBB', name: { tr: 'b', en: 'b' }, home: null, fields: ['cs'], topics: [], ieee: true, deadlineMonth: 1, eventMonth: 5, editions: [] },
  ];
  const at = (iso: string) => computeMaintenance({ now: Date.parse(iso), sjr: null, knownPeriods: [], coreSource: null, trSeries: series }).find((i) => i.key === 'turkiye')!;
  const oct = at('2026-10-13T00:00:00Z');
  assert.equal(oct.level, 'todo');
  assert.match(oct.detail, /BBB 2027/);
  assert.doesNotMatch(oct.detail, /AAA/); // Mart 2027'ye 4 aydan fazla var
  const dec = at('2026-12-01T00:00:00Z');
  assert.match(dec.detail, /AAA 2027 \(son başvuru genelde Mart\)/);
  const withNext = at('2026-06-01T00:00:00Z'); // AAA'nın 2026 edisyonu henüz gerçekleşmedi; BBB için Ocak 2027 uzak
  assert.equal(withNext.level, 'ok');
});

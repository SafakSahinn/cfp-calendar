import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forYou, type ForYouEvent } from '../../web/src/lib/forYou.ts';

const NOW = Date.parse('2026-10-14T00:00:00Z');
const D = 86_400_000;
const ev = (id: string, o: Partial<ForYouEvent> = {}): ForYouEvent => ({
  id, kind: 'conference', acronym: id.toUpperCase(), topics: [], ranks: {}, is_ieee: false, flags: [], series_key: null,
  submission_deadline: new Date(NOW + 30 * D).toISOString(), first_seen_at: '2026-09-01T00:00:00Z', ...o,
});

test('Senin için: takip edilen seri > seçilen konu > benzer; kişisel bağ yoksa önerilmez', () => {
  const events = [
    ev('followed', { topics: ['signal', 'communications'] }),
    ev('icassp', { series_key: 'ICASSP', topics: ['ai-ml'] }),
    ev('topic', { topics: ['vlsi'] }),
    ev('similar', { topics: ['communications'] }),
    ev('unrelated', { topics: ['graphics'], ranks: { core: 'A*' } }),
  ];
  const r = forYou({ events, followed: new Set(['followed']), topics: new Set(['vlsi']), seriesFollowed: new Set(['ICASSP']), now: NOW });
  assert.deepEqual(r.map((x) => x.event.id), ['icassp', 'topic', 'similar']);
  assert.deepEqual(r[0].reasons[0], { kind: 'series', series: 'ICASSP' });
  assert.deepEqual(r[1].reasons[0], { kind: 'topic', topic: 'vlsi' });
  assert.deepEqual(r[2].reasons[0], { kind: 'similar' });
});

test('Senin için: takip edilenler, "dikkat" işaretliler ve 2 günden az kalanlar hariç; derece ve yenilik öne çıkarır', () => {
  const events = [
    ev('caution', { topics: ['vlsi'], flags: ['indexing_claims'] }),
    ev('late', { topics: ['vlsi'], submission_deadline: new Date(NOW + 1 * D).toISOString() }),
    ev('plain', { topics: ['vlsi'] }),
    ev('ranked', { topics: ['vlsi'], ranks: { core: 'A' }, first_seen_at: new Date(NOW - 2 * D).toISOString() }),
  ];
  const r = forYou({ events, followed: new Set(), topics: new Set(['vlsi']), seriesFollowed: new Set(), now: NOW });
  assert.deepEqual(r.map((x) => x.event.id), ['ranked', 'plain']);
  assert.deepEqual(r[0].reasons.map((x) => x.kind), ['topic', 'rank', 'new']);
  assert.equal(forYou({ events, followed: new Set(), topics: new Set(), seriesFollowed: new Set(), now: NOW }).length, 0);
});

test('Senin için: daha önce başvurulan serinin yeni yılı önerilir', () => {
  const r = forYou({ events: [ev('dac27', { series_key: 'DAC' })], followed: new Set(), topics: new Set(), seriesFollowed: new Set(), appliedSeries: new Set(['DAC']), now: NOW });
  assert.deepEqual(r[0].reasons[0], { kind: 'applied', series: 'DAC27' });
});

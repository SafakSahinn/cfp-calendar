import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_FILTERS, matchesFilters } from '../../shared/filters.ts';
import { savedSearchMatches, type SavedSearch } from '../src/savedSearches.ts';

const NOW = Date.parse('2026-10-14T00:00:00Z');
const D = 86_400_000;
const ev = (id: string, o: Record<string, unknown> = {}) => ({
  id, kind: 'journal', acronym: null, title: `Signal journal ${id}`, location: null, fields: ['ee'], topics: ['signal'],
  ranks: { sjr: 'Q1' }, is_ieee: true, flags: [], event_start: null,
  submission_deadline: new Date(NOW + 40 * D).toISOString(), first_seen_at: new Date(NOW - 1 * D).toISOString(), ...o,
});

test('ortak filtre: alan, tür, konu, Q1–Q2, Türkiye, arama metni', () => {
  const ctx = { now: NOW, followed: new Set<string>(), lang: 'tr' as const };
  const e = ev('a');
  assert.ok(matchesFilters(e, { ...EMPTY_FILTERS, field: 'ee', kind: 'journal', topic: 'signal', topQuartile: true }, ctx));
  assert.ok(!matchesFilters(e, { ...EMPTY_FILTERS, field: 'cs' }, ctx));
  assert.ok(!matchesFilters({ ...e, ranks: { sjr: 'Q3' } }, { ...EMPTY_FILTERS, topQuartile: true }, ctx));
  assert.ok(matchesFilters({ ...e, location: 'Ankara, Türkiye' }, { ...EMPTY_FILTERS, turkey: true }, ctx));
  assert.ok(matchesFilters(e, { ...EMPTY_FILTERS, q: 'SIGNAL' }, ctx));
  assert.ok(!matchesFilters({ ...e, flags: ['indexing_claims'] }, EMPTY_FILTERS, ctx)); // dikkat işaretliler gizli
});

test('kayıtlı arama: sadece kayıttan sonra çıkan, takip edilmeyen, bildirilmemiş çağrılar; en fazla 10', () => {
  const s: SavedSearch = { id: 's1', user_id: 'u', name: 'Q1 sinyal', filters: { topic: 'signal', topQuartile: true }, created_at: new Date(NOW - 3 * D).toISOString() };
  const events = [
    ev('old', { first_seen_at: new Date(NOW - 5 * D).toISOString() }), // aramadan önce görüldü
    ev('new'),
    ev('followed'),
    ev('notified'),
    ev('q3', { ranks: { sjr: 'Q3' } }),
    ev('soon', { submission_deadline: new Date(NOW + 1 * D).toISOString() }),
    ...Array.from({ length: 12 }, (_, i) => ev(`bulk${i}`)),
  ];
  const r = savedSearchMatches(s, events, { now: NOW, followed: new Set(['followed']), lang: 'tr', alreadyNotified: new Set(['notified']) });
  assert.equal(r.length, 10);
  const ids = r.map((x) => x.id);
  for (const bad of ['old', 'followed', 'notified', 'q3', 'soon']) assert.ok(!ids.includes(bad), bad);
});

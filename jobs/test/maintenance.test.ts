import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KNOWN_PERIODS } from '../../shared/tubitak.ts';
import { computeMaintenance } from '../src/maintenance.ts';

const at = (iso: string) => Date.parse(iso);
const base = { sjr: { year: '2025', count: 5135 }, knownPeriods: KNOWN_PERIODS, coreSource: 'live' as const };

test('Ekim 2026: SJR güncel, TÜBİTAK son dönem 60 gün içinde → uyarı', () => {
  const m = computeMaintenance({ ...base, now: at('2026-10-13T12:00:00Z') });
  assert.equal(m.find((i) => i.key === 'sjr')?.level, 'ok');
  assert.equal(m.find((i) => i.key === 'tubitak')?.level, 'warn');
  assert.equal(m.find((i) => i.key === 'core')?.level, 'ok');
});

test('Kasım 2026: TÜBİTAK 2027 takvimi eklenmeli', () => {
  const t = computeMaintenance({ ...base, now: at('2026-11-01T12:00:00Z') }).find((i) => i.key === 'tubitak')!;
  assert.equal(t.level, 'todo');
  assert.match(t.title, /2027/);
});

test('2025 listesi 2027 Haziranına kadar yeterli; sonra 2026 listesi istenir', () => {
  assert.equal(computeMaintenance({ ...base, now: at('2027-05-20T00:00:00Z') }).find((i) => i.key === 'sjr')?.level, 'ok');
  const s = computeMaintenance({ ...base, now: at('2027-06-02T00:00:00Z') }).find((i) => i.key === 'sjr')!;
  assert.equal(s.level, 'todo');
  assert.match(s.title, /2026/);
});

test('SJR verisi yoksa ve CORE yedekten geldiyse', () => {
  const m = computeMaintenance({ ...base, sjr: null, coreSource: 'snapshot', now: at('2026-10-13T00:00:00Z') });
  assert.equal(m.find((i) => i.key === 'sjr')?.level, 'todo');
  assert.equal(m.find((i) => i.key === 'core')?.level, 'warn');
});

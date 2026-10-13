import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allPeriods, fundingFor } from '../../shared/tubitak.ts';

const now = Date.parse('2026-10-13T10:00:00+03:00');
const conf = (event_start: string, location = 'Paris, France') => ({ kind: 'conference', event_start, location });
const abroad = { inTurkey: false, online: false, now };

test('Kasım 2026 etkinliği → 2026/3 dönemi (şu an açık, 27 Ekim kapanır)', () => {
  const f = fundingFor(conf('2026-11-20'), abroad)!;
  assert.equal(f.program, '2224-A');
  assert.equal(f.period.name, '2026/3');
  assert.equal(f.period.estimated, false);
  assert.equal(f.openNow, true);
  assert.equal(f.missed, false);
});

test('etkinlik kapanıştan önce başlıyorsa önceki dönem → kaçırılmış', () => {
  const f = fundingFor(conf('2026-10-20'), abroad)!; // 27 Ekim kapanışından ÖNCE başlıyor
  assert.equal(f.period.name, '2026/2');
  assert.equal(f.missed, true);
});

test('Haziran 2027 etkinliği → 2027/1 (tahmini, Şubat 2027)', () => {
  const f = fundingFor(conf('2027-06-06'), abroad)!;
  assert.equal(f.period.name, '2027/1');
  assert.equal(f.period.estimated, true);
  assert.equal(f.openNow, false);
  assert.equal(f.missed, false);
  assert.match(f.period.close, /^2027-02-24/);
});

test('Türkiye\'deki etkinlik → 2224-B; dergi / tarihsiz / çevrim içi → yok', () => {
  assert.equal(fundingFor(conf('2026-12-01', 'Ankara, Türkiye'), { ...abroad, inTurkey: true })!.program, '2224-B');
  assert.equal(fundingFor({ kind: 'journal', event_start: null, location: null }, abroad), null);
  assert.equal(fundingFor({ kind: 'conference', event_start: null, location: null }, abroad), null);
  assert.equal(fundingFor(conf('2026-12-01', 'Virtual'), { ...abroad, online: true }), null);
});

test('tahmini dönemler sıralı ve 2 yıl ileriye uzanır', () => {
  const ps = allPeriods();
  assert.ok(ps.some((p) => p.name === '2028/3'));
  assert.deepEqual([...ps].sort((a, b) => a.close.localeCompare(b.close)), ps);
});

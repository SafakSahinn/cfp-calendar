import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flagBulkClusters } from '../src/quality.ts';

const conf = (o: Record<string, unknown> = {}) => ({
  kind: 'conference', ranks: {} as Record<string, string>, flags: [] as string[], location: 'Virtual Conference',
  submission_deadline: '2026-10-13T11:59:59.000Z', event_start: '2026-12-29', event_end: '2026-12-30', ...o,
});

test('toplu konferans kümesi: aynı gün + yer + son başvuru paylaşan ≥4 konferans işaretlenir', () => {
  const cluster = [conf(), conf(), conf({ location: ' virtual  conference ' }), conf()];
  const others = [
    conf({ event_start: '2026-12-01', event_end: '2026-12-02' }), // farklı tarih
    conf({ ranks: { core: 'A' } }), // dereceli: muaf
    conf({ kind: 'workshop' }), // ortak çalıştay: muaf
  ];
  assert.equal(flagBulkClusters([...cluster, ...others]), 4);
  assert.ok(cluster.every((e) => e.flags.includes('bulk_cluster')));
  assert.ok(others.every((e) => !e.flags.includes('bulk_cluster')));
});

test('toplu konferans kümesi: 3 konferans eşik altında; tekrar çalıştırmak işareti çoğaltmaz', () => {
  const three = [conf(), conf(), conf()];
  assert.equal(flagBulkClusters(three), 0);
  const four = [conf(), conf(), conf(), conf()];
  flagBulkClusters(four);
  flagBulkClusters(four);
  assert.deepEqual(four[0].flags, ['bulk_cluster']);
});

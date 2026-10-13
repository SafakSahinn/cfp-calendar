import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildIndex, matchCore, parseCore, parseCsvLine } from '../src/core.ts';

const idx = buildIndex(parseCore(readFileSync(new URL('../data/core-icore2026.csv', import.meta.url), 'utf8')));

test('CSV: tırnaklı alanlar', () => {
  assert.deepEqual(parseCsvLine('1,"A, B (prev ""X"")",AB,ICORE2026,A*'), ['1', 'A, B (prev "X")', 'AB', 'ICORE2026', 'A*']);
});

test('snapshot: yalnızca A*/A/B/C', () => {
  const all = [...idx.values()].flat();
  assert.ok(all.length > 600);
  assert.ok(all.every((e) => ['A*', 'A', 'B', 'C'].includes(e.rank)));
});

test('gerçek konferans: kısaltma + benzer başlık eşleşir', () => {
  assert.equal(matchCore(idx, 'HPCA', 'IEEE International Symposium on High-Performance Computer Architecture')?.rank, 'A*');
  assert.equal(matchCore(idx, 'COLING 2026', '32nd International Conference on Computational Linguistics')?.rank, 'B');
  assert.equal(matchCore(idx, 'ACL', 'Annual Meeting of the Association for Computational Linguistics')?.rank, 'A*');
  assert.equal(matchCore(idx, 'IEEE ACL', 'Association for Computational Linguistics 2027')?.rank, 'A*');
});

test('taklit: aynı kısaltma, farklı başlık → eşleşmez', () => {
  assert.equal(matchCore(idx, 'AAAI', 'Intelligence'), null); // tek ortak kelime yetmez
  // Canlı veride görülen taklit: ünlü ICDM (Data Mining, A*) kısaltmasını kullanan başka bir konferans
  assert.equal(matchCore(idx, 'ICDM', 'IEEE 2026 3rd International Conference on Intelligent Computing and Data Mining'), null);
  assert.equal(matchCore(idx, 'ACL', 'International Conference on Advanced Computing and Logistics'), null);
  assert.equal(matchCore(idx, 'CCS', 'International Conference on Cloud Computing and Services'), null);
});

test('kısaltma yoksa veya listede yoksa null', () => {
  assert.equal(matchCore(idx, null, 'Association for Computational Linguistics'), null);
  assert.equal(matchCore(idx, 'ZZZQ', 'Association for Computational Linguistics'), null);
});

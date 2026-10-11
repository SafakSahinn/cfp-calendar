import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCaution, qualityFlags } from '../src/quality.ts';

const ev = (acronym: string | null, title: string, kind: 'conference' | 'journal' = 'conference', ranks = {}) =>
  qualityFlags({ acronym, title, kind, ranks });

test('indeks vaadi işaretlenir', () => {
  assert.deepEqual(ev('IJCNC', 'International Journal of Computer Networks & Communications - Scopus, ERA Indexed, H Index - 40', 'journal'),
    ['indexing_claims', 'generic_journal']);
  assert.deepEqual(ev('GRRRHC', 'Scopus Web Of Sci Indexed Publication Global Rock Art Research And Heritage Conference'), ['indexing_claims']);
});

test('organizatör öneki ("IEEE--2027 …") işaretlenir', () => {
  assert.deepEqual(ev('CEEPE', 'IEEE--2027 the 10th International Conference on Energy, Electrical and Power Engineering (CEEPE 2027)'), ['organizer_prefix']);
  assert.deepEqual(ev('AIES', 'Springer--2026 International Conference on Artificial Intelligence and Education Systems (AIES 2026)'), ['organizer_prefix']);
  assert.deepEqual(ev('ACM--Singapore-CDICS', '2026 4th International Conference on Data, Information and Computing Science (CDICS 2026)'), ['organizer_prefix']);
});

test('"--EI" tekrar listelemesi işaretlenir', () => {
  assert.deepEqual(ev('APCT--EI', '2027 6th Asia-Pacific Computer Technologies Conference (APCT 2027)'), ['ei_duplicate']);
});

test('gerçek IEEE / ACM konferansları işaretlenmez', () => {
  assert.deepEqual(ev('DFTS', 'IEEE International Symposium on Defect and Fault Tolerance in VLSI and Nanotechnology Systems'), []);
  assert.deepEqual(ev('ICCD', 'IEEE International Conference on Computer Design'), []);
  assert.deepEqual(ev('IEEE APET', '2026 IEEE 5th Asia Power and Electrical Technology Conference (APET 2026)'), []);
  assert.deepEqual(ev('COOL Chips', 'IEEE Symposium on Low-Power and High-Speed Chips and Systems'), []);
  assert.deepEqual(ev('IEEE TDSC Journal SI', 'IEEE TDSC Special Issue on Data-Driven Dependability and Security', 'journal'), []);
});

test('dereceli konferans asla işaretlenmez', () => {
  assert.deepEqual(ev('X--EI', 'Scopus indexed IEEE--2027 conference', 'conference', { core: 'A' }), []);
});

test('isCaution', () => {
  assert.equal(isCaution(['organizer_prefix']), true);
  assert.equal(isCaution([]), false);
});

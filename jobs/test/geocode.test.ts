import assert from 'node:assert/strict';
import { test } from 'node:test';
import { geoQuery } from '../src/geoQuery.ts';

test('konum sorgusu: şehirler normalize edilir, çevrim içi/belirsiz yerler atlanır', () => {
  assert.equal(geoQuery('Bordeaux, France'), 'bordeaux, france');
  assert.equal(geoQuery('  Istanbul ,Turkey '), 'istanbul, turkey');
  assert.equal(geoQuery('Vienna, Austria (Hybrid)'), 'vienna, austria');
  assert.equal(geoQuery('Online'), null);
  assert.equal(geoQuery('Virtual'), null);
  assert.equal(geoQuery('TBD'), null);
  assert.equal(geoQuery('N/A'), null);
  assert.equal(geoQuery(null), null);
  assert.equal(geoQuery('Seoul, Korea / Online'), 'seoul, korea');
});

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

test('ülke tanıma: yer metni ve OSM görünen adından ISO kodu; eyalet/belirsizlerde null', async () => {
  const { countryCodeOf } = await import('../src/geoQuery.ts');
  assert.equal(countryCodeOf('Bordeaux, France'), 'FR');
  assert.equal(countryCodeOf('cambridge, uk'), 'GB');
  assert.equal(countryCodeOf('Seoul, Republic of Korea'), 'KR');
  assert.equal(countryCodeOf('İstanbul, Türkiye'), 'TR');
  assert.equal(countryCodeOf('Ho Chi Minh City, Viet Nam'), 'VN');
  assert.equal(countryCodeOf('Paris, Texas, USA'), 'US');
  assert.equal(countryCodeOf('Cambridge, Massachusetts, United States'), 'US');
  assert.equal(countryCodeOf('Boston, MA'), null);
  assert.equal(countryCodeOf('Atlanta, Georgia'), null); // eyalet, ülke değil
  assert.equal(countryCodeOf('Virtual Conference'), null);
  // OSM görünen adının son parçası
  assert.equal(countryCodeOf('Cambridge, Middlesex County, Massachusetts, United States'.split(',').at(-1)), 'US');
});

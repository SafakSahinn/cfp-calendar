import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSjrIndex, matchJournal, parseSjrCsv } from '../src/sjr.ts';

// SCImago dışa aktarımının biçimi: ';' ayraç, tırnaklı alanlar, ondalık virgül, "Areas" sütunu
const CSV = [
  'Rank;Sourceid;Title;Type;Issn;SJR;SJR Best Quartile;H index;Country;Publisher;Categories;Areas',
  '1;1;"IEEE Journal on Selected Areas in Communications";journal;"07338716, 15580008";"7,123";Q1;300;United States;IEEE;"Computer Networks and Communications (Q1)";"Computer Science; Engineering"',
  '2;2;"IEEE Network";journal;"08908044";"3,1";Q1;150;United States;IEEE;"Computer Networks (Q1)";"Computer Science"',
  '3;3;"IEEE Transactions on Industrial Informatics";journal;"15513203";"4,5";Q1;200;United States;IEEE;"Control (Q1)";"Engineering"',
  '4;4;"Some Medicine Journal";journal;"12345678";"2,0";Q1;100;UK;X;"Medicine (Q1)";"Medicine"',
  '5;5;"Some Proceedings";conference and proceedings;"";"0,3";-;10;US;X;"x";"Engineering"',
  '6;6;"Electronics";journal;"20799292";"0,6";Q2;100;Switzerland;MDPI;"Electrical and Electronic Engineering (Q2)";"Engineering"',
].join('\n');

test('SJR CSV: yalnızca mühendislik/BB dergileri, ondalık virgül, ISSN listesi', () => {
  const j = parseSjrCsv(CSV);
  assert.deepEqual(j.map((x) => x.title), ['IEEE Journal on Selected Areas in Communications', 'IEEE Network', 'IEEE Transactions on Industrial Informatics', 'Electronics']);
  assert.equal(j[0].sjr, 7.123);
  assert.deepEqual(j[0].issn, ['07338716', '15580008']);
});

test('dergi eşleştirme: özel sayı başlığından, tam adla; genel adlar yanlış eşleşmez', () => {
  const idx = buildSjrIndex(parseSjrCsv(CSV));
  assert.equal(matchJournal(idx, 'IEEE Network')?.quartile, 'Q1');
  assert.equal(matchJournal(idx, 'IEEE Transactions on Industrial Informatics Special Section on Electric Vehicles')?.title, 'IEEE Transactions on Industrial Informatics');
  assert.equal(matchJournal(idx, 'IEEE Journal on Selected Areas in Communications: Special Issue on 6G')?.quartile, 'Q1');
  assert.equal(matchJournal(idx, 'Advances in Power Electronics conference'), null); // "Electronics" tek kelime → içerme ile eşleşmez
  assert.equal(matchJournal(idx, 'Call for papers: International Journal of Something'), null);
});

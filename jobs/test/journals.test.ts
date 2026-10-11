import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { comsocToEvent, parseComsoc } from '../src/sources/comsoc.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('ComSoc: CfP tablosu ayrıştırılır, kapalı çağrılar elenir', () => {
  const rows = parseComsoc(fixture('comsoc_network.html'));
  assert.ok(rows.length > 10, `satır: ${rows.length}`);
  const open = rows.filter((r) => r.deadline);
  assert.ok(open.length >= 1);
  for (const r of rows) {
    assert.match(r.url, /^https:\/\/www\.comsoc\.org\/publications\/magazines\/ieee-network\/cfp\//);
    assert.ok(r.title.length > 5);
    if (r.deadline) assert.match(r.deadline, /^\d{4}-\d{2}-\d{2}$/);
  }
  const ev = comsocToEvent(open[0], 'IEEE Network')!;
  assert.equal(ev.kind, 'journal');
  assert.equal(ev.is_ieee, true);
  assert.equal(ev.acronym, 'IEEE Network');
  assert.match(ev.title, /^IEEE Network: Special Issue on /);
  assert.ok(ev.topics.includes('communications'));
  assert.match(ev.submission_deadline!, /T11:59:59\.000Z$/); // AoE gün sonu
  assert.equal(comsocToEvent({ ...open[0], deadline: null }, 'IEEE Network'), null);
});

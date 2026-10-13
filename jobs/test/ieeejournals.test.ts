import assert from 'node:assert/strict';
import { test } from 'node:test';
import { journalCallToEvent, parseIeeeCs, parseJbhi, parseLooseDate, parseSensors, titleSlug } from '../src/sources/ieeejournals.ts';

test('serbest tarih biçimleri', () => {
  assert.equal(parseLooseDate('10 November 2026'), '2026-11-10');
  assert.equal(parseLooseDate('November 10, 2026'), '2026-11-10');
  assert.equal(parseLooseDate('Sept. 3 2027'), '2027-09-03');
  assert.equal(parseLooseDate('1st February 2027'), '2027-02-01');
  assert.equal(parseLooseDate('TBD'), null);
});

// Computer Society sayfasındaki Next.js akış verisinin (kaçışlı JSON) kısaltılmış hâli
const card = (kind: string, pub: string, href: string, title: string, due: string) =>
  `[\\"$\\",\\"div\\",null,{\\"aria-label\\":\\"Call For Paper Card\\",\\"id\\":\\"cfp-card\\",\\"children\\":[[\\"$\\",\\"p\\",null,{\\"className\\":\\"style-p-sm\\",\\"children\\":[\\" \\",\\"${kind}\\",\\" \\",\\"- ${pub}\\",\\" \\"]}],` +
  `[\\"$\\",\\"div\\",null,{\\"children\\":[\\"$\\",\\"$L1f\\",null,{\\"href\\":\\"${href}\\",\\"className\\":\\"not-prose\\",\\"prefetch\\":true,\\"children\\":\\"${title}\\"}]}],` +
  `[\\"$\\",\\"p\\",null,{\\"className\\":\\"style-p-sm\\",\\"children\\":[\\" \\",\\"Submissions Due: \\",\\"${due}\\"]}]]}]`;

test('IEEE Computer Society: kartlar ayrıştırılır, TBD tarihsiz, tekrarlar atılır', () => {
  const html = `<script>self.__next_f.push([1,"${[
    card('Magazine', 'IEEE Internet Computing', '/digital-library/magazines/ic/cfp-drone-computing', 'Call For Papers: Special Issue on Drone Computing', '10 November 2026'),
    card('Journal', 'IEEE Transactions on Dependable and Secure Computing', '/digital-library/journals/tq/cfp-agents', 'Call for Papers: Special Issue on Autonomous AI Agents in Computer Security', 'TBD'),
    card('Magazine', 'IEEE Software', '/digital-library/magazines/so/cfp-cities', 'CFP: Special Issue on Smart \\u0026 Sustainable Cities', 'January 7, 2027'),
    card('Magazine', 'IEEE Internet Computing', '/digital-library/magazines/ic/cfp-drone-computing', 'Call For Papers: Special Issue on Drone Computing', '10 November 2026'),
  ].join(',')}"])</script>`;
  const rows = parseIeeeCs(html);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    journal: 'IEEE Internet Computing',
    title: 'Special Issue on Drone Computing',
    url: 'https://www.computer.org/digital-library/magazines/ic/cfp-drone-computing',
    deadline: '2026-11-10',
  });
  assert.equal(rows[1].deadline, null);
  assert.equal(rows[2].title, 'Special Issue on Smart & Sustainable Cities');
  assert.equal(rows[2].deadline, '2027-01-07');
});

test('IEEE Sensors Journal: başlık + "Submission closes on"', () => {
  const html = `<div><a href="https://ieee-sensors.org/x.pdf"><div><span>Special Issue on Smart Sensing for Transportation Systems</span></div></a>
    <div><div><span>Submission closes on 31 May 2027</span></div></div><div><span>A. Editor</span></div></div>
    <div><a href="/sensors-journal/">Sensors Journal Special Issues</a></div>`;
  assert.deepEqual(parseSensors(html), [
    { journal: 'IEEE Sensors Journal', title: 'Special Issue on Smart Sensing for Transportation Systems', url: 'https://ieee-sensors.org/x.pdf', deadline: '2027-05-31' },
  ]);
});

test('IEEE JBHI: kalın başlık + "Submission Deadline"', () => {
  const html = `<p><a href="https://www.embs.org/jbhi/a.pdf"><strong>AI-Driven Multimodal Intelligence for Healthcare</strong></a><br /> <strong>Submission Deadline: 31 October 2026</strong></p>
    <p>This special issue seeks …</p>`;
  const rows = parseJbhi(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Special Issue on AI-Driven Multimodal Intelligence for Healthcare');
  assert.equal(rows[0].deadline, '2026-10-31');
});

test('dergi çağrısı → etkinlik: kararlı anahtar, kısaltma, alan', () => {
  const ev = journalCallToEvent(
    { journal: 'IEEE Transactions on Computers', title: 'Special Issue on Chiplet Processor Design', url: 'https://www.computer.org/x', deadline: '2027-01-15' },
    'IEEECS', [], 'cs',
  )!;
  assert.equal(ev.dedupe_key, 'IEEECS-CHIPLET-PROCESSOR-DESIGN');
  assert.equal(ev.acronym, 'IEEE TC');
  assert.equal(ev.kind, 'journal');
  assert.ok(ev.fields.includes('cs'));
  assert.ok(ev.topics.includes('architecture'));
  assert.equal(ev.title, 'IEEE Transactions on Computers: Special Issue on Chiplet Processor Design');
  assert.equal(journalCallToEvent({ journal: 'x', title: 'y', url: 'z', deadline: null }, 'P', [], 'cs'), null);
  assert.equal(titleSlug('Special Issue based on Papers from IEEE FLEPS 2021'), 'PAPERS-FROM-IEEE-FLEPS-2021');
});

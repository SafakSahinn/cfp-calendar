// IEEE dergi/magazin özel sayı çağrıları (ComSoc dışındaki topluluklar):
//  - IEEE Computer Society: tek sayfada tüm dergi ve magazinlerin çağrı kartları (Next.js akış verisi içinde)
//  - IEEE Sensors Council: IEEE Sensors Journal özel sayı tablosu ("Submission closes on …")
//  - IEEE EMBS: IEEE JBHI özel sayıları ("Submission Deadline: …")
// Sayfa yapıları 2026-10'da doğrulandı; biri bozulursa diğerleri etkilenmez.

import * as cheerio from 'cheerio';
import { localToUtcIso, monthNum, tagTopics, ymd, type NormalizedEvent } from '../types.ts';

const UA = 'Mozilla/5.0 (compatible; CFP-Calendar/1.0; +https://github.com/SafakSahinn/cfp-calendar)';

export const IEEECS_URL = 'https://www.computer.org/publications/author-resources/calls-for-papers';
export const SENSORS_URL = 'https://ieee-sensors.org/sensors-journal-special-issues/';
export const JBHI_URL = 'https://www.embs.org/jbhi/special-issues/';

export interface JournalCall {
  journal: string;
  title: string; // "Special Issue on …"
  url: string;
  deadline: string | null; // YYYY-MM-DD
}

/** "10 November 2026", "November 10, 2026", "Nov. 10 2026" → "2026-11-10"; "TBD" → null */
export function parseLooseDate(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  let m = t.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m && monthNum(m[2])) return ymd(+m[3], monthNum(m[2])!, +m[1]);
  m = t.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m && monthNum(m[1])) return ymd(+m[3], monthNum(m[1])!, +m[2]);
  return null;
}

const clean = (s: string) =>
  s.replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8211;|&ndash;/g, '–').replace(/\s+/g, ' ').trim();

/** Computer Society: her kart "Journal/Magazine - <yayın>", bağlantı + "Call For Papers: …" başlığı, "Submissions Due: <tarih>". */
export function parseIeeeCs(html: string): JournalCall[] {
  const flat = html.replace(/\\"/g, '"');
  const out: JournalCall[] = [];
  const seen = new Set<string>();
  for (const card of flat.split('"aria-label":"Call For Paper Card"').slice(1)) {
    const pub = card.match(/"children":\[" ","(?:Journal|Magazine)"," ","- ([^"]+)"," "\]/);
    const link = card.match(/"href":"(\/[^"]+)"[^{}]*?"children":"(?:Call [Ff]or [Pp]apers?:?\s*)?([^"]+)"/);
    const due = card.match(/"Submissions? Due:? ","([^"]+)"/i);
    if (!pub || !link) continue;
    const url = `https://www.computer.org${link[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ journal: clean(pub[1]), title: clean(link[2]).replace(/^(?:CFP|Call for Papers)\s*:\s*/i, ''), url, deadline: due ? parseLooseDate(due[1]) : null });
  }
  return out;
}

/** Sensors Journal: her satır PDF bağlantılı başlık + "Submission closes on <tarih>". */
export function parseSensors(html: string): JournalCall[] {
  const $ = cheerio.load(html);
  const out: JournalCall[] = [];
  $('a').each((_, a) => {
    const title = clean($(a).text());
    if (!/^Special Issue on/i.test(title)) return;
    const href = $(a).attr('href');
    const cell = $(a).nextAll().text();
    const m = cell.match(/Submission closes on\s+([^\n]{6,40}?\d{4})/i);
    if (!href || !m) return;
    out.push({ journal: 'IEEE Sensors Journal', title, url: href, deadline: parseLooseDate(m[1]) });
  });
  return out;
}

/** JBHI: <p><a><strong>Başlık</strong></a><br><strong>Submission Deadline: <tarih></strong></p> */
export function parseJbhi(html: string): JournalCall[] {
  const $ = cheerio.load(html);
  const out: JournalCall[] = [];
  $('p').each((_, p) => {
    const text = $(p).text();
    const m = text.match(/Submission Deadline:\s*([^\n]+?\d{4})/i);
    const a = $(p).find('a').first();
    const title = clean(a.text());
    if (!m || !title || !a.attr('href')) return;
    out.push({ journal: 'IEEE Journal of Biomedical and Health Informatics', title: /^special issue/i.test(title) ? title : `Special Issue on ${title}`, url: a.attr('href')!, deadline: parseLooseDate(m[1]) });
  });
  return out;
}

const ACRONYMS: Record<string, string> = {
  'IEEE Transactions on Pattern Analysis and Machine Intelligence': 'IEEE TPAMI',
  'IEEE Transactions on Computers': 'IEEE TC',
  'IEEE Transactions on Dependable and Secure Computing': 'IEEE TDSC',
  'IEEE Transactions on Software Engineering': 'IEEE TSE',
  'IEEE Transactions on Parallel and Distributed Systems': 'IEEE TPDS',
  'IEEE Transactions on Knowledge and Data Engineering': 'IEEE TKDE',
  'IEEE Transactions on Mobile Computing': 'IEEE TMC',
  'IEEE Transactions on Visualization and Computer Graphics': 'IEEE TVCG',
  'IEEE Transactions on Cloud Computing': 'IEEE TCC',
  'IEEE Transactions on Big Data': 'IEEE TBD',
  'IEEE Transactions on Affective Computing': 'IEEE TAFFC',
  'IEEE Transactions on Services Computing': 'IEEE TSC',
  'IEEE Transactions on Emerging Topics in Computing': 'IEEE TETC',
  'IEEE Transactions on Sustainable Computing': 'IEEE TSUSC',
  'IEEE Transactions on Learning Technologies': 'IEEE TLT',
  'IEEE Transactions on Quantum Engineering': 'IEEE TQE',
  'IEEE Transactions on Artificial Intelligence': 'IEEE TAI',
  'IEEE Journal of Biomedical and Health Informatics': 'IEEE JBHI',
  'IEEE Sensors Journal': 'IEEE Sensors J.',
};

/** Başlıktan kararlı anahtar (PDF adları "call-for-papers.pdf" gibi genel olabildiği için adres kullanılmaz). */
export function titleSlug(title: string): string {
  return title.toUpperCase().replace(/^SPECIAL (ISSUE|SECTION) (ON|BASED ON)\s+/, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export function journalCallToEvent(c: JournalCall, prefix: string, baseTopics: string[], field: 'cs' | 'ee'): NormalizedEvent | null {
  if (!c.deadline) return null;
  const deadline = localToUtcIso(`${c.deadline} 23:59:59`, 'AoE');
  const tagged = tagTopics(`${c.title} ${c.journal}`, baseTopics);
  const slug = titleSlug(c.title);
  return {
    source: 'ieee',
    source_id: c.url,
    dedupe_key: `${prefix}-${slug}`,
    kind: 'journal',
    acronym: ACRONYMS[c.journal] ?? null,
    title: `${c.journal}: ${c.title}`,
    url: c.url,
    location: null,
    fields: tagged.fields.includes(field) ? tagged.fields : [field, ...tagged.fields],
    topics: tagged.topics,
    ranks: {},
    is_ieee: true,
    submission_open: null,
    abstract_deadline: null,
    submission_deadline: deadline,
    deadlines: deadline ? [{ deadline }] : [],
    deadline_tz: 'AoE',
    notification_date: null,
    event_start: null,
    event_end: null,
  };
}

export async function fetchIeeeJournals(log: (msg: string) => void = console.log): Promise<NormalizedEvent[]> {
  const sources: [string, string, (h: string) => JournalCall[], string, string[], 'cs' | 'ee'][] = [
    ['Computer Society', IEEECS_URL, parseIeeeCs, 'IEEECS', [], 'cs'],
    ['Sensors Journal', SENSORS_URL, parseSensors, 'IEEESENS', ['electronics'], 'ee'],
    ['JBHI', JBHI_URL, parseJbhi, 'IEEEJBHI', ['biomedical'], 'ee'],
  ];
  const now = Date.now();
  const out: NormalizedEvent[] = [];
  for (const [name, url, parse, prefix, topics, field] of sources) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(String(res.status));
      const calls = parse(await res.text());
      let n = 0;
      for (const c of calls) {
        const ev = journalCallToEvent(c, prefix, topics, field);
        if (ev && new Date(ev.submission_deadline!).getTime() > now) {
          out.push(ev);
          n++;
        }
      }
      log(`  IEEE ${name}: ${calls.length} çağrı, ${n} açık`);
      if (calls.length === 0) log(`  UYARI: IEEE ${name} sayfa yapısı değişmiş olabilir (0 çağrı)`);
    } catch (e) {
      log(`  IEEE ${name}: ${e}`);
    }
  }
  return out;
}

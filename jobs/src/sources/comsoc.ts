// IEEE Communications Society: dergi ve magazinlerin özel sayı çağrıları (CfP tabloları).
// Her sayfa Drupal tablosu: başlık bağlantısı + yayın tarihi + <time datetime> ile son başvuru (kapalıysa "Closed").

import * as cheerio from 'cheerio';
import { localToUtcIso, tagTopics, type NormalizedEvent } from '../types.ts';

const BASE = 'https://www.comsoc.org';

/** Yol → dergi adı (sayfalar 2026-10'da doğrulandı; 404 verenler — TCOM, TWC, IoTJ, COMST — CfP sayfası yayınlamıyor). */
export const COMSOC_PAGES: Record<string, string> = {
  'journals/ieee-jsac': 'IEEE Journal on Selected Areas in Communications',
  'journals/ieee-tnsm': 'IEEE Transactions on Network and Service Management',
  'journals/ieee-tccn': 'IEEE Transactions on Cognitive Communications and Networking',
  'journals/ieee-tgcn': 'IEEE Transactions on Green Communications and Networking',
  'journals/ieee-ojcoms': 'IEEE Open Journal of the Communications Society',
  'magazines/ieee-communications-magazine': 'IEEE Communications Magazine',
  'magazines/ieee-network': 'IEEE Network',
  'magazines/ieee-wireless-communications': 'IEEE Wireless Communications',
  'magazines/ieee-internet-things-magazine': 'IEEE Internet of Things Magazine',
  'magazines/ieee-communications-standards-magazine': 'IEEE Communications Standards Magazine',
};

const UA = 'Mozilla/5.0 (compatible; CFP-Calendar/1.0; +https://github.com/SafakSahinn/cfp-calendar)';

export interface ComsocRow {
  title: string;
  url: string;
  publication: string;
  deadline: string | null; // YYYY-MM-DD
}

export function parseComsoc(html: string): ComsocRow[] {
  const $ = cheerio.load(html);
  const rows: ComsocRow[] = [];
  $('tr.table__row').each((_, tr) => {
    const link = $(tr).find('td.views-field-title a').first();
    const title = link.text().replace(/\s+/g, ' ').trim();
    const href = link.attr('href');
    if (!title || !href) return;
    const deadlineCell = $(tr).find('td[class*="manuscript-submission-date"]');
    const dt = deadlineCell.find('time').attr('datetime');
    rows.push({
      title,
      url: href.startsWith('http') ? href : `${BASE}${href}`,
      publication: $(tr).find('td[class*="conditional-field"]').text().replace(/\s+/g, ' ').trim(),
      deadline: dt ? dt.slice(0, 10) : null,
    });
  });
  return rows;
}

export function comsocToEvent(row: ComsocRow, journal: string): NormalizedEvent | null {
  if (!row.deadline) return null; // "Closed"
  const deadline = localToUtcIso(`${row.deadline} 23:59:59`, 'AoE');
  const slug = row.url.replace(/\/+$/, '').split('/').pop() ?? row.title;
  const tagged = tagTopics(`${row.title} ${journal}`, ['communications']);
  return {
    source: 'comsoc',
    source_id: slug,
    dedupe_key: `COMSOC-${slug}`.toUpperCase(),
    kind: 'journal',
    acronym: journalAcronym(journal),
    title: `${journal}: Special Issue on ${row.title}`,
    url: row.url,
    location: null,
    fields: tagged.fields.includes('ee') ? tagged.fields : ['ee', ...tagged.fields],
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

/** "IEEE Journal on Selected Areas in Communications" → "IEEE JSAC" */
export function journalAcronym(name: string): string {
  const known: Record<string, string> = {
    'IEEE Journal on Selected Areas in Communications': 'IEEE JSAC',
    'IEEE Transactions on Network and Service Management': 'IEEE TNSM',
    'IEEE Transactions on Cognitive Communications and Networking': 'IEEE TCCN',
    'IEEE Transactions on Green Communications and Networking': 'IEEE TGCN',
    'IEEE Open Journal of the Communications Society': 'IEEE OJ-COMS',
    'IEEE Communications Standards Magazine': 'IEEE ComStd',
    'IEEE Internet of Things Magazine': 'IEEE IoT Mag.',
    'IEEE Wireless Communications': 'IEEE Wireless Commun.',
    'IEEE Communications Magazine': 'IEEE ComMag',
  };
  return known[name] ?? name;
}

export async function fetchComsoc(log: (msg: string) => void = console.log): Promise<NormalizedEvent[]> {
  const out: NormalizedEvent[] = [];
  const now = Date.now();
  for (const [path, journal] of Object.entries(COMSOC_PAGES)) {
    try {
      const res = await fetch(`${BASE}/publications/${path}/cfp`, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(String(res.status));
      for (const row of parseComsoc(await res.text())) {
        const ev = comsocToEvent(row, journal);
        if (ev && new Date(ev.submission_deadline!).getTime() > now) out.push(ev);
      }
    } catch (e) {
      log(`  comsoc ${path}: ${e}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return out;
}

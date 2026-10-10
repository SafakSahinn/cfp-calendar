// WikiCFP (http://www.wikicfp.com): kategori sayfalarından konferans ve dergi (özel sayı) çağrıları.
// Resmi API yok; kategori listeleme tablosu ayrıştırılır. Sunucuyu yormamak için istekler arası bekleme var.

import * as cheerio from 'cheerio';
import { localToUtcIso, makeDedupeKey, parseShortDate, tagTopics, type NormalizedEvent } from '../types.ts';

// WikiCFP kategorisi → bizim konu kimliklerimiz
const CATEGORIES: Record<string, string[]> = {
  // Elektrik-elektronik
  'electrical engineering': ['electronics'],
  'electronics': ['electronics'],
  'power electronics': ['power-electronics'],
  'power systems': ['power'],
  'energy': ['power'],
  'signal processing': ['signal'],
  'communications': ['communications'],
  'wireless': ['communications'],
  'vlsi': ['vlsi'],
  'circuits': ['vlsi'],
  'embedded systems': ['embedded'],
  'internet of things': ['embedded'],
  'control': ['control'],
  'robotics': ['robotics'],
  'photonics': ['photonics'],
  'biomedical engineering': ['biomedical'],
  // Bilgisayar mühendisliği
  'computer engineering': [],
  'computer architecture': ['architecture'],
  'machine learning': ['ai-ml'],
  'artificial intelligence': ['ai-ml'],
  'computer vision': ['vision'],
  'networking': ['networking'],
  'security': ['security'],
  'software engineering': ['software'],
  'cloud computing': ['systems'],
  'data mining': ['data'],
};

const PAGES_PER_CATEGORY = 3;
const DELAY_MS = 1200;
const UA = 'Mozilla/5.0 (compatible; CFP-Calendar/1.0; +https://github.com/SafakSahinn/cfp-calendar)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row {
  eventId: string;
  short: string;
  title: string;
  when: string;
  where: string;
  deadline: string;
}

export function parseListing(html: string): Row[] {
  const $ = cheerio.load(html);
  const rows: Row[] = [];
  $('a[href*="event.showcfp?eventid="]').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const eventId = href.match(/eventid=(\d+)/)?.[1];
    const tr1 = $(a).closest('tr');
    const tr2 = tr1.next('tr');
    const cells = tr2.children('td');
    if (!eventId || cells.length < 3) return;
    rows.push({
      eventId,
      short: $(a).text().trim(),
      title: tr1.children('td').eq(1).text().trim(),
      when: cells.eq(0).text().trim(),
      where: cells.eq(1).text().trim(),
      deadline: cells.eq(2).text().trim(),
    });
  });
  return rows;
}

function toEvent(row: Row, categoryTopics: string[]): NormalizedEvent | null {
  // "Oct 9, 2026 (Sep 1, 2026)" → ilk tarih güncel (uzatılmış) son tarihtir.
  const deadlineDate = parseShortDate(row.deadline);
  const [startText, endText] = row.when.split(' - ');
  const start = startText && startText !== 'N/A' ? parseShortDate(startText) : null;
  const end = endText ? parseShortDate(endText) : start;
  if (!deadlineDate && !start) return null;

  const acronym = row.short.replace(/\s+(19|20)\d{2}\s*$/, '').trim() || null;
  const year = +(row.short.match(/(19|20)\d{2}/)?.[0] ?? start?.slice(0, 4) ?? deadlineDate?.slice(0, 4) ?? 0) || null;
  const text = `${row.short} ${row.title}`;

  const kind: NormalizedEvent['kind'] =
    !start || /\b(journal|special issue|transactions|magazine)\b/i.test(text)
      ? 'journal'
      : /\bworkshop\b/i.test(text)
        ? 'workshop'
        : 'conference';

  const tagged = tagTopics(text, categoryTopics);
  const deadlineIso = deadlineDate ? localToUtcIso(`${deadlineDate} 23:59:59`, 'AoE') : null;

  return {
    source: 'wikicfp',
    source_id: row.eventId,
    dedupe_key: kind === 'journal' ? `WIKICFP-${row.eventId}` : makeDedupeKey(acronym, row.title, year),
    kind,
    acronym,
    title: row.title || row.short,
    url: `http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=${row.eventId}`,
    location: row.where && row.where !== 'N/A' ? row.where : null,
    fields: tagged.fields,
    topics: tagged.topics,
    ranks: {},
    is_ieee: /\bIEEE\b/.test(text),
    submission_open: null,
    abstract_deadline: null,
    submission_deadline: deadlineIso,
    deadlines: deadlineIso ? [{ deadline: deadlineIso }] : [],
    deadline_tz: 'AoE',
    notification_date: null,
    event_start: start,
    event_end: end,
  };
}

export async function fetchWikiCfp(log: (msg: string) => void = console.log): Promise<NormalizedEvent[]> {
  const byId = new Map<string, NormalizedEvent>();
  const now = Date.now();

  for (const [category, topics] of Object.entries(CATEGORIES)) {
    for (let page = 1; page <= PAGES_PER_CATEGORY; page++) {
      const url = `http://www.wikicfp.com/cfp/call?conference=${encodeURIComponent(category)}&page=${page}`;
      let html: string;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!res.ok) throw new Error(String(res.status));
        html = await res.text();
      } catch (e) {
        log(`  wikicfp "${category}" sayfa ${page}: ${e}`);
        break;
      } finally {
        await sleep(DELAY_MS);
      }

      const rows = parseListing(html);
      let upcoming = 0;
      for (const row of rows) {
        const ev = toEvent(row, topics);
        if (!ev) continue;
        const relevant =
          (ev.submission_deadline && new Date(ev.submission_deadline).getTime() > now) ||
          (ev.event_end && new Date(`${ev.event_end}T23:59:59Z`).getTime() > now);
        if (!relevant) continue;
        upcoming++;
        const prev = byId.get(row.eventId);
        if (prev) {
          // Aynı çağrı birden fazla kategoride: konuları birleştir.
          prev.topics = [...new Set([...prev.topics, ...ev.topics])];
          prev.fields = [...new Set([...prev.fields, ...ev.fields])];
        } else {
          byId.set(row.eventId, ev);
        }
      }
      if (rows.length === 0 || upcoming === 0) break;
    }
  }
  return [...byId.values()];
}

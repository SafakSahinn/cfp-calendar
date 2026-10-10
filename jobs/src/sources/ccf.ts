// ccf-deadlines (https://github.com/ccfddl/ccf-deadlines): bilgisayar bilimleri konferansları, yapılandırılmış YAML.

import { parse } from 'yaml';
import {
  localToUtcIso, makeDedupeKey, monthNum, tagTopics, ymd,
  type DeadlineRound, type NormalizedEvent,
} from '../types.ts';

const URL_ALLCONF = 'https://ccfddl.com/conference/allconf.yml';

// ccf alt alanları → bizim konu kimliklerimiz
const SUB_TOPICS: Record<string, string[]> = {
  AI: ['ai-ml'],
  CG: ['graphics'],
  CT: ['theory'],
  DB: ['data'],
  DS: ['systems', 'architecture'],
  HI: ['hci'],
  MX: [],
  NW: ['networking'],
  SC: ['security'],
  SE: ['software'],
};

interface CcfConf {
  year: number;
  id: string;
  link?: string;
  timeline?: { deadline?: string; abstract_deadline?: string; comment?: string }[];
  timezone?: string;
  date?: string;
  place?: string;
}

interface CcfEntry {
  title: string;
  description?: string;
  sub?: string;
  rank?: Record<string, string>;
  confs?: CcfConf[];
}

/**
 * "February 25 - March 4, 2025", "June 9 - 12, 2026", "Nov 6-10, 2026",
 * "January 29-February 1, 2024", "April 4, 2025" → [başlangıç, bitiş]
 */
export function parseDateRange(text: string | undefined): [string, string] | null {
  if (!text) return null;
  const t = text.replace(/\s*[-–]\s*/g, '-').replace(/\s+/g, ' ').trim();
  const m = t.match(/^([A-Za-z]+)\.? (\d{1,2})(?:-(?:([A-Za-z]+)\.? )?(\d{1,2}))?, (\d{4})$/);
  if (!m) return null;
  const [, mon1, d1, mon2, d2, year] = m;
  const m1 = monthNum(mon1);
  const m2 = mon2 ? monthNum(mon2) : m1;
  if (!m1 || !m2) return null;
  // Aralık yıl sonunu aşıyorsa (Dec 30 - Jan 2, 2027) başlangıç önceki yıldadır.
  const y1 = m2 < m1 ? +year - 1 : +year;
  return [ymd(y1, m1, +d1), ymd(+year, m2, +(d2 ?? d1))];
}

export async function fetchCcf(): Promise<NormalizedEvent[]> {
  const res = await fetch(URL_ALLCONF);
  if (!res.ok) throw new Error(`ccf-deadlines ${res.status}`);
  const entries = parse(await res.text()) as CcfEntry[];
  const thisYear = new Date().getUTCFullYear();
  const now = Date.now();
  const out: NormalizedEvent[] = [];

  for (const entry of entries) {
    const tagged = tagTopics(`${entry.title} ${entry.description ?? ''}`, SUB_TOPICS[entry.sub ?? ''] ?? []);
    if (!tagged.fields.includes('cs')) tagged.fields.unshift('cs');

    for (const conf of entry.confs ?? []) {
      if (conf.year < thisYear - 1) continue;

      const rounds: DeadlineRound[] = [];
      for (const tl of conf.timeline ?? []) {
        const deadline = tl.deadline && tl.deadline !== 'TBD' ? localToUtcIso(tl.deadline, conf.timezone) : null;
        if (!deadline) continue;
        const abstract = tl.abstract_deadline && tl.abstract_deadline !== 'TBD'
          ? localToUtcIso(tl.abstract_deadline, conf.timezone) ?? undefined
          : undefined;
        rounds.push({ deadline, abstract, comment: tl.comment });
      }
      rounds.sort((a, b) => a.deadline.localeCompare(b.deadline));
      // Henüz geçmemiş ilk tur; hepsi geçtiyse sonuncusu.
      const next = rounds.find((r) => new Date(r.deadline).getTime() > now) ?? rounds.at(-1);

      const dates = parseDateRange(conf.date);
      // Ne son tarihi ne etkinlik tarihi olan kayıt işe yaramaz.
      if (!next && !dates) continue;

      out.push({
        source: 'ccf',
        source_id: conf.id,
        dedupe_key: makeDedupeKey(entry.title, entry.title, conf.year),
        kind: 'conference',
        acronym: entry.title,
        title: entry.description ?? entry.title,
        url: conf.link ?? null,
        location: conf.place ?? null,
        fields: tagged.fields,
        topics: tagged.topics,
        ranks: Object.fromEntries(
          Object.entries(entry.rank ?? {}).filter(([, v]) => v && v !== 'N' && v !== 'Non-CCF'),
        ),
        is_ieee: /\bIEEE\b/.test(entry.description ?? ''),
        submission_open: null,
        abstract_deadline: next?.abstract ?? null,
        submission_deadline: next?.deadline ?? null,
        deadlines: rounds,
        deadline_tz: conf.timezone ?? 'AoE',
        notification_date: null,
        event_start: dates?.[0] ?? null,
        event_end: dates?.[1] ?? null,
      });
    }
  }
  return out;
}

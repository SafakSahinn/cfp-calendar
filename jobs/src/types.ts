import { classify, fieldsOf, type Field } from '../../shared/topics.ts';

export interface DeadlineRound {
  deadline: string; // ISO (UTC)
  abstract?: string;
  comment?: string;
}

/** Kaynaklardan gelen, ortak biçime dönüştürülmüş etkinlik. */
export interface NormalizedEvent {
  source: 'ccf' | 'wikicfp' | 'comsoc';
  source_id: string;
  dedupe_key: string;
  kind: 'conference' | 'workshop' | 'journal';
  acronym: string | null;
  title: string;
  url: string | null;
  location: string | null;
  fields: Field[];
  topics: string[];
  ranks: Record<string, string>;
  is_ieee: boolean;
  submission_open: string | null;
  abstract_deadline: string | null;
  submission_deadline: string | null;
  deadlines: DeadlineRound[];
  deadline_tz: string | null;
  notification_date: string | null;
  event_start: string | null;
  event_end: string | null;
}

/** Kaynak önceliği: yüksek olan alanları ezer, düşük olan boşlukları doldurur. */
export const SOURCE_PRIORITY: Record<NormalizedEvent['source'], number> = { ccf: 3, comsoc: 2, wikicfp: 1 };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export function monthNum(name: string): number | undefined {
  return MONTHS[name.toLowerCase().slice(0, name.toLowerCase().startsWith('sept') ? 4 : 3)];
}

export function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "Oct 9, 2026" → "2026-10-09" */
export function parseShortDate(text: string): string | null {
  const m = text.trim().match(/^([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const mon = monthNum(m[1]);
  return mon ? ymd(+m[3], mon, +m[2]) : null;
}

/**
 * Saat dilimi ifadesini UTC'ye göre saat farkına çevirir.
 * AoE = UTC-12, PT ≈ UTC-7 (konferans dönemlerinde genelde yaz saati).
 */
export function tzOffsetHours(tz: string | null | undefined): number {
  if (!tz) return -12;
  const t = tz.trim().toUpperCase();
  if (t === 'AOE') return -12;
  if (t === 'PT' || t === 'PDT') return -7;
  if (t === 'PST') return -8;
  if (t === 'ET' || t === 'EDT') return -4;
  if (t === 'EST') return -5;
  if (t === 'CET') return 1;
  if (t === 'CEST') return 2;
  const m = t.match(/^(?:UTC|GMT)\s*([+-]\d{1,2})?(?::?(\d{2}))?$/);
  if (m) return m[1] ? +m[1] + (m[2] ? Math.sign(+m[1]) * +m[2] / 60 : 0) : 0;
  return -12;
}

/** "2026-08-15 23:59:59" + "AoE" → UTC ISO */
export function localToUtcIso(local: string, tz: string | null | undefined): string | null {
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '23', mi = '59', s = '59'] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - tzOffsetHours(tz) * 3600_000;
  return new Date(utc).toISOString();
}

/** Kısaltma + yıl → kaynaklar arası eşleştirme anahtarı. */
export function makeDedupeKey(acronym: string | null, title: string, year: number | null): string {
  const base = (acronym ?? title)
    .toUpperCase()
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\b(IEEE|ACM|SPRINGER|IFIP|IET|EI|SCOPUS)\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
  return `${base || title.slice(0, 40)}-${year ?? 'NA'}`;
}

export function tagTopics(text: string, extra: string[] = []): { topics: string[]; fields: Field[] } {
  const topics = [...new Set([...extra, ...classify(text)])];
  return { topics, fields: fieldsOf(topics) };
}

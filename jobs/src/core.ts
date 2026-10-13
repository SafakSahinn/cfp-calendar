// CORE konferans sıralaması (https://portal.core.edu.au/conf-ranks/): WikiCFP gibi derecesiz kaynaklardan gelen
// konferanslara A*/A/B/C derecesi eşleştirir. Ticari konferanslar ünlü kısaltmaları taklit edebildiği için
// eşleşme için kısaltma YETMEZ: başlıklar da büyük ölçüde örtüşmelidir.

import { readFileSync } from 'node:fs';
import { runStats } from './runStats.ts';

const CORE_URL = 'https://portal.core.edu.au/conf-ranks/?search=&by=all&source=ICORE2026&sort=arank&page=1&do=Export';
const SNAPSHOT = new URL('../data/core-icore2026.csv', import.meta.url);
const VALID_RANKS = new Set(['A*', 'A', 'B', 'C']);
/**
 * Başlık benzerliği: anlamlı kelime kümelerinin Jaccard oranı (ortak / birleşim) + en az 2 ortak kelime.
 * Jaccard, taklit başlıklardaki fazladan kelimeleri de cezalandırır: "Intelligent Computing and Data Mining" (ICDM)
 * gerçek "IEEE International Conference on Data Mining" (ICDM, A*) ile eşleşmez.
 */
const MIN_TITLE_OVERLAP = 0.6;
const MIN_COMMON_WORDS = 2;

export interface CoreEntry {
  title: string;
  acronym: string;
  rank: string;
}

/** Tırnaklı alanları destekleyen basit CSV satır ayrıştırıcı. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** CSV sütunları: id, başlık, kısaltma, kaynak, derece, birincil, alan kodları… */
export function parseCore(csv: string): CoreEntry[] {
  return csv
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseCsvLine)
    .filter((c) => c.length >= 5 && VALID_RANKS.has(c[4].trim()))
    .map((c) => ({ title: c[1].trim(), acronym: c[2].trim(), rank: c[4].trim() }));
}

export async function loadCore(log: (msg: string) => void = console.log): Promise<CoreEntry[]> {
  try {
    const res = await fetch(CORE_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CFP-Calendar/1.0)' } });
    if (!res.ok) throw new Error(String(res.status));
    const entries = parseCore(await res.text());
    if (entries.length < 300) throw new Error(`beklenenden az kayıt: ${entries.length}`);
    runStats.core_source = 'live';
    return entries;
  } catch (e) {
    log(`  CORE canlı liste alınamadı (${e}), depodaki kopya kullanılıyor`);
    runStats.core_source = 'snapshot';
    return parseCore(readFileSync(SNAPSHOT, 'utf8'));
  }
}

const STOP = new Set([
  'the', 'of', 'on', 'and', 'in', 'for', 'to', 'a', 'an', 'at', 'with', 'by', 'its', 'ieee', 'acm', 'ifip', 'usenix',
  'international', 'conference', 'symposium', 'workshop', 'annual', 'joint', 'proceedings', 'meeting', 'previously',
]);

export function significantWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+(st|nd|rd|th)?$/.test(w)),
  );
}

export const normAcronym = (a: string) => a.toUpperCase().replace(/\b(19|20)\d{2}\b/g, '').replace(/\b(IEEE|ACM|IFIP)\b/g, '').replace(/[^A-Z0-9]/g, '');

export type CoreIndex = Map<string, CoreEntry[]>;

export function buildIndex(entries: CoreEntry[]): CoreIndex {
  const idx: CoreIndex = new Map();
  for (const e of entries) {
    const k = normAcronym(e.acronym);
    if (k) idx.set(k, [...(idx.get(k) ?? []), e]);
  }
  return idx;
}

/** Kısaltma + başlık örtüşmesiyle CORE derecesini bulur; emin değilse null. */
export function matchCore(idx: CoreIndex, acronym: string | null, title: string): CoreEntry | null {
  if (!acronym) return null;
  const candidates = idx.get(normAcronym(acronym));
  if (!candidates) return null;
  const words = significantWords(title);
  let best: { e: CoreEntry; score: number } | null = null;
  for (const c of candidates) {
    const cw = significantWords(c.title);
    if (cw.size === 0) continue;
    const hit = [...cw].filter((w) => words.has(w)).length;
    const score = hit / new Set([...cw, ...words]).size;
    if (hit >= MIN_COMMON_WORDS && score >= MIN_TITLE_OVERLAP && (!best || score > best.score)) best = { e: c, score };
  }
  return best?.e ?? null;
}

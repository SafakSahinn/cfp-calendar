// SCImago Journal Rank (SJR, Scopus tabanlı) dergi çeyrekleri.
// Kaynak dosya yılda bir kez tarayıcıdan indirilir (site otomatik indirmeyi Cloudflare ile engelliyor) ve
// `npm run build-sjr -- <csv yolu>` ile depodaki küçük JSON'a (jobs/data/sjr.json) dönüştürülür.
// Yalnızca Mühendislik ve Bilgisayar Bilimi alanlarındaki dergiler tutulur.
// Not: Clarivate SCIE/JCR çeyrekleri ücretsiz yayımlanmadığı için kullanılmıyor; gösterilen çeyrek SJR'dir.

export interface SjrJournal {
  title: string;
  issn: string[];
  quartile: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  sjr: number;
}

export interface SjrData {
  year: string;
  journals: SjrJournal[];
}

/** SCImago CSV satırı: ';' ayraçlı, tırnaklı alanlar, ondalık virgül. */
export function parseSemicolonLine(line: string): string[] {
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
    else if (ch === ';') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const RELEVANT_AREAS = /\b(Engineering|Computer Science)\b/;

export function parseSjrCsv(csv: string): SjrJournal[] {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const header = parseSemicolonLine(lines[0]).map((h) => h.trim());
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iTitle = col('Title'), iType = col('Type'), iIssn = col('Issn'), iQ = col('SJR Best Quartile'), iSjr = col('SJR'), iAreas = col('Areas');
  if ([iTitle, iType, iIssn, iQ, iSjr].some((i) => i < 0)) throw new Error(`Beklenmeyen CSV başlığı: ${header.join(' | ')}`);
  const out: SjrJournal[] = [];
  for (const line of lines.slice(1)) {
    const c = parseSemicolonLine(line);
    if (c[iType]?.trim().toLowerCase() !== 'journal') continue;
    const q = c[iQ]?.trim();
    if (!/^Q[1-4]$/.test(q)) continue;
    if (iAreas >= 0 && !RELEVANT_AREAS.test(c[iAreas] ?? '')) continue;
    out.push({
      title: c[iTitle].trim(),
      issn: (c[iIssn] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      quartile: q as SjrJournal['quartile'],
      sjr: Number((c[iSjr] ?? '0').replace(',', '.')) || 0,
    });
  }
  return out;
}

// Yalnızca anlamı değiştirmeyen kelimeler atılır; "in/of/on" KORUNUR ("Frontiers in Computer Science" ≠ "Frontiers of Computer Science").
const STOP = new Set(['the', 'a', 'an']);

export const normTitle = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ');

export type SjrIndex = Map<string, SjrJournal>;

export function buildSjrIndex(journals: SjrJournal[]): SjrIndex {
  const idx: SjrIndex = new Map();
  for (const j of journals) {
    // "Electronics (Switzerland)" → "electronics"; aynı adı taşıyan iki dergi varsa ad belirsizdir → hiç eşleştirilmez
    const k = normTitle(j.title);
    if (!k) continue;
    idx.set(k, idx.has(k) ? { ...j, quartile: 'AMBIGUOUS' as never } : j);
  }
  return idx;
}

/** Özel sayı / bölüm ifadesi: dergi adından sonra gelirse ad içerme ile kabul edilir. */
const SPECIAL = /^(special|si|call|issue|section|cfp|topical|themed|focus)\b/;

/**
 * Etkinlik metinlerinden dergiyi bulur. Kabul edilen durumlar (ünlü dergi adlarını içeren taklitleri dışarıda bırakır):
 *  1) Metin (ör. "Dergi Adı: Özel sayı" içindeki ilk parça) dergi adına BİREBİR eşit.
 *  2) Metin dergi adıyla BAŞLIYOR ve hemen ardından "Special Issue/Section…" geliyor.
 */
export function matchJournal(idx: SjrIndex, ...texts: (string | null | undefined)[]): SjrJournal | null {
  const accept = (j: SjrJournal | undefined) => (j && (j.quartile as string) !== 'AMBIGUOUS' ? j : null);
  for (const text of texts) {
    if (!text) continue;
    // "Başlık - Scopus, ERA Indexed" / "Başlık: Özel sayı" → ilk parça da aday
    for (const part of [text, text.split(/\s[-–|]\s|:/)[0]]) {
      const t = normTitle(part);
      const exact = accept(idx.get(t));
      if (exact) return exact;
    }
    const t = normTitle(text);
    const words = t.split(' ');
    for (let n = words.length - 1; n >= 2; n--) {
      const head = words.slice(0, n).join(' ');
      const rest = words.slice(n).join(' ');
      if (SPECIAL.test(rest)) {
        const j = accept(idx.get(head));
        if (j) return j;
      }
    }
  }
  return null;
}

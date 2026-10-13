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

const STOP = new Set(['the', 'of', 'and', 'on', 'in', 'for', 'a', 'an', '&']);

export const normTitle = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ');

export type SjrIndex = { byTitle: Map<string, SjrJournal>; titles: string[] };

export function buildSjrIndex(journals: SjrJournal[]): SjrIndex {
  const byTitle = new Map<string, SjrJournal>();
  for (const j of journals) {
    const k = normTitle(j.title);
    if (k.split(' ').length >= 2 && !byTitle.has(k)) byTitle.set(k, j);
  }
  // Uzun başlıklar önce: "ieee transactions on industrial informatics", "ieee transactions on industrial electronics"dan önce eşleşmesin diye tam kelime sınırıyla arama
  return { byTitle, titles: [...byTitle.keys()].sort((a, b) => b.length - a.length) };
}

/** Etkinlik başlığı/kısaltması içinde geçen dergi adını bulur (ör. "IEEE Network: Special Issue on …"). */
export function matchJournal(idx: SjrIndex, ...texts: (string | null | undefined)[]): SjrJournal | null {
  for (const text of texts) {
    if (!text) continue;
    const t = ` ${normTitle(text)} `;
    for (const k of idx.titles) {
      // En az 3 anlamlı kelime (çok genel adlar — "electronics", "sensors" — yanlış eşleşmesin) veya tam eşitlik
      if ((k.split(' ').length >= 3 && t.includes(` ${k} `)) || t.trim() === k) return idx.byTitle.get(k)!;
    }
  }
  return null;
}

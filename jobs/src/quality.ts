// Kalite işaretleri: ticari organizatörlerin ve indeks vaadiyle reklam yapan çağrıların tipik kalıpları.
// Amaç kesin "yağmacı" hükmü vermek değil, kullanıcıyı uyarmak: işaretli çağrılar arayüzde varsayılan olarak gizlenir
// ve konu bildirimlerine girmez. Dereceli (CCF/CORE) konferanslar asla işaretlenmez.

import type { NormalizedEvent } from './types.ts';

export type Flag = 'indexing_claims' | 'organizer_prefix' | 'ei_duplicate' | 'generic_journal';

/** Kullanıcıyı uyaran işaretler; herhangi biri varsa çağrı "dikkat" sayılır. */
export const CAUTION_FLAGS: Flag[] = ['indexing_claims', 'organizer_prefix', 'ei_duplicate', 'generic_journal'];

const RULES: { flag: Flag; test: (e: Pick<NormalizedEvent, 'acronym' | 'title' | 'kind'>) => boolean }[] = [
  {
    // "Scopus, ERA Indexed, H Index - 40", "Web Of Sci Indexed", "EI Compendex"
    flag: 'indexing_claims',
    test: (e) => /\b(scopus|web of sci(ence)?|indexed|h[- ]?index|ei compendex|compendex)\b/i.test(`${e.acronym ?? ''} ${e.title}`),
  },
  {
    // "IEEE--2027 …", "ACM--2026 …", "Springer--2026 …", "ACM--Singapore-CDICS"
    flag: 'organizer_prefix',
    test: (e) => /^(IEEE|ACM|Springer|IET)\s*-{1,2}\s*\S/i.test(e.title) && /--/.test(e.title.slice(0, 12))
      || /^(IEEE|ACM|Springer)--/i.test(e.acronym ?? ''),
  },
  {
    // "APCT--EI", "ICRET--EI": aynı konferansın indeks vaadiyle tekrar listelenmesi
    flag: 'ei_duplicate',
    test: (e) => /-{1,2}\s*EI\b/i.test(e.acronym ?? ''),
  },
  {
    // "IJCSEA", "IJAIT": "International Journal of <genel alan>" kalıbındaki geniş kapsamlı dergiler
    flag: 'generic_journal',
    test: (e) => e.kind === 'journal' && /^IJ[A-Z]{2,6}$/.test(e.acronym ?? '') && /^International Journal of\b/i.test(e.title),
  },
];

export function qualityFlags(e: Pick<NormalizedEvent, 'acronym' | 'title' | 'kind' | 'ranks'>): Flag[] {
  if (Object.keys(e.ranks ?? {}).length > 0) return [];
  return RULES.filter((r) => r.test(e)).map((r) => r.flag);
}

export function isCaution(flags: readonly string[]): boolean {
  return flags.some((f) => (CAUTION_FLAGS as string[]).includes(f));
}

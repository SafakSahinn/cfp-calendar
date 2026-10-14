// Kalite işaretleri: ticari organizatörlerin ve indeks vaadiyle reklam yapan çağrıların tipik kalıpları.
// Amaç kesin "yağmacı" hükmü vermek değil, kullanıcıyı uyarmak: işaretli çağrılar arayüzde varsayılan olarak gizlenir
// ve konu bildirimlerine girmez. Dereceli (CCF/CORE) konferanslar asla işaretlenmez.

import { CAUTION_FLAGS, hasCautionFlag, type Flag } from '../../shared/caution.ts';
import type { NormalizedEvent } from './types.ts';

export { CAUTION_FLAGS, type Flag };

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
  return hasCautionFlag(flags);
}

/** Toplu konferans kümesi için en az kaç konferans aynı tarih/yer/son başvuruyu paylaşmalı */
export const BULK_CLUSTER_MIN = 4;

/**
 * "Toplu konferanslar": aynı organizatörün farklı konulu çok sayıda konferansı birebir aynı son başvuru gününe,
 * aynı etkinlik günlerine ve aynı yere sahiptir (ör. 7th Int. Conf. on Electrical / Mechanical / Applied Control
 * Engineering — hepsi 29–30 Aralık, "Virtual Conference", son başvuru 13 Ekim). Derecelendirilmiş konferanslar ve
 * çalıştaylar (büyük konferansların ortak çalıştayları) muaftır. Yerinde değiştirir; işaretlenen sayısını döndürür.
 */
export function flagBulkClusters(events: { kind: string; ranks: Record<string, string>; flags: string[]; location: string | null; submission_deadline: string | null; event_start: string | null; event_end: string | null }[]): number {
  const groups = new Map<string, typeof events>();
  for (const e of events) {
    if (e.kind !== 'conference' || Object.keys(e.ranks).length > 0) continue;
    if (!e.submission_deadline || !e.event_start || !e.location) continue;
    const key = [e.submission_deadline.slice(0, 10), e.event_start, e.event_end ?? e.event_start, e.location.trim().toLowerCase().replace(/\s+/g, ' ')].join('|');
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  let n = 0;
  for (const g of groups.values()) {
    if (g.length < BULK_CLUSTER_MIN) continue;
    for (const e of g) {
      if (!e.flags.includes('bulk_cluster')) e.flags = [...e.flags, 'bulk_cluster'];
      n++;
    }
  }
  return n;
}

// Çağrı filtreleri: sitedeki liste ile kayıtlı aramaların bildirim işi (jobs/src/savedSearches.ts) aynı kuralı kullanır.

import { fundingFor } from './tubitak.ts';

/** Türkiye'de düzenlenen etkinlikler: ülke adı veya büyük şehirler (kaynaklarda yer serbest metin). */
export const IN_TURKEY = /t[üu]rk[iı]ye|turkey|turkiye|[iİı]stanbul|ankara|[iİı]zmir|antalya|bursa|konya|eski[sş]ehir|trabzon|kayseri|samsun|adana|mersin|gaziantep|denizli|edirne|mu[gğ]la|bodrum|kapadokya|cappadocia|nev[sş]ehir|sakarya|kocaeli|erzurum|malatya|diyarbak[iı]r|[cç]anakkale/i;

/** Çevrim içi / hibrit etkinlikler. */
export const IS_ONLINE = /virtual|online|hybrid|çevrim ?içi|webinar|remote/i;

export interface Filters {
  q: string;
  field: '' | 'cs' | 'ee';
  kind: '' | 'conference' | 'workshop' | 'journal';
  topic: string;
  within: '' | '7' | '30' | '90';
  format: '' | 'online' | 'in_person';
  sort: 'deadline' | 'event' | 'newest';
  ieee: boolean;
  ranked: boolean;
  followedOnly: boolean;
  showCaution: boolean;
  turkey: boolean;
  fundingOpen: boolean;
  topQuartile: boolean;
}

export const EMPTY_FILTERS: Filters = {
  q: '', field: '', kind: '', topic: '', within: '', format: '', sort: 'deadline',
  ieee: false, ranked: false, followedOnly: false, showCaution: false, turkey: false, fundingOpen: false, topQuartile: false,
};

/** Kayıtlı aramada anlamı olan (sıralama/görünüm dışı) etkin filtre sayısı. */
export function activeFilterCount(f: Filters): number {
  return (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).filter((k) => k !== 'sort' && f[k] !== EMPTY_FILTERS[k]).length;
}

export interface FilterableEvent {
  id: string;
  kind: string;
  acronym: string | null;
  title: string;
  location: string | null;
  fields: string[];
  topics: string[];
  ranks: Record<string, string>;
  is_ieee: boolean;
  flags: string[];
  submission_deadline: string | null;
  event_start: string | null;
}

const DAY = 86_400_000;

/** Arama için küçük harfe çevir; Türkçe I/ı ile İ/i farkı aramayı bozmasın ("SIGNAL" ↔ "signal", "İzmir" ↔ "izmir"). */
const fold = (s: string, lang: string) => s.toLocaleLowerCase(lang).replace(/ı/g, 'i').normalize('NFD').replace(/̇/g, '');

export function matchesFilters(
  e: FilterableEvent,
  f: Filters,
  ctx: { now: number; followed: Set<string>; lang: 'tr' | 'en' },
): boolean {
  if (f.field && !e.fields.includes(f.field)) return false;
  if (f.kind && e.kind !== f.kind) return false;
  if (f.topic && !e.topics.includes(f.topic)) return false;
  if (f.within && (!e.submission_deadline || new Date(e.submission_deadline).getTime() - ctx.now > +f.within * DAY)) return false;
  if (f.format === 'online' && !IS_ONLINE.test(e.location ?? '')) return false;
  if (f.format === 'in_person' && (!e.location || IS_ONLINE.test(e.location))) return false;
  if (f.ieee && !e.is_ieee) return false;
  if (f.ranked && Object.keys(e.ranks).length === 0) return false;
  if (f.followedOnly && !ctx.followed.has(e.id)) return false;
  if (f.turkey && !IN_TURKEY.test(e.location ?? '')) return false;
  if (f.fundingOpen && !fundingFor(e, { inTurkey: IN_TURKEY.test(e.location ?? ''), online: IS_ONLINE.test(e.location ?? ''), now: ctx.now })?.openNow) return false;
  if (f.topQuartile && !/^Q[12]$/.test(e.ranks.sjr ?? '')) return false;
  // Takip edilenler, işaretli olsa da her zaman görünür
  if (!f.showCaution && (e.flags?.length ?? 0) > 0 && !ctx.followed.has(e.id)) return false;
  const q = fold(f.q.trim(), ctx.lang);
  if (q && !fold(`${e.acronym ?? ''} ${e.title} ${e.location ?? ''}`, ctx.lang).includes(q)) return false;
  return true;
}

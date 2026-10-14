// Kayıtlı aramalar: kaydedildikten sonra yayımlanan ve filtreye uyan çağrılar (saf; birim testlenir).

import { EMPTY_FILTERS, matchesFilters, type FilterableEvent, type Filters } from '../../shared/filters.ts';

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  filters: Partial<Filters>;
  created_at: string;
}

const DAY = 86_400_000;
export const SAVED_SEARCH_LIMIT = 10;
const FRESH_DAYS = 14;

export function savedSearchMatches<E extends FilterableEvent & { first_seen_at: string }>(
  s: SavedSearch,
  events: E[],
  ctx: { now: number; followed: Set<string>; lang: 'tr' | 'en'; alreadyNotified: Set<string | null> },
): E[] {
  // Sadece arama kaydedildikten SONRA görülen (ve en fazla 14 günlük) çağrılar: eski çağrılar toplu bildirilmez
  const since = Math.max(new Date(s.created_at).getTime(), ctx.now - FRESH_DAYS * DAY);
  const f: Filters = { ...EMPTY_FILTERS, ...s.filters, followedOnly: false };
  return events
    .filter((e) =>
      !ctx.followed.has(e.id) &&
      !ctx.alreadyNotified.has(e.id) &&
      !!e.submission_deadline && new Date(e.submission_deadline).getTime() > ctx.now + 2 * DAY &&
      new Date(e.first_seen_at).getTime() >= since &&
      matchesFilters(e, f, ctx))
    .sort((a, b) => a.submission_deadline!.localeCompare(b.submission_deadline!))
    .slice(0, SAVED_SEARCH_LIMIT);
}

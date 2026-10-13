// Haftalık özetin içeriği (saf fonksiyon; veritabanı gerektirmez, test edilebilir).

import { isCaution } from './quality.ts';
import type { WeeklyData, WeeklyEvent } from './emailRender.ts';

const DAY = 86_400_000;

export const EV_COLS = 'id, acronym, title, url, location, abstract_deadline, submission_deadline, event_start, event_end, topics, ranks, is_ieee, flags';
export type Ev = WeeklyEvent & { topics: string[]; flags: string[] };

export function buildWeekly(opts: {
  now: number; followed: Set<string>; topics: Set<string>; open: Ev[]; followedEvents: Ev[];
  groupNews: WeeklyData['groupNews'];
}): WeeklyData {
  const { now } = opts;
  const inWindow = (iso: string | null | undefined, from: number, to: number) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= from && t <= to;
  };
  const followedSoon = opts.followedEvents
    .filter((e) => inWindow(e.submission_deadline, now, now + 7 * DAY) || inWindow(e.abstract_deadline, now, now + 7 * DAY))
    .sort((a, b) => (a.submission_deadline ?? '').localeCompare(b.submission_deadline ?? ''));
  const score = (e: Ev) => (Object.keys(e.ranks ?? {}).length ? 2 : 0) + (e.is_ieee ? 1 : 0);
  const forYou = opts.topics.size === 0 ? [] : opts.open
    .filter((e) => !opts.followed.has(e.id) && !isCaution(e.flags ?? []) && e.topics.some((t) => opts.topics.has(t)))
    .filter((e) => inWindow(e.submission_deadline, now + 2 * DAY, now + 21 * DAY))
    .sort((a, b) => score(b) - score(a) || (a.submission_deadline ?? '').localeCompare(b.submission_deadline ?? ''))
    .slice(0, 6);
  return { followedSoon, forYou, groupNews: opts.groupNews.slice(0, 5) };
}

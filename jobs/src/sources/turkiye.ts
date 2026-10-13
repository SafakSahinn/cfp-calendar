// Türkiye konferans serileri (shared/turkiye.ts, elle derlenen liste) → ortak etkinlik biçimi.

import { TR_SERIES, type TrEdition, type TrSeries } from '../../../shared/turkiye.ts';
import { localToUtcIso, makeDedupeKey, type NormalizedEvent } from '../types.ts';

export function turkiyeToEvent(s: TrSeries, e: TrEdition): NormalizedEvent {
  const deadline = e.deadline ? localToUtcIso(`${e.deadline} 23:59:59`, 'UTC+3') : null;
  const original = e.originalDeadline ? localToUtcIso(`${e.originalDeadline} 23:59:59`, 'UTC+3') : null;
  return {
    source: 'turkiye',
    source_id: `${s.key}-${e.year}`,
    dedupe_key: makeDedupeKey(s.acronym, s.name.en, e.year),
    kind: 'conference',
    acronym: s.acronym,
    title: s.name.en,
    url: e.url,
    location: e.location,
    fields: s.fields,
    topics: s.topics,
    ranks: {},
    is_ieee: s.ieee,
    submission_open: null,
    abstract_deadline: null,
    submission_deadline: deadline,
    deadlines: [...(original ? [{ deadline: original, comment: 'ilk tarih' }] : []), ...(deadline ? [{ deadline, comment: original ? 'uzatıldı' : undefined }] : [])],
    deadline_tz: 'UTC+3',
    notification_date: null,
    event_start: e.eventStart,
    event_end: e.eventEnd,
  };
}

export function fetchTurkiye(): NormalizedEvent[] {
  return TR_SERIES.flatMap((s) => s.editions.map((e) => turkiyeToEvent(s, e)));
}

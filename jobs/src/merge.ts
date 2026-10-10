import { SOURCE_PRIORITY, type NormalizedEvent } from './types.ts';

export type Merged = Omit<NormalizedEvent, 'source_id'> & { source_ids: Record<string, string> };

/** Aynı dedupe_key'e sahip kayıtları birleştirir: öncelikli kaynak kazanır, boşlukları diğerleri doldurur. */
export function merge(events: NormalizedEvent[]): Merged[] {
  const groups = new Map<string, NormalizedEvent[]>();
  for (const e of events) {
    const g = groups.get(e.dedupe_key);
    if (g) g.push(e);
    else groups.set(e.dedupe_key, [e]);
  }

  const out: Merged[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]);
    const { source_id, ...head } = group[0];
    const m: Merged = { ...head, source_ids: { [head.source]: source_id } };
    for (const other of group.slice(1)) {
      m.source_ids[other.source] ??= other.source_id;
      m.topics = [...new Set([...m.topics, ...other.topics])];
      m.fields = [...new Set([...m.fields, ...other.fields])];
      m.is_ieee ||= other.is_ieee;
      for (const k of ['url', 'location', 'submission_deadline', 'abstract_deadline', 'event_start', 'event_end', 'notification_date'] as const) {
        (m as Record<string, unknown>)[k] ??= other[k];
      }
      if (m.deadlines.length === 0) m.deadlines = other.deadlines;
    }
    out.push(m);
  }
  return out;
}

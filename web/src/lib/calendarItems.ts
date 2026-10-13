// Etkinliklerden aylık takvime yerleştirilecek kalemler üretir (son başvuru, özet, açılış, etkinlik günleri).

import { eventHref } from './events';
import { funding } from './funding';
import type { EventRow } from './supabase';

export type ItemKind = 'open' | 'abstract' | 'deadline' | 'event' | 'funding';

export interface CalItem {
  key: string;
  day: string; // YYYY-MM-DD (yerel)
  kind: ItemKind;
  label: string;
  title: string;
  href: string;
  highlight?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MAX_EVENT_DAYS = 14;

function eachDay(start: string, end: string | null): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00`);
  const last = new Date(`${end ?? start}T12:00:00`);
  while (d <= last && out.length < MAX_EVENT_DAYS) {
    out.push(localKey(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Bir etkinliğin istenen türdeki tüm takvim kalemleri. */
export function itemsForEvent(e: EventRow, kinds: ItemKind[], highlight = false): CalItem[] {
  const name = e.acronym ?? e.title;
  const title = e.acronym ? `${e.acronym} – ${e.title}` : e.title;
  const href = eventHref(e.id);
  const out: CalItem[] = [];
  const add = (day: string, kind: ItemKind) => out.push({ key: `${e.id}-${kind}-${day}`, day, kind, label: name, title, href, highlight });

  if (kinds.includes('open') && e.submission_deadline) add(e.submission_open ?? localKey(new Date(e.first_seen_at)), 'open');
  if (kinds.includes('abstract') && e.abstract_deadline && e.abstract_deadline !== e.submission_deadline) {
    add(localKey(new Date(e.abstract_deadline)), 'abstract');
  }
  if (kinds.includes('deadline') && e.submission_deadline) add(localKey(new Date(e.submission_deadline)), 'deadline');
  if (kinds.includes('funding')) {
    const f = funding(e);
    if (f && !f.missed && !f.period.estimated) {
      out.push({ key: `${e.id}-funding`, day: localKey(new Date(f.period.close)), kind: 'funding', label: `${f.program} · ${name}`, title: `TÜBİTAK ${f.program} (${f.period.name}) — ${title}`, href, highlight });
    }
  }
  if (kinds.includes('event') && e.event_start && e.kind !== 'journal') for (const d of eachDay(e.event_start, e.event_end)) add(d, 'event');
  return out;
}

export const KIND_ICON: Record<ItemKind, string> = { open: '📝', abstract: '✍️', deadline: '⏰', event: '🎤', funding: '💰' };

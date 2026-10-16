// Başvurusu açık çağrılar: liste, takvim, harita ve detay sayfaları aynı veriyi paylaşır.
// Hız için: son liste tarayıcıda (Cache API) saklanır ve açılışta hemen gösterilir; güncel veri arka planda
// çekilip yerine konur (stale-while-revalidate). Liste kişisel veri içermez; çıkışta yine de silinir.

import { useEffect, useState } from 'react';
import { supabase, type EventRow } from './supabase';

export { IN_TURKEY, IS_ONLINE } from '../../../shared/filters';

/** Listede kullanılan sütunlar (source_ids, last_seen_at, updated_at gibi iç alanlar indirilmez) */
const COLUMNS =
  'id, dedupe_key, source, kind, acronym, title, url, source_url, location, fields, topics, ranks, is_ieee, flags, ' +
  'submission_open, abstract_deadline, submission_deadline, deadlines, deadline_tz, notification_date, event_start, event_end, ' +
  'first_seen_at, series_key, lat, lng';

const STORE = 'cfp-data';
const STORE_KEY = new URL('__open-events-v1', document.baseURI).href;
const MAX_AGE = 48 * 3600_000; // daha eski kayıt gösterilmez (sunucudan beklenir)

let current: EventRow[] | null = null;
let fresh: Promise<EventRow[]> | null = null; // bu oturumdaki sunucu isteği
const listeners = new Set<(rows: EventRow[]) => void>();

const stillOpen = (rows: EventRow[]) => {
  const now = new Date().toISOString();
  return rows.filter((e) => (e.submission_deadline ?? '') > now);
};

function publish(rows: EventRow[]) {
  current = rows;
  listeners.forEach((l) => l(rows));
}

async function readStored(): Promise<EventRow[] | null> {
  try {
    if (!('caches' in window)) return null;
    const res = await (await caches.open(STORE)).match(STORE_KEY);
    if (!res) return null;
    const { saved, rows } = (await res.json()) as { saved: number; rows: EventRow[] };
    return Date.now() - saved < MAX_AGE ? stillOpen(rows) : null;
  } catch {
    return null;
  }
}

async function writeStored(rows: EventRow[]) {
  try {
    if (!('caches' in window)) return;
    const body = JSON.stringify({ saved: Date.now(), rows });
    await (await caches.open(STORE)).put(STORE_KEY, new Response(body, { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // depolama kapalı / dolu: önemli değil
  }
}

async function fetchOpenEvents(): Promise<EventRow[]> {
  const all: EventRow[] = [];
  // Supabase sayfa başına en fazla 1000 satır döndürür
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('events')
      .select(COLUMNS)
      .gt('submission_deadline', new Date().toISOString())
      .order('submission_deadline', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as unknown as EventRow[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

/** Önce saklanan liste (varsa, anında), sonra sunucudaki güncel liste. */
function ensureLoaded() {
  if (fresh) return;
  if (!current) readStored().then((rows) => rows && !current && publish(rows));
  fresh = fetchOpenEvents()
    .then((rows) => {
      publish(rows);
      writeStored(rows);
      return rows;
    })
    .catch((e) => {
      fresh = null;
      if (!current) publish([]);
      throw e;
    });
  fresh.catch(() => {});
}

/** Çıkışta: bellekteki ve tarayıcıda saklanan liste temizlenir. */
export function invalidateEvents() {
  current = null;
  fresh = null;
  try {
    if ('caches' in window) caches.open(STORE).then((c) => c.delete(STORE_KEY)).catch(() => {});
  } catch {
    // yok say
  }
}

export function useOpenEvents(): EventRow[] | null {
  const [events, setEvents] = useState<EventRow[] | null>(current);
  useEffect(() => {
    listeners.add(setEvents);
    if (current) setEvents(current);
    ensureLoaded();
    return () => {
      listeners.delete(setEvents);
    };
  }, []);
  return events;
}

/** Tek etkinlik: önce bellekteki açık çağrılara bakar, yoksa (ör. son tarihi geçmiş) veritabanından çeker. */
export function useEvent(id: string): { event: EventRow | null; loading: boolean } {
  const [state, setState] = useState<{ event: EventRow | null; loading: boolean }>({ event: null, loading: true });
  useEffect(() => {
    let alive = true;
    (async () => {
      const fromCache = current?.find((e) => e.id === id);
      if (fromCache) return alive && setState({ event: fromCache, loading: false });
      const { data } = await supabase.from('events').select(COLUMNS).eq('id', id).maybeSingle();
      if (alive) setState({ event: (data as unknown as EventRow) ?? null, loading: false });
    })();
    return () => {
      alive = false;
    };
  }, [id]);
  return state;
}

/** Paylaşım/iç bağlantılar için etkinlik adresi. */
export const eventHref = (id: string) => `#/etkinlik/${id}`;

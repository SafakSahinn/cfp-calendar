// Başvurusu açık çağrılar: liste, takvim ve detay sayfaları aynı veriyi paylaşır (oturum başına bir kez yüklenir).

import { useEffect, useState } from 'react';
import { supabase, type EventRow } from './supabase';

/** Türkiye'de düzenlenen etkinlikler: ülke adı veya büyük şehirler (kaynaklarda yer serbest metin). */
export const IN_TURKEY = /t[üu]rk[iı]ye|turkey|turkiye|[iİı]stanbul|ankara|[iİı]zmir|antalya|bursa|konya|eski[sş]ehir|trabzon|kayseri|samsun|adana|mersin|gaziantep|denizli|edirne|mu[gğ]la|bodrum|kapadokya|cappadocia|nev[sş]ehir|sakarya|kocaeli|erzurum|malatya|diyarbak[iı]r|[cç]anakkale/i;

/** Çevrim içi / hibrit etkinlikler. */
export const IS_ONLINE = /virtual|online|hybrid|çevrim ?içi|webinar|remote/i;

let cache: Promise<EventRow[]> | null = null;

async function loadOpenEvents(): Promise<EventRow[]> {
  const all: EventRow[] = [];
  // Supabase sayfa başına en fazla 1000 satır döndürür
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .gt('submission_deadline', new Date().toISOString())
      .order('submission_deadline', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as EventRow[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

/** Çıkışta veya veri değişince önbelleği temizlemek için. */
export function invalidateEvents() {
  cache = null;
}

export function useOpenEvents(): EventRow[] | null {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    cache ??= loadOpenEvents().catch((e) => {
      cache = null;
      throw e;
    });
    cache.then((rows) => alive && setEvents(rows)).catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, []);
  return events;
}

/** Tek etkinlik: önce önbellekteki açık çağrılara bakar, yoksa (ör. son tarihi geçmiş) veritabanından çeker. */
export function useEvent(id: string): { event: EventRow | null; loading: boolean } {
  const [state, setState] = useState<{ event: EventRow | null; loading: boolean }>({ event: null, loading: true });
  useEffect(() => {
    let alive = true;
    (async () => {
      const fromCache = cache ? (await cache.catch(() => [])).find((e) => e.id === id) : undefined;
      if (fromCache) return alive && setState({ event: fromCache, loading: false });
      const { data } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
      if (alive) setState({ event: (data as EventRow) ?? null, loading: false });
    })();
    return () => {
      alive = false;
    };
  }, [id]);
  return state;
}

/** Paylaşım/iç bağlantılar için etkinlik adresi. */
export const eventHref = (id: string) => `#/etkinlik/${id}`;

// 1. adım: kaynaklardan veri çek, birleştir, veritabanına yaz.

import { chunks, db } from './db.ts';
import { fetchCcf } from './sources/ccf.ts';
import { fetchComsoc } from './sources/comsoc.ts';
import { fetchWikiCfp } from './sources/wikicfp.ts';
import { existsSync, readFileSync } from 'node:fs';
import { buildIndex, loadCore, matchCore } from './core.ts';
import { buildSjrIndex, matchJournal, type SjrData } from './sjr.ts';
import { merge } from './merge.ts';
import { qualityFlags } from './quality.ts';
import { runStats } from './runStats.ts';
import type { NormalizedEvent } from './types.ts';

const COMPARE_KEYS = ['title', 'url', 'location', 'submission_deadline', 'abstract_deadline', 'event_start', 'event_end'] as const;

export async function runFetch(log: (msg: string) => void = console.log): Promise<void> {
  const results = await Promise.allSettled([fetchCcf(), fetchWikiCfp(log), fetchComsoc(log)]);
  const names = ['ccf-deadlines', 'WikiCFP', 'IEEE ComSoc'];
  const all: NormalizedEvent[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      log(`${names[i]}: ${r.value.length} kayıt`);
      runStats.sources = { ...(runStats.sources as object), [names[i]]: r.value.length };
      all.push(...r.value);
    } else {
      log(`${names[i]} HATA: ${r.reason}`);
      runStats.sources = { ...(runStats.sources as object), [names[i]]: 'HATA' };
    }
  });
  if (all.length === 0) throw new Error('Hiçbir kaynaktan veri alınamadı');

  const merged = merge(all);

  // CORE derecesi: derecesi olmayan konferanslara (kısaltma + başlık eşleşmesiyle)
  const core = buildIndex(await loadCore(log));
  let ranked = 0;
  for (const e of merged) {
    if (e.kind === 'journal' || e.ranks.core) continue;
    const hit = matchCore(core, e.acronym, e.title);
    if (hit) {
      e.ranks = { ...e.ranks, core: hit.rank };
      e.flags = qualityFlags(e); // dereceli konferans "dikkat" işareti almaz
      ranked++;
    }
  }
  log(`CORE: ${ranked} konferansa derece eşleşti`);

  // SJR çeyreği: dergi çağrılarına (dergi adı başlıkta veya "Dergi: Özel sayı" biçiminde)
  const sjrFile = new URL('../data/sjr.json', import.meta.url);
  if (existsSync(sjrFile)) {
    const sjr = JSON.parse(readFileSync(sjrFile, 'utf8')) as SjrData;
    const idx = buildSjrIndex(sjr.journals);
    let q = 0;
    for (const e of merged) {
      if (e.kind !== 'journal') continue;
      const hit = matchJournal(idx, e.title.split(':')[0], e.acronym, e.title);
      if (hit) {
        e.ranks = { ...e.ranks, sjr: hit.quartile };
        e.flags = qualityFlags(e);
        q++;
      }
    }
    log(`SJR ${sjr.year}: ${q} dergi çağrısına çeyrek eşleşti`);
    runStats.sjr_ranked = q;
  }
  runStats.core_ranked = ranked;
  runStats.events_total = merged.length;
  log(`Birleştirme sonrası: ${merged.length} etkinlik`);

  const now = new Date().toISOString();
  let changed = 0;
  for (const batch of chunks(merged, 300)) {
    const { data: existing, error } = await db
      .from('events')
      .select(`dedupe_key, ${COMPARE_KEYS.join(', ')}`)
      .in('dedupe_key', batch.map((e) => e.dedupe_key));
    if (error) throw new Error(error.message);
    const rowsPrev = (existing ?? []) as unknown as Record<string, unknown>[];
    const byKey = new Map(rowsPrev.map((e) => [e.dedupe_key, e]));

    const rows = batch.map((e) => {
      const prev = byKey.get(e.dedupe_key) as Record<string, unknown> | undefined;
      const differs =
        !prev ||
        COMPARE_KEYS.some((k) => {
          const a = prev[k] ?? null;
          const b = e[k] ?? null;
          // timestamptz "+00:00" vs ISO "Z" farkını yok say
          return a !== b && !(a && b && new Date(a as string).getTime() === new Date(b as string).getTime());
        });
      if (differs) changed++;
      return { ...e, last_seen_at: now, ...(differs ? { updated_at: now } : {}) };
    });

    // updated_at bazı satırlarda yok: PostgREST tek seferde homojen kolon ister, iki gruba ayır.
    for (const group of [rows.filter((r) => 'updated_at' in r), rows.filter((r) => !('updated_at' in r))]) {
      if (group.length === 0) continue;
      const { error: upErr } = await db.from('events').upsert(group, { onConflict: 'dedupe_key' });
      if (upErr) throw new Error(upErr.message);
    }
  }
  log(`Veritabanı: ${changed} yeni/değişen etkinlik`);
  runStats.events_changed = changed;
}

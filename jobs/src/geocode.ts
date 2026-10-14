// Harita için: etkinlik konum metnini ("Bordeaux, France") koordinata çevirir.
// OpenStreetMap Nominatim kullanım kurallarına uygun: saniyede en fazla 1 istek, tanımlayıcı User-Agent,
// sonuçlar geocache tablosunda saklanır (aynı yer bir daha sorulmaz; bulunamayanlar 30 gün sonra yeniden denenir).

import { chunks, db, selectAll } from './db.ts';
import { countryCodeOf, geoQuery } from './geoQuery.ts';
import { runStats } from './runStats.ts';

export { geoQuery };

const UA = 'CFP-Calendar/1.0 (+https://github.com/SafakSahinn/cfp-calendar)';
const PER_RUN = 200;
const RETRY_DAYS = 30;

/** Yer metninde ülke varsa arama o ülkeyle sınırlanır ("Cambridge, UK" ABD'deki Cambridge'e gitmesin). */
async function lookup(q: string): Promise<{ lat: number; lng: number; display_name: string } | null> {
  const cc = countryCodeOf(q);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=${encodeURIComponent(q)}${cc ? `&countrycodes=${cc.toLowerCase()}` : ''}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return rows[0] ? { lat: +rows[0].lat, lng: +rows[0].lon, display_name: rows[0].display_name } : null;
}

export async function runGeocode(log: (m: string) => void = console.log): Promise<void> {
  const now = new Date().toISOString();
  const events = await selectAll<{ id: string; location: string | null; lat: number | null }>((from, to) =>
    db.from('events').select('id, location, lat').neq('kind', 'journal').not('location', 'is', null)
      .gt('submission_deadline', now).range(from, to),
  );
  // --- Denetim: daha önce bulunmuş konumların ülkesi yer metniyle tutuyor mu? Tutmayan silinip yeniden aranır.
  const { data: cachedOk } = await db.from('geocache').select('query, display_name').eq('ok', true);
  const wrong = new Set<string>();
  for (const c of cachedOk ?? []) {
    const want = countryCodeOf(c.query);
    const got = countryCodeOf((c.display_name ?? '').split(',').at(-1) ?? '');
    if (want && got && want !== got) wrong.add(c.query);
  }
  if (wrong.size > 0) {
    for (const keys of chunks([...wrong], 200)) await db.from('geocache').delete().in('query', keys);
    const reset = events.filter((e) => e.lat != null && wrong.has(geoQuery(e.location) ?? '')).map((e) => e.id);
    for (const ids of chunks(reset, 200)) await db.from('events').update({ lat: null, lng: null }).in('id', ids);
    for (const e of events) if (reset.includes(e.id)) e.lat = null;
    log(`Konum denetimi: ülkesi tutmayan ${wrong.size} yer (${[...wrong].slice(0, 10).join(' | ')}) silindi, ${reset.length} etkinlik yeniden aranacak`);
  }

  const byQuery = new Map<string, string[]>();
  for (const e of events) {
    if (e.lat != null) continue;
    const q = geoQuery(e.location);
    if (q) byQuery.set(q, [...(byQuery.get(q) ?? []), e.id]);
  }
  if (byQuery.size === 0) return log('Konum: çözümlenecek yer yok');

  const cache = new Map<string, { lat: number | null; lng: number | null; ok: boolean; looked_up_at: string }>();
  for (const batch of chunks([...byQuery.keys()], 200)) {
    const { data } = await db.from('geocache').select('query, lat, lng, ok, looked_up_at').in('query', batch);
    for (const r of data ?? []) cache.set(r.query, r);
  }

  let looked = 0, found = 0, applied = 0;
  for (const [q, ids] of byQuery) {
    let hit = cache.get(q);
    const stale = hit && !hit.ok && Date.now() - new Date(hit.looked_up_at).getTime() > RETRY_DAYS * 86_400_000;
    if ((!hit || stale) && looked < PER_RUN) {
      try {
        const r = await lookup(q);
        looked++;
        hit = { lat: r?.lat ?? null, lng: r?.lng ?? null, ok: !!r, looked_up_at: new Date().toISOString() };
        await db.from('geocache').upsert({ query: q, ...hit, display_name: r?.display_name ?? null });
        if (r) found++;
      } catch (e) {
        log(`  konum "${q}": ${e}`);
        break; // servis sorun çıkarıyorsa bu çalışmada zorlamayalım
      }
      await new Promise((res) => setTimeout(res, 1100));
    }
    if (hit?.ok) {
      await db.from('events').update({ lat: hit.lat, lng: hit.lng }).in('id', ids);
      applied += ids.length;
    }
  }
  log(`Konum: ${byQuery.size} yer bekliyordu, ${looked} soruldu (${found} bulundu), ${applied} etkinliğe koordinat yazıldı`);
  runStats.geocoded = applied;
}

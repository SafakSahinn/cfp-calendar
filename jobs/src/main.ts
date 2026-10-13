// GitHub Actions tarafından 12 saatte bir çalıştırılır.
//   npm run job            → çek + dağıt + e-posta
//   npm run job -- fetch   → sadece çek
//   npm run job -- dispatch→ sadece dağıt
//   npm run job -- email   → sadece e-posta özetleri
// Her çalışma sync_runs tablosuna kaydedilir (yönetim paneli → Sistem durumu); yöneticiye günlük rapor / hata uyarısı gider.

import { existsSync, readFileSync } from 'node:fs';
import { KNOWN_PERIODS } from '../../shared/tubitak.ts';
import { adminReport } from './adminReport.ts';
import { computeMaintenance, type MaintenanceItem } from './maintenance.ts';
import { db } from './db.ts';
import { runDispatch } from './dispatch.ts';
import { runEmails } from './email.ts';
import { runFetch } from './fetch.ts';
import { runGeocode } from './geocode.ts';
import { runStats } from './runStats.ts';

const step = process.argv[2] ?? 'all';
const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

const { data: run } = await db
  .from('sync_runs')
  .insert({ trigger: process.env.GITHUB_EVENT_NAME ?? 'manual', stats: { step } })
  .select('id')
  .single();

let ok = true;
let error: string | undefined;
try {
  if (step === 'all' || step === 'fetch') await runFetch(log);
  if (step === 'all' || step === 'fetch' || step === 'geocode') await runGeocode(log).catch((e) => log(`Konum adımı atlandı: ${e}`));
  if (step === 'all' || step === 'dispatch') await runDispatch(log);
  if (step === 'all' || step === 'email') await runEmails(log);
} catch (e) {
  ok = false;
  error = e instanceof Error ? e.message : String(e);
  console.error(e);
}

if (run) {
  await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ok, error: error ?? null, stats: { step, ...runStats } }).eq('id', run.id);
}
// Bakım hatırlatmaları (SCImago, TÜBİTAK, CORE) → panel + rapor
let maintenance: MaintenanceItem[] = [];
try {
  const sjrFile = new URL('../data/sjr.json', import.meta.url);
  const sjr = existsSync(sjrFile) ? JSON.parse(readFileSync(sjrFile, 'utf8')) : null;
  maintenance = computeMaintenance({
    now: Date.now(),
    sjr: sjr ? { year: sjr.year, count: sjr.journals.length } : null,
    knownPeriods: KNOWN_PERIODS,
    coreSource: (runStats.core_source as 'live' | 'snapshot' | undefined) ?? null,
  });
  // CORE bilgisi sadece veri çekilen çalışmalarda vardır; yoksa önceki değeri koru
  const { data: prev } = await db.from('app_state').select('value').eq('key', 'maintenance').maybeSingle();
  const prevCore = ((prev?.value as { items?: MaintenanceItem[] } | undefined)?.items ?? []).find((i) => i.key === 'core');
  if (!maintenance.some((i) => i.key === 'core') && prevCore) maintenance.push(prevCore);
  await db.from('app_state').upsert({ key: 'maintenance', value: { items: maintenance }, updated_at: new Date().toISOString() });
} catch (e) {
  log(`Bakım durumu hesaplanamadı: ${e}`);
}

try {
  await adminReport({ ok, error, log, maintenance });
} catch (e) {
  log(`Yönetici raporu gönderilemedi: ${e}`);
}
process.exit(ok ? 0 : 1);

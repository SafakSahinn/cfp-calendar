// GitHub Actions tarafından 12 saatte bir çalıştırılır.
//   npm run job            → çek + dağıt + e-posta
//   npm run job -- fetch   → sadece çek
//   npm run job -- dispatch→ sadece dağıt
//   npm run job -- email   → sadece e-posta özetleri
// Her çalışma sync_runs tablosuna kaydedilir (yönetim paneli → Sistem durumu); yöneticiye günlük rapor / hata uyarısı gider.

import { adminReport } from './adminReport.ts';
import { db } from './db.ts';
import { runDispatch } from './dispatch.ts';
import { runEmails } from './email.ts';
import { runFetch } from './fetch.ts';
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
try {
  await adminReport({ ok, error, log });
} catch (e) {
  log(`Yönetici raporu gönderilemedi: ${e}`);
}
process.exit(ok ? 0 : 1);

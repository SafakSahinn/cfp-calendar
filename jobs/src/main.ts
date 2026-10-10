// GitHub Actions tarafından 12 saatte bir çalıştırılır.
//   npm run job            → çek + dağıt
//   npm run job -- fetch   → sadece çek
//   npm run job -- dispatch→ sadece dağıt

import { runDispatch } from './dispatch.ts';
import { runFetch } from './fetch.ts';

const step = process.argv[2] ?? 'all';
const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

try {
  if (step === 'all' || step === 'fetch') await runFetch(log);
  if (step === 'all' || step === 'dispatch') await runDispatch(log);
} catch (e) {
  console.error(e);
  process.exit(1);
}

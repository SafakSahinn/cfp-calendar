import { createClient } from '@supabase/supabase-js';
import type { CalendarEnv } from '../../supabase/functions/_shared/calendar.ts';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Eksik ortam değişkeni: ${name}`);
  return v;
}

export const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

export function calendarEnv(): CalendarEnv {
  return {
    TOKEN_ENC_KEY: env('TOKEN_ENC_KEY'),
    // Sağlayıcı anahtarları sadece takvimi bağlı kullanıcı varsa gerekir; yoksa token yenileme hata verir.
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
    MS_CLIENT_ID: process.env.MS_CLIENT_ID ?? '',
    MS_CLIENT_SECRET: process.env.MS_CLIENT_SECRET ?? '',
    SITE_URL: env('SITE_URL'),
  };
}

/** Supabase tek sorguda en fazla 1000 satır döndürür; sayfalayarak hepsini çeker. */
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

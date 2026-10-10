// Edge Function ortak yardımcıları (sadece Deno).
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import type { CalendarEnv } from './calendar.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Eksik ortam değişkeni: ${name}`);
  return v;
}

export function calendarEnv(): CalendarEnv {
  return {
    TOKEN_ENC_KEY: env('TOKEN_ENC_KEY'),
    // Sağlayıcı anahtarları isteğe bağlı: sadece o sağlayıcının takvimi bağlıysa kullanılır.
    GOOGLE_CLIENT_ID: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
    GOOGLE_CLIENT_SECRET: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
    MS_CLIENT_ID: Deno.env.get('MS_CLIENT_ID') ?? '',
    MS_CLIENT_SECRET: Deno.env.get('MS_CLIENT_SECRET') ?? '',
    SITE_URL: env('SITE_URL'),
  };
}

export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

/** İstekteki JWT'den kullanıcıyı doğrular. */
export async function requireUser(req: Request, admin: SupabaseClient): Promise<User | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

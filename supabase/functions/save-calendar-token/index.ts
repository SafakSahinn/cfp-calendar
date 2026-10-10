// Kullanıcı "Takvimi bağla" ile Google/Microsoft'tan döndüğünde, oturumdaki provider token'larını
// şifreleyip saklar. Refresh token sadece bu anda elde edilebildiği için istemci hemen bu fonksiyonu çağırır.
//
// POST { provider, provider_token, provider_refresh_token }  |  POST { action: "disconnect" }

import { encrypt } from '../_shared/crypto.ts';
import { disconnect } from '../_shared/calendar.ts';
import { adminClient, corsHeaders, env, json, requireUser } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const admin = adminClient();
  const user = await requireUser(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));

  if (body.action === 'disconnect') {
    await disconnect(admin, user.id);
    return json({ ok: true });
  }

  const provider = body.provider;
  if (provider !== 'google' && provider !== 'microsoft') return json({ error: 'provider' }, 400);
  if (!body.provider_refresh_token) {
    return json({ error: 'no_refresh_token', hint: 'Sağlayıcı refresh token döndürmedi; izin ekranını tekrar onaylayın.' }, 400);
  }

  // Hesap e-postasını sağlayıcıdan al (profilde göstermek için).
  let account: string | null = null;
  try {
    const res =
      provider === 'google'
        ? await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
            headers: { Authorization: `Bearer ${body.provider_token}` },
          })
        : await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
            headers: { Authorization: `Bearer ${body.provider_token}` },
          });
    if (res.ok) {
      const info = await res.json();
      account = info.email ?? info.mail ?? info.userPrincipalName ?? null;
    }
  } catch {
    // e-posta zorunlu değil
  }

  const key = env('TOKEN_ENC_KEY');
  const { error } = await admin.from('calendar_connections').upsert({
    user_id: user.id,
    provider,
    refresh_token_enc: await encrypt(body.provider_refresh_token, key),
    access_token_enc: body.provider_token ? await encrypt(body.provider_token, key) : null,
    access_expires_at: body.provider_token ? new Date(Date.now() + 50 * 60_000).toISOString() : null,
    account_email: account,
    updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: error.message }, 500);

  await admin.from('profiles').update({ calendar_provider: provider, calendar_account: account }).eq('id', user.id);
  return json({ ok: true, provider, account });
});

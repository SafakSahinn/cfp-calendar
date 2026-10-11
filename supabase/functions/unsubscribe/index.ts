// E-postalardaki "bildirimleri kapat" bağlantısı. JWT doğrulaması kapalı; tahmin edilemez profiles.email_token ile korunur.
//   GET  ?token=… → bildirimleri kapatır, onay sayfası gösterir
//   POST ?token=… → Gmail/Outlook "tek tıkla abonelikten çık" (RFC 8058, List-Unsubscribe-Post)

import { adminClient, env } from '../_shared/http.ts';

const page = (title: string, body: string, siteUrl: string) => `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#f3f4f8;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111827}
.c{max-width:460px;margin:12vh auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px 28px;text-align:center}
h1{font-size:20px;margin:12px 0 8px}p{color:#4b5563;line-height:1.6;font-size:15px}a{color:#3d5afe}</style></head>
<body><div class="c"><img src="${siteUrl}logo-96.png" width="48" height="48" alt=""><h1>${title}</h1>${body}</div></body></html>`;

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const siteUrl = env('SITE_URL');
  const html = (status: number, title: string, body: string) =>
    new Response(page(title, body, siteUrl), { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  if (!/^[0-9a-f-]{36}$/i.test(token)) return html(404, 'Bağlantı geçersiz', '<p>Bu bağlantı geçerli değil.</p>');

  const { data } = await adminClient()
    .from('profiles')
    .update({ email_notifications: false })
    .eq('email_token', token)
    .select('id');
  if (!data?.length) return html(404, 'Bağlantı geçersiz', '<p>Bu bağlantı geçerli değil veya hesap silinmiş.</p>');

  if (req.method === 'POST') return new Response('ok');
  return html(
    200,
    'E-posta bildirimleri kapatıldı',
    `<p>Artık size bildirim e-postası göndermeyeceğiz. Site içi mesajlarınız çalışmaya devam eder.</p>
     <p>Fikrinizi değiştirirseniz <a href="${siteUrl}#/profil">profil sayfanızdan</a> yeniden açabilirsiniz.</p>
     <p style="font-size:13px;color:#9ca3af">Email notifications are turned off. You can re-enable them on your profile page.</p>`,
  );
});

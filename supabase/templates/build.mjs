// Supabase Auth e-posta şablonlarını üretir ve (istenirse) Management API ile projeye yükler.
//
//   node supabase/templates/build.mjs            → dist/ altına HTML üretir (önizleme için)
//   node supabase/templates/build.mjs --push     → üretir + SUPABASE_ACCESS_TOKEN / PROJECT_REF ile yükler
//
// Şablonlar Go template sözdizimi kullanır: {{ .ConfirmationURL }}, {{ .Data.full_name }}, {{ .NewEmail }} …
// E-posta istemcileri modern CSS'i desteklemediği için tablo düzeni ve satır içi stil kullanılır.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRAND = 'CFP Calendar';
const ACCENT = '#3d5afe';
const here = dirname(fileURLToPath(import.meta.url));

const greetingTr = '{{ if .Data.full_name }}Merhaba {{ .Data.full_name }},{{ else }}Merhaba,{{ end }}';
const greetingEn = '{{ if .Data.full_name }}Hi {{ .Data.full_name }},{{ else }}Hi,{{ end }}';

/** Ortak e-posta iskeleti. */
function layout({ preheader, icon, titleTr, titleEn, bodyTr, bodyEn, button, url, noteTr, noteEn }) {
  const p = 'margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;';
  const small = 'margin:0;font-size:13px;line-height:1.6;color:#6b7280;';
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${BRAND}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

    <!-- Logo -->
    <tr><td align="center" style="padding:0 0 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:40px;height:40px;"><img src="https://safaksahinn.github.io/cfp-calendar/logo-96.png" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px;"></td>
        <td style="padding-left:10px;font-size:18px;font-weight:700;color:#111827;">${BRAND}</td>
      </tr></table>
    </td></tr>

    <!-- Kart -->
    <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="height:6px;background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:36px 36px 8px;">
          <div style="font-size:40px;line-height:1;margin:0 0 16px;">${icon}</div>
          <h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:#111827;">${titleTr}</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;">${titleEn}</p>
          <p style="${p}">${greetingTr}</p>
          <p style="${p}">${bodyTr}</p>
        </td></tr>

        <!-- Buton -->
        <tr><td align="center" style="padding:8px 36px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:10px;background:${ACCENT};">
              <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${button}</a>
            </td>
          </tr></table>
        </td></tr>

        <!-- İngilizce -->
        <tr><td style="padding:0 36px;">
          <div style="border-top:1px solid #e5e7eb;padding-top:20px;">
            <p style="${small}margin-bottom:8px;"><strong style="color:#374151;">${greetingEn}</strong></p>
            <p style="${small}margin-bottom:20px;">${bodyEn}</p>
          </div>
        </td></tr>

        <!-- Yedek bağlantı -->
        <tr><td style="padding:0 36px 32px;">
          <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
            <p style="${small}margin-bottom:6px;">Buton çalışmıyorsa bu bağlantıyı tarayıcınıza yapıştırın · If the button doesn't work, paste this link into your browser:</p>
            <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${url}" style="color:${ACCENT};">${url}</a></p>
          </div>
        </td></tr>
      </table>
    </td></tr>

    <!-- Alt bilgi -->
    <tr><td align="center" style="padding:24px 16px 0;">
      <p style="${small}">${noteTr}</p>
      <p style="${small}">${noteEn}</p>
      <p style="${small}margin-top:12px;">
        <a href="{{ .SiteURL }}" style="color:#6b7280;">${BRAND}</a> · Bilgisayar ve elektrik-elektronik mühendisliği çağrıları
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>
`;
}

const templates = {
  confirmation: {
    subject: `${BRAND} · E-posta adresinizi onaylayın / Confirm your email`,
    html: layout({
      preheader: 'Hesabınızı etkinleştirmek için e-posta adresinizi onaylayın.',
      icon: '✉️',
      titleTr: 'E-posta adresinizi onaylayın',
      titleEn: 'Confirm your email address',
      bodyTr:
        'CFP Calendar’a hoş geldiniz! Hesabınızı etkinleştirmek için aşağıdaki butona tıklayın. Ardından ilgilendiğiniz konferans ve dergi çağrılarını takip edebilir, başvuru tarihlerini takviminize otomatik ekleyebilirsiniz.',
      bodyEn:
        'Welcome to CFP Calendar! Click the button above to activate your account. You can then follow conference and journal calls and have their deadlines added to your calendar automatically.',
      button: 'Hesabımı onayla · Confirm',
      url: '{{ .ConfirmationURL }}',
      noteTr: 'Bu hesabı siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.',
      noteEn: 'If you didn’t create this account, you can safely ignore this email.',
    }),
  },
  recovery: {
    subject: `${BRAND} · Şifre sıfırlama / Reset your password`,
    html: layout({
      preheader: 'Şifrenizi sıfırlamak için bağlantıya tıklayın.',
      icon: '🔑',
      titleTr: 'Şifrenizi sıfırlayın',
      titleEn: 'Reset your password',
      bodyTr: 'Hesabınız için bir şifre sıfırlama isteği aldık. Yeni şifre belirlemek için aşağıdaki butona tıklayın. Bağlantı kısa süre geçerlidir ve yalnızca bir kez kullanılabilir.',
      bodyEn: 'We received a request to reset the password for your account. Click the button above to choose a new one. The link expires soon and can only be used once.',
      button: 'Yeni şifre belirle · Reset password',
      url: '{{ .ConfirmationURL }}',
      noteTr: 'Bu isteği siz yapmadıysanız bu e-postayı yok sayın; şifreniz değişmez.',
      noteEn: 'If you didn’t request this, ignore this email; your password will not change.',
    }),
  },
  email_change: {
    subject: `${BRAND} · Yeni e-posta adresinizi onaylayın / Confirm your new email`,
    html: layout({
      preheader: 'E-posta adresi değişikliğini onaylayın.',
      icon: '🔄',
      titleTr: 'E-posta değişikliğini onaylayın',
      titleEn: 'Confirm your email change',
      bodyTr: 'Hesabınızın e-posta adresini <strong>{{ .Email }}</strong> adresinden <strong>{{ .NewEmail }}</strong> adresine değiştirmek için aşağıdaki butona tıklayın.',
      bodyEn: 'Click the button above to change your account email from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>.',
      button: 'Değişikliği onayla · Confirm change',
      url: '{{ .ConfirmationURL }}',
      noteTr: 'Bu değişikliği siz istemediyseniz bu e-postayı yok sayın.',
      noteEn: 'If you didn’t request this change, ignore this email.',
    }),
  },
};

// --- Üret ---------------------------------------------------------------
const out = join(here, 'dist');
mkdirSync(out, { recursive: true });
for (const [name, t] of Object.entries(templates)) writeFileSync(join(out, `${name}.html`), t.html);
console.log(`Şablonlar üretildi: ${Object.keys(templates).join(', ')} → ${out}`);

// --- Yükle --------------------------------------------------------------
if (process.argv.includes('--push')) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.PROJECT_REF;
  if (!token || !ref) throw new Error('SUPABASE_ACCESS_TOKEN ve PROJECT_REF gerekli');

  const body = {};
  for (const [name, t] of Object.entries(templates)) {
    body[`mailer_subjects_${name}`] = t.subject;
    body[`mailer_templates_${name}_content`] = t.html;
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase Management API ${res.status}: ${await res.text()}`);
  console.log('Şablonlar Supabase projesine yüklendi.');
}

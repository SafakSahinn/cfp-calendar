// Yöneticiye sistem raporu (ADMIN_EMAIL): günde bir kez (Türkiye saatine göre o günün ilk çalışmasında) özet,
// veri güncellemesi başarısız olursa hemen uyarı. SMTP_USER/SMTP_PASS yoksa sessizce atlanır (panel yine gösterir).

import nodemailer from 'nodemailer';
import { db } from './db.ts';

const BRAND = 'CFP Calendar';
const DAY = 86_400_000;

const trDate = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(d); // YYYY-MM-DD
const trTime = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function count(table: string, filter?: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = db.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

async function authUserStats(): Promise<{ total: number; new24h: number; active7d: number }> {
  let total = 0, new24h = 0, active7d = 0;
  const now = Date.now();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      total++;
      if (now - new Date(u.created_at).getTime() < DAY) new24h++;
      if (u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 7 * DAY) active7d++;
    }
    if (data.users.length < 1000) break;
  }
  return { total, new24h, active7d };
}

export async function adminReport(opts: { ok: boolean; error?: string; log: (m: string) => void }) {
  const admin = process.env.ADMIN_EMAIL;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!admin || !user || !pass) return;

  const today = trDate();
  const { data: state } = await db.from('app_state').select('value').eq('key', 'admin_report').maybeSingle();
  const sentToday = (state?.value as { date?: string } | undefined)?.date === today;
  if (opts.ok && sentToday) return; // başarılı çalışmada günde tek rapor

  const since = new Date(Date.now() - DAY).toISOString();
  const [{ data: runs }, users, groups, members, submissions, feedbackNew, calendar, openEvents] = await Promise.all([
    db.from('sync_runs').select('started_at, finished_at, ok, stats, error, trigger').gte('started_at', since).order('started_at'),
    authUserStats(),
    count('groups'),
    count('group_members'),
    count('submissions'),
    count('feedback', (q) => q.eq('status', 'new')),
    count('calendar_connections'),
    count('events', (q) => q.gt('submission_deadline', new Date().toISOString())),
  ]);

  const runRows = (runs ?? []).map((r) => {
    const s = (r.stats ?? {}) as Record<string, unknown>;
    const sources = Object.entries((s.sources ?? {}) as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(', ');
    return `<tr><td>${trTime(r.started_at)}</td><td>${r.ok === null ? '⏳' : r.ok ? '✅' : '❌'}</td>
      <td>${esc(sources || '—')}</td><td>${s.events_changed ?? '—'}</td><td>${s.notifications ?? '—'}</td>
      <td>${r.error ? esc(String(r.error).slice(0, 200)) : ''}</td></tr>`;
  }).join('');

  const tiles: [string, string | number][] = [
    ['Üye', `${users.total} (son 24 saatte +${users.new24h})`],
    ['Aktif (7 gün)', users.active7d],
    ['Grup', `${groups} (${members} üyelik)`],
    ['Başvuru kaydı', submissions],
    ['Takvim bağlı', calendar],
    ['Açık çağrı', openEvents],
    ['Yeni geri bildirim', feedbackNew],
  ];

  const subject = opts.ok
    ? `${BRAND} · Günlük sistem raporu (${today}) · ${users.total} üye`
    : `⚠️ ${BRAND} · Veri güncellemesi BAŞARISIZ`;
  const html = `<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#f3f4f8;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111827">
<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:24px">
<h2 style="margin:0 0 4px">${opts.ok ? 'Günlük sistem raporu' : '⚠️ Veri güncellemesi başarısız'}</h2>
<p style="margin:0 0 16px;color:#6b7280">${esc(today)}</p>
${opts.ok ? '' : `<p style="padding:10px 12px;border-radius:8px;background:#fdecec;color:#b91c1c">${esc(opts.error ?? 'Bilinmeyen hata')}</p>
<p style="color:#374151">Ayrıntılar: GitHub → Actions → “Veri çek ve dağıt”. Site çalışmaya devam ediyor; sadece veriler güncellenmedi.</p>`}
<table style="width:100%;border-collapse:collapse;margin:8px 0 16px">${tiles.map(([k, v]) =>
    `<tr><td style="padding:6px 0;color:#6b7280">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600">${v}</td></tr>`).join('')}</table>
<h3 style="margin:16px 0 8px;font-size:15px">Son 24 saatteki veri güncellemeleri</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px" cellpadding="6">
<tr style="background:#f3f4f8;text-align:left"><th>Saat (TSİ)</th><th></th><th>Kaynaklar</th><th>Değişen</th><th>Bildirim</th><th>Hata</th></tr>
${runRows || '<tr><td colspan="6" style="color:#6b7280">Kayıt yok</td></tr>'}
</table>
<p style="margin-top:18px"><a href="${esc(process.env.SITE_URL ?? '')}#/yonetim" style="color:#3d5afe">Yönetim paneline git →</a></p>
</div></body></html>`;

  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  await transport.sendMail({ from: { name: BRAND, address: user }, to: admin, subject, html });
  if (opts.ok) await db.from('app_state').upsert({ key: 'admin_report', value: { date: today }, updated_at: new Date().toISOString() });
  opts.log(`Yönetici raporu gönderildi (${opts.ok ? 'günlük' : 'hata uyarısı'})`);
}

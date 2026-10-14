// Yöneticiye sistem raporu (ADMIN_EMAIL): günde bir kez (Türkiye saatine göre o günün ilk çalışmasında) özet,
// veri güncellemesi başarısız olursa hemen uyarı. SMTP_USER/SMTP_PASS yoksa sessizce atlanır (panel yine gösterir).

import nodemailer from 'nodemailer';
import { db } from './db.ts';
import { renderAdminReport, type ReportRun } from './adminReportRender.ts';
import type { MaintenanceItem } from './maintenance.ts';

const BRAND = 'CFP Calendar';
const DAY = 86_400_000;

const trDate = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(d); // YYYY-MM-DD

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

export async function adminReport(opts: { ok: boolean; error?: string; log: (m: string) => void; maintenance: MaintenanceItem[] }) {
  const admin = process.env.ADMIN_EMAIL;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!admin || !user || !pass) return;

  const today = trDate();
  const { data: state } = await db.from('app_state').select('value').eq('key', 'admin_report').maybeSingle();
  const sentToday = (state?.value as { date?: string } | undefined)?.date === today;
  if (opts.ok && sentToday) return; // başarılı çalışmada günde tek rapor

  const since = new Date(Date.now() - DAY).toISOString();
  const [{ data: runs }, users, groups, members, submissions, feedbackNew, calendar, openEvents, avatarsPending] = await Promise.all([
    db.from('sync_runs').select('started_at, finished_at, ok, stats, error, trigger').gte('started_at', since).order('started_at'),
    authUserStats(),
    count('groups'),
    count('group_members'),
    count('submissions'),
    count('feedback', (q) => q.eq('status', 'new')),
    count('calendar_connections'),
    count('events', (q) => q.gt('submission_deadline', new Date().toISOString())),
    count('profiles', (q) => q.eq('avatar_status', 'pending')),
  ]);

  const { subject, html } = renderAdminReport({
    ok: opts.ok, error: opts.error, date: today, siteUrl: process.env.SITE_URL ?? '', users, groups, members,
    submissions, calendar, openEvents, feedbackNew, avatarsPending, runs: (runs ?? []) as ReportRun[], maintenance: opts.maintenance,
  });

  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  await transport.sendMail({ from: { name: BRAND, address: user }, to: admin, subject, html });
  if (opts.ok) await db.from('app_state').upsert({ key: 'admin_report', value: { date: today }, updated_at: new Date().toISOString() });
  opts.log(`Yönetici raporu gönderildi (${opts.ok ? 'günlük' : 'hata uyarısı'})`);
}

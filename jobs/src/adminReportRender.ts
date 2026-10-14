// Yönetici raporu e-postasının şablonu (saf fonksiyon; önizlenebilir ve test edilebilir).
// Üye e-postalarıyla aynı görsel dil: logo, renkli şerit, kutucuklar, tablo. E-posta istemcileri için tablo düzeni.

import type { MaintenanceItem } from './maintenance.ts';

const BRAND = 'CFP Calendar';
const ACCENT = '#3d5afe';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface ReportRun {
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  trigger: string | null;
  error: string | null;
  stats: Record<string, unknown>;
}

export interface ReportData {
  ok: boolean;
  error?: string;
  date: string; // YYYY-MM-DD (TSİ)
  siteUrl: string;
  users: { total: number; new24h: number; active7d: number };
  groups: number;
  members: number;
  submissions: number;
  calendar: number;
  openEvents: number;
  feedbackNew: number;
  /** Onay bekleyen profil fotoğrafı */
  avatarsPending?: number;
  runs: ReportRun[];
  maintenance: MaintenanceItem[];
}

const trTime = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const trLongDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });

const LEVEL = {
  todo: { label: 'Yapılacak', color: '#b91c1c', bg: '#fdecec' },
  warn: { label: 'Takip et', color: '#b45309', bg: '#fef3c7' },
  ok: { label: 'Güncel', color: '#15803d', bg: '#dcfce7' },
} as const;

function tile(label: string, value: string | number, sub?: string): string {
  return `<td width="50%" style="padding:6px;vertical-align:top;">
  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;">
    <div style="font-size:12px;color:#6b7280;">${esc(label)}</div>
    <div style="font-size:24px;font-weight:700;color:#111827;line-height:1.3;">${esc(String(value))}</div>
    ${sub ? `<div style="font-size:12px;color:#6b7280;">${esc(sub)}</div>` : ''}
  </div>
</td>`;
}

export function renderAdminReport(d: ReportData): { subject: string; html: string } {
  const failed = !d.ok;
  const todo = d.maintenance.filter((m) => m.level !== 'ok').length;
  const subject = failed
    ? `⚠️ ${BRAND} · Veri güncellemesi BAŞARISIZ`
    : `${BRAND} · Günlük rapor · ${d.users.total} üye${todo ? ` · ${todo} bakım hatırlatması` : ''}`;

  const tiles: [string, string | number, string?][] = [
    ['Üye', d.users.total, `son 24 saatte +${d.users.new24h}`],
    ['Aktif (7 gün)', d.users.active7d],
    ['Grup', d.groups, `${d.members} üyelik`],
    ['Başvuru kaydı', d.submissions],
    ['Takvim bağlı', d.calendar],
    ['Açık çağrı', d.openEvents],
    ['Yeni geri bildirim', d.feedbackNew, d.feedbackNew ? 'panelde yanıt bekliyor' : undefined],
    ['Onay bekleyen fotoğraf', d.avatarsPending ?? 0, d.avatarsPending ? 'Yönetim → Onaylar' : undefined],
  ];
  const tileRows: string[] = [];
  for (let i = 0; i < tiles.length; i += 2) {
    tileRows.push(`<tr>${tile(...tiles[i])}${tiles[i + 1] ? tile(...tiles[i + 1]) : '<td width="50%"></td>'}</tr>`);
  }

  const maint = d.maintenance.map((m) => {
    const l = LEVEL[m.level];
    return `<tr><td style="padding:0 0 8px;">
  <div style="border-left:4px solid ${l.color};background:${m.level === 'ok' ? '#f9fafb' : l.bg};border-radius:0 10px 10px 0;padding:10px 12px;">
    <span style="display:inline-block;padding:1px 8px;border-radius:999px;background:#ffffff;color:${l.color};font-size:11px;font-weight:700;">${l.label}</span>
    <strong style="font-size:14px;color:#111827;margin-left:6px;">${esc(m.title)}</strong>
    <div style="font-size:13px;color:#4b5563;margin-top:4px;line-height:1.5;">${esc(m.detail)}</div>
  </div>
</td></tr>`;
  }).join('\n');

  const runRows = d.runs.map((r, i) => {
    const s = r.stats ?? {};
    const src = Object.entries((s.sources ?? {}) as Record<string, unknown>).map(([k, v]) => `${k} ${v}`).join(' · ');
    const secs = r.finished_at ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) : null;
    const status = r.ok === null ? '⏳' : r.ok ? '✅' : '❌';
    return `<tr style="background:${i % 2 ? '#f9fafb' : '#ffffff'};">
  <td style="padding:8px;white-space:nowrap;">${trTime(r.started_at)}<div style="color:#9ca3af;font-size:11px;">${r.trigger === 'schedule' ? 'otomatik' : 'elle'}</div></td>
  <td style="padding:8px;text-align:center;">${status}</td>
  <td style="padding:8px;white-space:nowrap;">${secs !== null ? `${Math.floor(secs / 60)} dk ${secs % 60} sn` : '—'}</td>
  <td style="padding:8px;color:#4b5563;">${esc(src || '—')}${r.error ? `<div style="color:#b91c1c;margin-top:2px;">${esc(r.error.slice(0, 160))}</div>` : ''}</td>
  <td style="padding:8px;text-align:right;">${esc(String(s.events_changed ?? '—'))}</td>
  <td style="padding:8px;text-align:right;">${esc(String(s.notifications ?? '—'))}</td>
</tr>`;
  }).join('\n');

  const section = (title: string) =>
    `<p style="margin:22px 0 10px;font-size:13px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:.03em;">${title}</p>`;

  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${BRAND}</title></head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8;"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">
  <tr><td align="center" style="padding:0 0 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${esc(d.siteUrl)}logo-96.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px;"></td>
      <td style="padding-left:10px;font-size:18px;font-weight:700;color:#111827;">${BRAND} <span style="font-weight:400;color:#6b7280;">· Yönetim</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="height:6px;background:${failed ? '#dc2626' : ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:26px 26px 6px;">
        <h1 style="margin:0;font-size:22px;color:#111827;">${failed ? '⚠️ Veri güncellemesi başarısız' : 'Günlük sistem raporu'}</h1>
        <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${esc(trLongDate(d.date))}</p>
        ${failed
          ? `<div style="margin-top:14px;padding:12px 14px;border-radius:10px;background:#fdecec;color:#b91c1c;font-size:14px;">${esc(d.error ?? 'Bilinmeyen hata')}</div>
             <p style="margin:10px 0 0;font-size:13px;color:#4b5563;">Site çalışmaya devam ediyor; yalnızca veriler güncellenmedi. Ayrıntılar: GitHub → Actions → “Veri çek ve dağıt”.</p>`
          : `<p style="margin:12px 0 0;"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:13px;font-weight:600;">✅ Son 24 saatteki güncellemeler başarılı</span></p>`}
      </td></tr>
      <tr><td style="padding:6px 20px 0;">
        ${section('Genel durum').replace('margin:22px 0 10px', 'margin:16px 6px 4px')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tileRows.join('\n')}</table>
      </td></tr>
      ${d.maintenance.length ? `<tr><td style="padding:0 26px;">
        ${section('🛠️ Bakım')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${maint}</table>
      </td></tr>` : ''}
      <tr><td style="padding:0 26px;">
        ${section('Son 24 saatteki veri güncellemeleri')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:12px;color:#111827;">
          <tr style="background:#f3f4f8;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">
            <th style="padding:8px;">Saat (TSİ)</th><th style="padding:8px;"></th><th style="padding:8px;">Süre</th><th style="padding:8px;">Kaynaklar</th><th style="padding:8px;text-align:right;">Değişen</th><th style="padding:8px;text-align:right;">Bildirim</th>
          </tr>
          ${runRows || '<tr><td colspan="6" style="padding:10px;color:#6b7280;">Bu aralıkta kayıt yok</td></tr>'}
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 26px 28px;">
        <a href="${esc(d.siteUrl)}#/yonetim" style="display:inline-block;padding:12px 28px;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Yönetim paneline git</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:18px 16px 0;">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">Bu e-posta yalnızca site yöneticisine gönderilir: günde bir rapor, güncelleme başarısız olursa anında uyarı.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>
`;
  return { subject, html };
}

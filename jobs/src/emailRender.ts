// Özet e-postası şablonu (saf fonksiyon; veritabanı veya SMTP gerektirmez, test edilebilir).

type Locale = 'tr' | 'en';
type NotifType = 'submission_open' | 'topic_match' | 'dates_changed' | 'deadline_reminder';

export interface DigestEvent {
  acronym: string | null;
  title: string;
  url: string | null;
  location: string | null;
  submission_deadline: string | null;
  event_start: string | null;
  event_end: string | null;
}

export interface DigestItem {
  type: NotifType;
  payload: { old_deadline?: string };
  event: DigestEvent | null;
}

export const BRAND = 'CFP Calendar';
const ACCENT = '#3d5afe';
const MAX_ITEMS = 25;

const T = {
  tr: {
    labels: {
      submission_open: 'Başvuru açıldı',
      topic_match: 'İlgi alanınızda yeni çağrı',
      dates_changed: 'Son tarih değişti',
      deadline_reminder: 'Son başvuruya 1 haftadan az kaldı',
    },
    icons: { submission_open: '📝', topic_match: '✨', dates_changed: '🔄', deadline_reminder: '⏰' },
    hello: (n: string | null) => (n ? `Merhaba ${n},` : 'Merhaba,'),
    intro: (n: number) => (n === 1 ? 'Takip ettiğiniz çağrılarla ilgili yeni bir bildiriminiz var:' : `Takip ettiğiniz çağrılarla ilgili ${n} yeni bildiriminiz var:`),
    deadline: 'Son başvuru',
    oldDeadline: 'eski',
    event: 'Etkinlik',
    ask: 'İlgileniyor musunuz? Sitede tek tıkla yanıtlayın →',
    more: (n: number) => `…ve ${n} bildirim daha`,
    open: 'Mesajlarımı aç',
    footer: 'Bu e-postayı CFP Calendar hesabınızdaki bildirimler için aldınız.',
    unsubscribe: 'E-posta bildirimlerini kapat',
    subjectMany: (n: number) => `${n} yeni bildirim`,
    tz: 'Europe/Istanbul',
    tzLabel: 'TSİ',
    dateLocale: 'tr-TR',
  },
  en: {
    labels: {
      submission_open: 'Submissions are open',
      topic_match: 'New call in your field',
      dates_changed: 'Deadline changed',
      deadline_reminder: 'Less than a week to the deadline',
    },
    icons: { submission_open: '📝', topic_match: '✨', dates_changed: '🔄', deadline_reminder: '⏰' },
    hello: (n: string | null) => (n ? `Hi ${n},` : 'Hi,'),
    intro: (n: number) => (n === 1 ? 'You have a new notification about calls you follow:' : `You have ${n} new notifications about calls you follow:`),
    deadline: 'Deadline',
    oldDeadline: 'was',
    event: 'Event',
    ask: 'Interested? Reply with one click on the site →',
    more: (n: number) => `…and ${n} more`,
    open: 'Open my messages',
    footer: 'You received this email for notifications in your CFP Calendar account.',
    unsubscribe: 'Turn off email notifications',
    subjectMany: (n: number) => `${n} new notifications`,
    tz: 'UTC',
    tzLabel: 'UTC',
    dateLocale: 'en-GB',
  },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmtDeadline(iso: string, l: Locale): string {
  const t = T[l];
  const s = new Date(iso).toLocaleString(t.dateLocale, {
    timeZone: t.tz, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return `${s} ${t.tzLabel}`;
}

function fmtRange(start: string, end: string | null, l: Locale): string {
  const f = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(T[l].dateLocale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
  return end && end !== start ? `${f(start)} – ${f(end)}` : f(start);
}

/** Özet e-postasının konusu, HTML ve düz metin gövdesi. */
export function renderDigest(opts: {
  locale: Locale;
  name: string | null;
  items: DigestItem[];
  siteUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const t = T[opts.locale];
  const items = opts.items.filter((i) => i.event).slice(0, MAX_ITEMS);
  const rest = opts.items.length - items.length;
  const first = items[0];
  const firstName = first.event!.acronym ?? first.event!.title;
  const subject =
    items.length === 1
      ? `${BRAND} · ${t.labels[first.type]}: ${firstName}`
      : `${BRAND} · ${t.subjectMany(opts.items.length)} — ${t.labels[first.type]}: ${firstName}`;
  const inbox = `${opts.siteUrl}#/mesajlar`;

  const cards = items.map((i) => {
    const e = i.event!;
    const lines: string[] = [];
    if (e.submission_deadline) {
      const old = i.type === 'dates_changed' && i.payload.old_deadline
        ? ` <span style="color:#9ca3af;text-decoration:line-through;">${t.oldDeadline}: ${esc(fmtDeadline(i.payload.old_deadline, opts.locale))}</span>`
        : '';
      lines.push(`${t.deadline}: <strong>${esc(fmtDeadline(e.submission_deadline, opts.locale))}</strong>${old}`);
    }
    if (e.event_start) lines.push(`${t.event}: ${esc(fmtRange(e.event_start, e.event_end, opts.locale))}${e.location ? ` · ${esc(e.location)}` : ''}`);
    const name = e.acronym ? `<strong>${esc(e.acronym)}</strong> – ${esc(e.title)}` : `<strong>${esc(e.title)}</strong>`;
    const title = e.url ? `<a href="${esc(e.url)}" style="color:#111827;text-decoration:none;">${name}</a>` : name;
    const ask = i.type === 'topic_match'
      ? `<p style="margin:8px 0 0;font-size:13px;"><a href="${esc(inbox)}" style="color:${ACCENT};">${t.ask}</a></p>` : '';
    return `<tr><td style="padding:0 0 12px;">
  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">
    <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:${ACCENT};text-transform:uppercase;letter-spacing:.03em;">${t.icons[i.type]} ${t.labels[i.type]}</p>
    <p style="margin:0 0 6px;font-size:15px;line-height:1.4;color:#111827;">${title}</p>
    ${lines.map((l) => `<p style="margin:0;font-size:13px;line-height:1.6;color:#4b5563;">${l}</p>`).join('\n    ')}
    ${ask}
  </div>
</td></tr>`;
  });

  const html = `<!doctype html>
<html lang="${opts.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${BRAND}</title></head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8;"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td align="center" style="padding:0 0 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${esc(opts.siteUrl)}logo-96.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px;"></td>
      <td style="padding-left:10px;font-size:18px;font-weight:700;color:#111827;">${BRAND}</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="height:6px;background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:28px 28px 8px;">
        <p style="margin:0 0 6px;font-size:15px;color:#111827;font-weight:600;">${esc(t.hello(opts.name))}</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#374151;">${t.intro(opts.items.length)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${cards.join('\n')}
        </table>
        ${rest > 0 ? `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">${t.more(rest)}</p>` : ''}
      </td></tr>
      <tr><td align="center" style="padding:4px 28px 28px;">
        <a href="${esc(inbox)}" style="display:inline-block;padding:12px 28px;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">${t.open}</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:20px 16px 0;">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">${t.footer}</p>
    <p style="margin:6px 0 0;font-size:12px;"><a href="${esc(opts.unsubscribeUrl)}" style="color:#6b7280;">${t.unsubscribe}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>
`;

  const text = [
    t.hello(opts.name),
    '',
    t.intro(opts.items.length),
    '',
    ...items.flatMap((i) => {
      const e = i.event!;
      return [
        `${t.icons[i.type]} ${t.labels[i.type]}: ${e.acronym ? `${e.acronym} – ` : ''}${e.title}`,
        ...(e.submission_deadline ? [`   ${t.deadline}: ${fmtDeadline(e.submission_deadline, opts.locale)}`] : []),
        ...(e.url ? [`   ${e.url}`] : []),
        '',
      ];
    }),
    ...(rest > 0 ? [t.more(rest), ''] : []),
    `${t.open}: ${inbox}`,
    '',
    `${t.unsubscribe}: ${opts.unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
}

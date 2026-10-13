// Özet e-postası şablonu (saf fonksiyon; veritabanı veya SMTP gerektirmez, test edilebilir).

type Locale = 'tr' | 'en';
type NotifType = 'submission_open' | 'topic_match' | 'dates_changed' | 'deadline_reminder' | 'group_recommendation';

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
  payload: { old_deadline?: string; group_name?: string; by?: string | null };
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
      group_recommendation: 'Grubunuzdan öneri',
    },
    icons: { submission_open: '📝', topic_match: '✨', dates_changed: '🔄', deadline_reminder: '⏰', group_recommendation: '👥' },
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
      group_recommendation: 'Recommended by your group',
    },
    icons: { submission_open: '📝', topic_match: '✨', dates_changed: '🔄', deadline_reminder: '⏰', group_recommendation: '👥' },
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

/** Ortak e-posta iskeleti (logo, kart, buton, abonelikten çık). */
function page(o: { locale: Locale; siteUrl: string; hello: string; intro: string; inner: string; button: { href: string; label: string }; footer: string; unsubscribeUrl: string; unsubLabel: string }): string {
  return `<!doctype html>
<html lang="${o.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${BRAND}</title></head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8;"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td align="center" style="padding:0 0 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${esc(o.siteUrl)}logo-96.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px;"></td>
      <td style="padding-left:10px;font-size:18px;font-weight:700;color:#111827;">${BRAND}</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="height:6px;background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:28px 28px 8px;">
        <p style="margin:0 0 6px;font-size:15px;color:#111827;font-weight:600;">${esc(o.hello)}</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#374151;">${o.intro}</p>
        ${o.inner}
      </td></tr>
      <tr><td align="center" style="padding:4px 28px 28px;">
        <a href="${esc(o.button.href)}" style="display:inline-block;padding:12px 28px;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">${o.button.label}</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:20px 16px 0;">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">${o.footer}</p>
    <p style="margin:6px 0 0;font-size:12px;"><a href="${esc(o.unsubscribeUrl)}" style="color:#6b7280;">${o.unsubLabel}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>
`;

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
    const ask = i.type === 'topic_match' || i.type === 'group_recommendation'
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

  const html = page({
    locale: opts.locale, siteUrl: opts.siteUrl, hello: t.hello(opts.name), intro: t.intro(opts.items.length),
    inner: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">\n${cards.join('\n')}\n</table>` +
      (rest > 0 ? `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">${t.more(rest)}</p>` : ''),
    button: { href: inbox, label: t.open }, footer: t.footer, unsubscribeUrl: opts.unsubscribeUrl, unsubLabel: t.unsubscribe,
  });

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

// ---------------------------------------------------------------------------
// Haftalık özet (pazartesi): takip edilenlerin bu haftaki tarihleri, ilgi alanında yaklaşanlar, grup önerileri
// ---------------------------------------------------------------------------

export interface WeeklyEvent extends DigestEvent {
  id: string;
  abstract_deadline?: string | null;
  ranks?: Record<string, string>;
  is_ieee?: boolean;
}

export interface WeeklyData {
  followedSoon: WeeklyEvent[];
  forYou: WeeklyEvent[];
  groupNews: { group: string; by: string | null; note: string | null; event: WeeklyEvent }[];
}

const W = {
  tr: {
    subject: (n: number) => `${BRAND} · Bu hafta: ${n} son tarih`,
    subjectNone: `${BRAND} · Haftalık özet`,
    intro: 'Bu haftanın özeti:',
    followed: '⏰ Takip ettikleriniz — bu hafta kapanıyor',
    forYou: '✨ İlgi alanlarınızda son tarihi yaklaşanlar',
    groups: '👥 Gruplarınızdan öneriler',
    by: (b: string | null, g: string) => `${b ?? '—'} · ${g}`,
    abstract: 'Özet',
    button: 'Takvimimi aç',
    footer: 'Haftalık özeti profilinizden “Anında” yapabilir veya kapatabilirsiniz.',
  },
  en: {
    subject: (n: number) => `${BRAND} · This week: ${n} deadlines`,
    subjectNone: `${BRAND} · Weekly summary`,
    intro: 'Your weekly summary:',
    followed: '⏰ Calls you follow — closing this week',
    forYou: '✨ Upcoming deadlines in your fields',
    groups: '👥 Recommended by your groups',
    by: (b: string | null, g: string) => `${b ?? '—'} · ${g}`,
    abstract: 'Abstract',
    button: 'Open my calendar',
    footer: 'You can switch the weekly summary to “Instant” or turn it off in your profile.',
  },
};

function weeklyCard(e: WeeklyEvent, l: Locale, siteUrl: string, extra = ''): string {
  const t = T[l];
  const href = `${siteUrl}#/etkinlik/${e.id}`;
  const tags = [
    ...Object.entries(e.ranks ?? {}).map(([k, v]) => `${k.toUpperCase()} ${v}`),
    ...(e.is_ieee ? ['IEEE'] : []),
  ].map((x) => `<span style="display:inline-block;padding:1px 6px;margin-left:4px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:600;">${esc(x)}</span>`).join('');
  const name = e.acronym ? `<strong>${esc(e.acronym)}</strong> – ${esc(e.title)}` : `<strong>${esc(e.title)}</strong>`;
  const lines = [
    e.abstract_deadline && e.abstract_deadline !== e.submission_deadline
      ? `${W[l].abstract}: ${esc(fmtDeadline(e.abstract_deadline, l))}` : '',
    e.submission_deadline ? `${t.deadline}: <strong>${esc(fmtDeadline(e.submission_deadline, l))}</strong>` : '',
    e.event_start ? `${t.event}: ${esc(fmtRange(e.event_start, e.event_end, l))}${e.location ? ` · ${esc(e.location)}` : ''}` : '',
  ].filter(Boolean);
  return `<tr><td style="padding:0 0 10px;">
  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;">
    <p style="margin:0 0 4px;font-size:14px;line-height:1.4;"><a href="${esc(href)}" style="color:#111827;text-decoration:none;">${name}</a>${tags}</p>
    ${lines.map((x) => `<p style="margin:0;font-size:13px;line-height:1.6;color:#4b5563;">${x}</p>`).join('\n    ')}
    ${extra}
  </div>
</td></tr>`;
}

const sectionTitle = (s: string) => `<p style="margin:18px 0 10px;font-size:13px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:.03em;">${s}</p>`;

/** Haftalık özet; gönderilecek bir şey yoksa null. */
export function renderWeekly(opts: {
  locale: Locale; name: string | null; data: WeeklyData; siteUrl: string; unsubscribeUrl: string;
}): { subject: string; html: string; text: string } | null {
  const { data, locale: l, siteUrl } = opts;
  const w = W[l];
  const t = T[l];
  if (data.followedSoon.length + data.forYou.length + data.groupNews.length === 0) return null;

  const table = (rows: string[]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">\n${rows.join('\n')}\n</table>`;
  const parts: string[] = [];
  if (data.followedSoon.length) parts.push(sectionTitle(w.followed) + table(data.followedSoon.map((e) => weeklyCard(e, l, siteUrl))));
  if (data.groupNews.length) {
    parts.push(sectionTitle(w.groups) + table(data.groupNews.map((g) => weeklyCard(g.event, l, siteUrl,
      `<p style="margin:6px 0 0;font-size:12px;color:#6b7280;">${esc(w.by(g.by, g.group))}${g.note ? ` — “${esc(g.note)}”` : ''}</p>`))));
  }
  if (data.forYou.length) parts.push(sectionTitle(w.forYou) + table(data.forYou.map((e) => weeklyCard(e, l, siteUrl))));

  const html = page({
    locale: l, siteUrl, hello: t.hello(opts.name), intro: w.intro, inner: parts.join('\n'),
    button: { href: `${siteUrl}#/takvimim`, label: w.button }, footer: w.footer,
    unsubscribeUrl: opts.unsubscribeUrl, unsubLabel: t.unsubscribe,
  });

  const line = (e: WeeklyEvent) =>
    `- ${e.acronym ? `${e.acronym} – ` : ''}${e.title}${e.submission_deadline ? ` · ${t.deadline}: ${fmtDeadline(e.submission_deadline, l)}` : ''}\n  ${siteUrl}#/etkinlik/${e.id}`;
  const text = [
    t.hello(opts.name), '', w.intro, '',
    ...(data.followedSoon.length ? [w.followed, ...data.followedSoon.map(line), ''] : []),
    ...(data.groupNews.length ? [w.groups, ...data.groupNews.map((g) => `${line(g.event)}\n  ${w.by(g.by, g.group)}`), ''] : []),
    ...(data.forYou.length ? [w.forYou, ...data.forYou.map(line), ''] : []),
    `${t.unsubscribe}: ${opts.unsubscribeUrl}`,
  ].join('\n');

  const n = data.followedSoon.length;
  return { subject: n ? w.subject(n) : w.subjectNone, html, text };
}

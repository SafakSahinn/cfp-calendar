// Anlık bildirim (Web Push) metni — saf fonksiyon, birim testlenir.

export type Locale = 'tr' | 'en';

export interface PushItem {
  type: string;
  event: { id: string; acronym: string | null; title: string; submission_deadline: string | null } | null;
  announcement: { title: string } | null;
  payload: { group_name?: string; days?: number; by?: string | null; note?: string | null };
  group_id?: string | null;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Site içi yol (hash), service worker sitenin kök adresine ekler */
  url: string;
  tag: string;
}

const LABELS: Record<Locale, Record<string, string>> = {
  tr: {
    submission_open: '📝 Başvuru açıldı',
    topic_match: '✨ İlgi alanınızda yeni çağrı',
    dates_changed: '🔄 Son tarih değişti',
    deadline_reminder: '⏰ Son başvuruya 1 haftadan az kaldı',
    group_recommendation: '👥 Grubunuzdan öneri',
    series_new: '🔁 Takip ettiğiniz serinin yeni çağrısı',
    announcement: '📣 Duyuru',
    group_comment: '💬 Grubunuzda yeni yorum',
    saved_search: '🔎 Kayıtlı aramana uyan yeni çağrı',
  },
  en: {
    submission_open: '📝 Submissions are open',
    topic_match: '✨ New call in your field',
    dates_changed: '🔄 Deadline changed',
    deadline_reminder: '⏰ Less than a week to the deadline',
    group_recommendation: '👥 Recommended by your group',
    series_new: '🔁 New edition of a series you follow',
    announcement: '📣 Announcement',
    group_comment: '💬 New comment in your group',
    saved_search: '🔎 New call matching your saved search',
  },
};

const fmt = (iso: string, lang: Locale) =>
  new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(iso));

const labelOf = (i: PushItem, L: Record<string, string>, lang: Locale) =>
  i.type === 'deadline_reminder' && i.payload.days
    ? lang === 'tr' ? `⏰ Son başvuruya ${i.payload.days} günden az kaldı` : `⏰ Less than ${i.payload.days} days to the deadline`
    : L[i.type] ?? 'CFP Calendar';

const nameOf = (i: PushItem) =>
  i.announcement ? i.announcement.title : i.event ? (i.event.acronym ? `${i.event.acronym} – ${i.event.title}` : i.event.title) : '';

/** Bir kullanıcının bu çalışmadaki yeni bildirimlerini tek push mesajına dönüştürür (cihazı boğmamak için). */
export function renderPush(items: PushItem[], lang: Locale): PushMessage | null {
  if (items.length === 0) return null;
  const L = LABELS[lang];
  // Önce en acil olan: son tarih hatırlatması / değişikliği
  const order = ['deadline_reminder', 'dates_changed', 'submission_open', 'series_new', 'group_recommendation', 'group_comment', 'saved_search', 'announcement', 'topic_match'];
  const sorted = [...items].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  const first = sorted[0];
  if (items.length === 1) {
    const e = first.event;
    const deadline = e?.submission_deadline && first.type !== 'announcement'
      ? ` · ${lang === 'tr' ? 'son başvuru' : 'deadline'} ${fmt(e.submission_deadline, lang)}`
      : '';
    return {
      title: labelOf(first, L, lang),
      body: first.type === 'group_comment' && first.payload.note
        ? `${first.payload.by ?? ''}: ${first.payload.note.slice(0, 120)} · ${e?.acronym ?? nameOf(first).slice(0, 40)}`
        : `${nameOf(first).slice(0, 140)}${deadline}`,
      url: first.type === 'group_comment' && first.group_id ? `#/grup/${first.group_id}` : e ? `#/etkinlik/${e.id}` : '#/mesajlar',
      tag: `cfp-${first.type}-${e?.id ?? 'x'}`,
    };
  }
  const names = sorted.slice(0, 3).map((i) => i.event?.acronym ?? nameOf(i).slice(0, 40));
  return {
    title: lang === 'tr' ? `CFP Calendar · ${items.length} yeni bildirim` : `CFP Calendar · ${items.length} new notifications`,
    body: `${labelOf(first, L, lang)}: ${names.join(', ')}${items.length > 3 ? '…' : ''}`,
    url: '#/mesajlar',
    tag: 'cfp-digest',
  };
}

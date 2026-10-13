// Anlık bildirim (Web Push) metni — saf fonksiyon, birim testlenir.

export type Locale = 'tr' | 'en';

export interface PushItem {
  type: string;
  event: { id: string; acronym: string | null; title: string; submission_deadline: string | null } | null;
  announcement: { title: string } | null;
  payload: { group_name?: string };
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
  },
  en: {
    submission_open: '📝 Submissions are open',
    topic_match: '✨ New call in your field',
    dates_changed: '🔄 Deadline changed',
    deadline_reminder: '⏰ Less than a week to the deadline',
    group_recommendation: '👥 Recommended by your group',
    series_new: '🔁 New edition of a series you follow',
    announcement: '📣 Announcement',
  },
};

const fmt = (iso: string, lang: Locale) =>
  new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(iso));

const nameOf = (i: PushItem) =>
  i.announcement ? i.announcement.title : i.event ? (i.event.acronym ? `${i.event.acronym} – ${i.event.title}` : i.event.title) : '';

/** Bir kullanıcının bu çalışmadaki yeni bildirimlerini tek push mesajına dönüştürür (cihazı boğmamak için). */
export function renderPush(items: PushItem[], lang: Locale): PushMessage | null {
  if (items.length === 0) return null;
  const L = LABELS[lang];
  // Önce en acil olan: son tarih hatırlatması / değişikliği
  const order = ['deadline_reminder', 'dates_changed', 'submission_open', 'series_new', 'group_recommendation', 'announcement', 'topic_match'];
  const sorted = [...items].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  const first = sorted[0];
  if (items.length === 1) {
    const e = first.event;
    const deadline = e?.submission_deadline && first.type !== 'announcement'
      ? ` · ${lang === 'tr' ? 'son başvuru' : 'deadline'} ${fmt(e.submission_deadline, lang)}`
      : '';
    return {
      title: L[first.type] ?? 'CFP Calendar',
      body: `${nameOf(first).slice(0, 140)}${deadline}`,
      url: e ? `#/etkinlik/${e.id}` : '#/mesajlar',
      tag: `cfp-${first.type}-${e?.id ?? 'x'}`,
    };
  }
  const names = sorted.slice(0, 3).map((i) => i.event?.acronym ?? nameOf(i).slice(0, 40));
  return {
    title: lang === 'tr' ? `CFP Calendar · ${items.length} yeni bildirim` : `CFP Calendar · ${items.length} new notifications`,
    body: `${L[first.type] ?? ''}: ${names.join(', ')}${items.length > 3 ? '…' : ''}`,
    url: '#/mesajlar',
    tag: 'cfp-digest',
  };
}

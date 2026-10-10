import type { Lang } from './i18n';

const locale = (lang: Lang) => (lang === 'tr' ? 'tr-TR' : 'en-GB');

/** Son başvuru (kullanıcının yerel saatinde, saat dahil). */
export function formatDeadline(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(locale(lang), {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDate(date: string, lang: Lang): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRange(start: string | null, end: string | null, lang: Lang): string {
  if (!start) return '—';
  if (!end || end === start) return formatDate(start, lang);
  return `${formatDate(start, lang)} – ${formatDate(end, lang)}`;
}

export function daysUntil(iso: string): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function timeAgo(iso: string, lang: Lang): string {
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' });
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(0, 'minute');
}

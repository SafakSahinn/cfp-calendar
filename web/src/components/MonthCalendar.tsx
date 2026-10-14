// Genel aylık takvim: geniş ekranda 7 sütunlu ızgara, dar ekranda (telefon) gün gün liste.
// Çağrılar sayfası, Takvimim ve grup takvimi bu bileşeni kullanır.

import { useMemo, useState, type ReactNode } from 'react';
import { KIND_ICON, localKey, type CalItem } from '../lib/calendarItems';
import { useI18n } from '../lib/i18n';

const MAX_IN_CELL = 3;
const KIND_ORDER = { task: 0, deadline: 1, abstract: 2, funding: 3, open: 4, event: 5 } as const;

export function MonthCalendar({
  items,
  showIcons = true,
  legend,
  initialMonth,
}: {
  items: CalItem[];
  showIcons?: boolean;
  legend?: ReactNode;
  initialMonth?: Date;
}) {
  const { t, lang } = useI18n();
  const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';
  const today = new Date();
  const [month, setMonth] = useState(() => {
    const m = initialMonth ?? today;
    return new Date(m.getFullYear(), m.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of items) m.set(it.day, [...(m.get(it.day) ?? []), it]);
    for (const list of m.values()) {
      list.sort((a, b) => Number(!!b.highlight) - Number(!!a.highlight) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    }
    return m;
  }, [items]);

  // Pazartesi ile başlayan haftalar
  const cells = useMemo(() => {
    const offset = (month.getDay() + 6) % 7;
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);
  const weeks = cells[35].getMonth() === month.getMonth() ? 6 : 5;
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }));
  const shift = (n: number) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
    setSelected(null);
  };
  const todayKey = localKey(today);
  const monthDays = cells.filter((d) => d.getMonth() === month.getMonth());
  const monthCount = monthDays.reduce((n, d) => n + (byDay.get(localKey(d))?.length ?? 0), 0);

  const Item = ({ it }: { it: CalItem }) => (
    <a href={it.href} className={`cal-item kind-${it.kind} ${it.highlight ? 'followed' : ''}`} title={it.title}>
      {showIcons ? `${KIND_ICON[it.kind]} ` : it.highlight ? '★ ' : ''}
      {it.label}
    </a>
  );

  return (
    <div className="calendar card">
      <div className="cal-head">
        <button className="small" onClick={() => shift(-1)} aria-label={t.prevMonth}>‹</button>
        <h3>{month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h3>
        <button className="small" onClick={() => shift(1)} aria-label={t.nextMonth}>›</button>
        <button className="small ghost" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(null); }}>
          {t.today}
        </button>
        <span className="muted small cal-count">{t.itemsThisMonth(monthCount)}</span>
      </div>

      <div className="cal-grid" role="grid">
        {weekdays.map((w) => <div key={w} className="cal-wd" role="columnheader">{w}</div>)}
        {cells.slice(0, weeks * 7).map((d) => {
          const k = localKey(d);
          const list = byDay.get(k) ?? [];
          const out = d.getMonth() !== month.getMonth();
          return (
            <div key={k} role="gridcell" className={`cal-cell ${out ? 'out' : ''} ${k === todayKey ? 'today' : ''} ${selected === k ? 'sel' : ''}`}>
              <span className="cal-day">{d.getDate()}</span>
              {list.slice(0, MAX_IN_CELL).map((it) => <Item key={it.key} it={it} />)}
              {list.length > MAX_IN_CELL && (
                <button className="cal-more" onClick={() => setSelected(selected === k ? null : k)}>
                  {t.moreCount(list.length - MAX_IN_CELL)}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {selected && (byDay.get(selected)?.length ?? 0) > MAX_IN_CELL && (
        <div className="cal-selected">
          <strong>{new Date(`${selected}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', weekday: 'long' })}</strong>
          <div className="cal-selected-list">{byDay.get(selected)!.map((it) => <Item key={it.key} it={it} />)}</div>
        </div>
      )}

      <div className="cal-agenda">
        {monthCount === 0 && <p className="muted">{t.noItemsThisMonth}</p>}
        {monthDays
          .filter((d) => byDay.has(localKey(d)))
          .map((d) => {
            const k = localKey(d);
            return (
              <div key={k} className={`agenda-day ${k === todayKey ? 'today' : ''}`}>
                <div className="agenda-date">
                  <strong>{d.getDate()}</strong>
                  <span className="muted small">{d.toLocaleDateString(locale, { weekday: 'short' })}</span>
                </div>
                <div className="agenda-items">{byDay.get(k)!.map((it) => <Item key={it.key} it={it} />)}</div>
              </div>
            );
          })}
      </div>
      {legend && <div className="muted small cal-legend">{legend}</div>}
    </div>
  );
}

/** Kalem türleri açıklaması. */
export function KindLegend({ withTasks = false }: { withTasks?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="legend">
      {(['open', 'abstract', 'deadline', 'funding', 'event', ...(withTasks ? (['task'] as const) : [])] as const).map((k) => (
        <span key={k} className={`legend-item kind-${k}`}>{KIND_ICON[k]} {t.kindLabels[k]}</span>
      ))}
    </span>
  );
}

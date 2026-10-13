// Aylık son tarih takvimi. Geniş ekranda 7 sütunlu ızgara, dar ekranda (telefon) gün gün liste.
// Tarihler kullanıcının yerel saatine göre günlere yerleştirilir (AoE son tarih Türkiye'de ertesi gün öğlene denk gelir).

import { useMemo, useState } from 'react';
import { useApp } from '../lib/app';
import { eventHref } from '../lib/events';
import { useI18n } from '../lib/i18n';
import type { EventRow } from '../lib/supabase';

const pad = (n: number) => String(n).padStart(2, '0');
const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MAX_IN_CELL = 3;

export function CalendarView({ events }: { events: EventRow[] }) {
  const { t, lang } = useI18n();
  const { followed } = useApp();
  const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);

  // gün → o gün son tarihi olan çağrılar (takip edilenler önce)
  const byDay = useMemo(() => {
    const m = new Map<string, EventRow[]>();
    for (const e of events) {
      if (!e.submission_deadline) continue;
      const k = localKey(new Date(e.submission_deadline));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    for (const list of m.values()) list.sort((a, b) => Number(followed.has(b.id)) - Number(followed.has(a.id)));
    return m;
  }, [events, followed]);

  // Pazartesi ile başlayan haftalar
  const cells = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);
  const weeks = cells[35].getMonth() === month.getMonth() ? 6 : 5;

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }),
  );
  const monthLabel = month.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const shift = (n: number) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
    setSelected(null);
  };
  const todayKey = localKey(today);
  const monthDays = cells.filter((d) => d.getMonth() === month.getMonth());
  const monthCount = monthDays.reduce((n, d) => n + (byDay.get(localKey(d))?.length ?? 0), 0);

  const Item = ({ e }: { e: EventRow }) => (
    <a
      href={eventHref(e.id)}
      className={`cal-item ${followed.has(e.id) ? 'followed' : ''}`}
      title={`${e.acronym ?? ''} ${e.title}`.trim()}
    >
      {followed.has(e.id) && '★ '}
      {e.acronym ?? e.title}
    </a>
  );

  return (
    <div className="calendar card">
      <div className="cal-head">
        <button className="small" onClick={() => shift(-1)} aria-label={t.prevMonth}>‹</button>
        <h3>{monthLabel}</h3>
        <button className="small" onClick={() => shift(1)} aria-label={t.nextMonth}>›</button>
        <button className="small ghost" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(null); }}>
          {t.today}
        </button>
        <span className="muted small cal-count">{t.deadlinesThisMonth(monthCount)}</span>
      </div>

      {/* Geniş ekran: ızgara */}
      <div className="cal-grid" role="grid">
        {weekdays.map((w) => <div key={w} className="cal-wd" role="columnheader">{w}</div>)}
        {cells.slice(0, weeks * 7).map((d) => {
          const k = localKey(d);
          const list = byDay.get(k) ?? [];
          const out = d.getMonth() !== month.getMonth();
          return (
            <div key={k} role="gridcell" className={`cal-cell ${out ? 'out' : ''} ${k === todayKey ? 'today' : ''} ${selected === k ? 'sel' : ''}`}>
              <span className="cal-day">{d.getDate()}</span>
              {list.slice(0, MAX_IN_CELL).map((e) => <Item key={e.id} e={e} />)}
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
          <div className="cal-selected-list">{byDay.get(selected)!.map((e) => <Item key={e.id} e={e} />)}</div>
        </div>
      )}

      {/* Dar ekran: gün gün liste */}
      <div className="cal-agenda">
        {monthCount === 0 && <p className="muted">{t.noDeadlinesThisMonth}</p>}
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
                <div className="agenda-items">{byDay.get(k)!.map((e) => <Item key={e.id} e={e} />)}</div>
              </div>
            );
          })}
      </div>
      <p className="muted small cal-legend">{t.calendarLegend}</p>
    </div>
  );
}

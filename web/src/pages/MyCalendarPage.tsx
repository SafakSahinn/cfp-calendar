// Takvimim: takip edilen / takvime eklenen çağrıların tüm tarihleri (Google/Outlook bağlamadan da çalışır).

import { useEffect, useMemo, useState } from 'react';
import { KindLegend, MonthCalendar } from '../components/MonthCalendar';
import { MySubmissions } from '../components/Submissions';
import { useApp } from '../lib/app';
import { itemsForEvent, type ItemKind } from '../lib/calendarItems';
import { useI18n } from '../lib/i18n';
import { supabase, type EventRow } from '../lib/supabase';

const ALL_KINDS: ItemKind[] = ['open', 'abstract', 'deadline', 'event'];

export function MyCalendarPage() {
  const { t } = useI18n();
  const { followed, profile } = useApp();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [kinds, setKinds] = useState<ItemKind[]>(ALL_KINDS);
  const [tab, setTab] = useState<'calendar' | 'submissions'>(() => (window.location.hash.includes('basvurular') ? 'submissions' : 'calendar'));

  useEffect(() => {
    if (followed.size === 0) return setEvents([]);
    supabase.from('events').select('*').in('id', [...followed]).then(({ data }) => setEvents((data ?? []) as EventRow[]));
  }, [followed]);

  const items = useMemo(() => (events ?? []).flatMap((e) => itemsForEvent(e, kinds)), [events, kinds]);
  const toggle = (k: ItemKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <section className="page-stack">
      <div className="page-head">
        <h2>{t.navMyCalendar}</h2>
        <p className="muted">{t.myCalendarText}</p>
      </div>
      <div className="tabs admin-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'calendar'} className={tab === 'calendar' ? 'on' : ''} onClick={() => setTab('calendar')}>📅 {t.calendarTab}</button>
        <button role="tab" aria-selected={tab === 'submissions'} className={tab === 'submissions' ? 'on' : ''} onClick={() => setTab('submissions')}>📄 {t.mySubmissions}</button>
      </div>
      {tab === 'submissions' ? <MySubmissions /> : <>
      <div className="row kind-toggles">
        {ALL_KINDS.map((k) => (
          <label key={k} className={`check kind-${k}`}>
            <input type="checkbox" checked={kinds.includes(k)} onChange={() => toggle(k)} /> {t.kindLabels[k]}
          </label>
        ))}
        <span className="muted small">{t.followedCount(followed.size)}</span>
      </div>
      {events === null ? (
        <p className="muted center">{t.loading}</p>
      ) : events.length === 0 ? (
        <div className="card center">
          <p>{t.myCalendarEmpty}</p>
          <a href="#/" className="button">{t.navEvents}</a>
        </div>
      ) : (
        <MonthCalendar items={items} legend={<KindLegend />} />
      )}
      {profile && !profile.calendar_provider && events && events.length > 0 && (
        <p className="muted small">{t.myCalendarConnectHint} <a href="#/profil">{t.navProfile} →</a></p>
      )}
      </>}
    </section>
  );
}

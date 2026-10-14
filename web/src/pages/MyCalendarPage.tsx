// Takvimim: takip edilen / takvime eklenen çağrıların tüm tarihleri (Google/Outlook bağlamadan da çalışır).

import { useEffect, useMemo, useState } from 'react';
import { KindLegend, MonthCalendar } from '../components/MonthCalendar';
import { MySubmissions } from '../components/Submissions';
import { useApp } from '../lib/app';
import { itemsForEvent, itemsForTasks, type ItemKind } from '../lib/calendarItems';
import { useCoauthored } from '../components/SubmissionTeam';
import { useI18n } from '../lib/i18n';
import { supabase, type EventRow } from '../lib/supabase';

const ALL_KINDS: ItemKind[] = ['open', 'abstract', 'deadline', 'funding', 'event', 'task'];

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

  // Kabul sonrası işler: kendi başvurularım + ortak yazarı olduklarım
  const [ownTasks, setOwnTasks] = useState<{ id: string; event_id: string; camera_ready_due: string | null; registration_due: string | null; presentation_at: string | null; acronym: string }[]>([]);
  const { rows: co } = useCoauthored();
  useEffect(() => {
    supabase.from('submissions').select('id, event_id, camera_ready_due, registration_due, presentation_at, events(acronym, title)')
      .or('camera_ready_due.not.is.null,registration_due.not.is.null,presentation_at.not.is.null')
      .then(({ data }) => setOwnTasks(((data ?? []) as unknown as { id: string; event_id: string; camera_ready_due: string | null; registration_due: string | null; presentation_at: string | null; events: { acronym: string | null; title: string } | null }[])
        .map((s) => ({ ...s, acronym: s.events?.acronym ?? s.events?.title.slice(0, 30) ?? '' }))));
  }, []);
  const items = useMemo(() => {
    const base = (events ?? []).flatMap((e) => itemsForEvent(e, kinds));
    if (!kinds.includes('task')) return base;
    const byId = new Map((events ?? []).map((e) => [e.id, e.acronym ?? e.title.slice(0, 30)]));
    const coTasks = (co ?? []).map((c) => ({ ...c, acronym: byId.get(c.event_id) ?? '' }));
    return [...base, ...itemsForTasks([...ownTasks, ...coTasks], t.taskLabels)];
  }, [events, kinds, ownTasks, co, t]);
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
        <MonthCalendar items={items} legend={<KindLegend withTasks />} />
      )}
      {profile && !profile.calendar_provider && events && events.length > 0 && (
        <p className="muted small">{t.myCalendarConnectHint} <a href="#/profil">{t.navProfile} →</a></p>
      )}
      </>}
    </section>
  );
}

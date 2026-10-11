import { useEffect, useMemo, useState } from 'react';
import { TOPICS } from '../../../shared/topics';
import { EventCard } from '../components/EventCard';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { useApp } from '../lib/app';
import { useI18n } from '../lib/i18n';
import { supabase, type EventRow } from '../lib/supabase';

const PAGE = 40;

interface Filters {
  q: string;
  field: '' | 'cs' | 'ee';
  kind: '' | EventRow['kind'];
  topic: string;
  ieee: boolean;
  ranked: boolean;
  followedOnly: boolean;
  showCaution: boolean;
}

const EMPTY: Filters = { q: '', field: '', kind: '', topic: '', ieee: false, ranked: false, followedOnly: false, showCaution: false };

function loadFilters(): Filters {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem('cfp.filters') ?? '{}') };
  } catch {
    return EMPTY;
  }
}

export function EventsPage() {
  const { t, lang } = useI18n();
  const { followed } = useApp();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [limit, setLimit] = useState(PAGE);
  const [dialog, setDialog] = useState<{ event: EventRow | null } | null>(null);

  useEffect(() => {
    (async () => {
      const all: EventRow[] = [];
      // Başvurusu açık çağrılar (Supabase sayfa başına en fazla 1000 satır döndürür)
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase
          .from('events')
          .select('*')
          .gt('submission_deadline', new Date().toISOString())
          .order('submission_deadline', { ascending: true })
          .range(from, from + 999);
        all.push(...((data ?? []) as EventRow[]));
        if (!data || data.length < 1000) break;
      }
      setEvents(all);
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cfp.filters', JSON.stringify({ ...filters, q: '' }));
    } catch {
      // yok say
    }
    setLimit(PAGE);
  }, [filters]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const visible = useMemo(() => {
    if (!events) return [];
    const q = filters.q.trim().toLocaleLowerCase(lang);
    return events.filter((e) => {
      if (filters.field && !e.fields.includes(filters.field)) return false;
      if (filters.kind && e.kind !== filters.kind) return false;
      if (filters.topic && !e.topics.includes(filters.topic)) return false;
      if (filters.ieee && !e.is_ieee) return false;
      if (filters.ranked && Object.keys(e.ranks).length === 0) return false;
      if (filters.followedOnly && !followed.has(e.id)) return false;
      // Takip edilenler, işaretli olsa da her zaman görünür
      if (!filters.showCaution && e.flags?.length > 0 && !followed.has(e.id)) return false;
      if (q && !`${e.acronym ?? ''} ${e.title} ${e.location ?? ''}`.toLocaleLowerCase(lang).includes(q)) return false;
      return true;
    });
  }, [events, filters, followed, lang]);

  const topicOptions = TOPICS.filter((tp) => !filters.field || tp.field === filters.field);

  return (
    <section>
      <div className="filters card">
        <input
          type="search"
          placeholder={t.search}
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
          className="grow"
        />
        <select value={filters.field} onChange={(e) => set('field', e.target.value as Filters['field'])}>
          <option value="">{t.allFields}</option>
          <option value="cs">{t.fieldCs}</option>
          <option value="ee">{t.fieldEe}</option>
        </select>
        <select value={filters.kind} onChange={(e) => set('kind', e.target.value as Filters['kind'])}>
          <option value="">{t.allKinds}</option>
          <option value="conference">{t.kindConference}</option>
          <option value="workshop">{t.kindWorkshop}</option>
          <option value="journal">{t.kindJournal}</option>
        </select>
        <select value={filters.topic} onChange={(e) => set('topic', e.target.value)}>
          <option value="">{t.allTopics}</option>
          {topicOptions.map((tp) => (
            <option key={tp.id} value={tp.id}>{tp[lang]}</option>
          ))}
        </select>
        <label className="check"><input type="checkbox" checked={filters.ieee} onChange={(e) => set('ieee', e.target.checked)} /> {t.onlyIeee}</label>
        <label className="check"><input type="checkbox" checked={filters.ranked} onChange={(e) => set('ranked', e.target.checked)} /> {t.onlyRanked}</label>
        <label className="check"><input type="checkbox" checked={filters.followedOnly} onChange={(e) => set('followedOnly', e.target.checked)} /> {t.onlyFollowed}</label>
        <label className="check" title={t.cautionHelp}><input type="checkbox" checked={filters.showCaution} onChange={(e) => set('showCaution', e.target.checked)} /> {t.showCaution}</label>
      </div>

      {!events ? (
        <p className="muted center">{t.loading}</p>
      ) : visible.length === 0 ? (
        <p className="muted center">{t.noEvents}</p>
      ) : (
        <>
          <div className="list-head">
            <p className="muted small">{visible.length} {t.results}</p>
            <button className="small" onClick={() => setDialog({ event: null })}>➕ {t.suggest}</button>
          </div>
          <div className="list">
            {visible.slice(0, limit).map((e) => (
              <EventCard key={e.id} event={e} onReport={(ev) => setDialog({ event: ev })} />
            ))}
          </div>
          {visible.length > limit && (
            <div className="center">
              <button onClick={() => setLimit((l) => l + PAGE)}>{t.showMore}</button>
            </div>
          )}
        </>
      )}
      {dialog && <FeedbackDialog event={dialog.event} onClose={() => setDialog(null)} />}
    </section>
  );
}

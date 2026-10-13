import { useEffect, useMemo, useState } from 'react';
import { TOPICS } from '../../../shared/topics';
import { CalendarView } from '../components/CalendarView';
import { lazy, Suspense } from 'react';

const MapView = lazy(() => import('../components/MapView'));
import { EventCard } from '../components/EventCard';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { useApp } from '../lib/app';
import { IN_TURKEY, IS_ONLINE, useOpenEvents } from '../lib/events';
import { funding } from '../lib/funding';
import { useI18n } from '../lib/i18n';
import type { EventRow } from '../lib/supabase';

const PAGE = 40;

interface Filters {
  q: string;
  field: '' | 'cs' | 'ee';
  kind: '' | EventRow['kind'];
  topic: string;
  within: '' | '7' | '30' | '90';
  format: '' | 'online' | 'in_person';
  sort: 'deadline' | 'event' | 'newest';
  ieee: boolean;
  ranked: boolean;
  followedOnly: boolean;
  showCaution: boolean;
  turkey: boolean;
  fundingOpen: boolean;
  topQuartile: boolean;
}

const EMPTY: Filters = {
  q: '', field: '', kind: '', topic: '', within: '', format: '', sort: 'deadline',
  ieee: false, ranked: false, followedOnly: false, showCaution: false, turkey: false, fundingOpen: false, topQuartile: false,
};

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // depolama kapalı olabilir
  }
}

const DAY = 86_400_000;

export function EventsPage() {
  const { t, lang } = useI18n();
  const { followed } = useApp();
  const events = useOpenEvents();
  const [filters, setFilters] = useState<Filters>(() => loadStored('cfp.filters', EMPTY));
  const [view, setView] = useState<'list' | 'calendar' | 'map'>(() => loadStored('cfp.view', { v: 'list' as 'list' | 'calendar' | 'map' }).v);
  const [limit, setLimit] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dialog, setDialog] = useState<{ event: EventRow | null } | null>(null);

  useEffect(() => {
    store('cfp.filters', { ...filters, q: '' });
    setLimit(PAGE);
  }, [filters]);
  useEffect(() => store('cfp.view', { v: view }), [view]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const visible = useMemo(() => {
    if (!events) return [];
    const q = filters.q.trim().toLocaleLowerCase(lang);
    const now = Date.now();
    const rows = events.filter((e) => {
      if (filters.field && !e.fields.includes(filters.field)) return false;
      if (filters.kind && e.kind !== filters.kind) return false;
      if (filters.topic && !e.topics.includes(filters.topic)) return false;
      if (filters.within && new Date(e.submission_deadline!).getTime() - now > +filters.within * DAY) return false;
      if (filters.format === 'online' && !IS_ONLINE.test(e.location ?? '')) return false;
      if (filters.format === 'in_person' && (!e.location || IS_ONLINE.test(e.location))) return false;
      if (filters.ieee && !e.is_ieee) return false;
      if (filters.ranked && Object.keys(e.ranks).length === 0) return false;
      if (filters.followedOnly && !followed.has(e.id)) return false;
      if (filters.turkey && !IN_TURKEY.test(e.location ?? '')) return false;
      if (filters.fundingOpen && !funding(e)?.openNow) return false;
      if (filters.topQuartile && !/^Q[12]$/.test(e.ranks.sjr ?? '')) return false;
      // Takip edilenler, işaretli olsa da her zaman görünür
      if (!filters.showCaution && e.flags?.length > 0 && !followed.has(e.id)) return false;
      if (q && !`${e.acronym ?? ''} ${e.title} ${e.location ?? ''}`.toLocaleLowerCase(lang).includes(q)) return false;
      return true;
    });
    if (filters.sort === 'event') {
      return [...rows].sort((a, b) => (a.event_start ?? '9999').localeCompare(b.event_start ?? '9999'));
    }
    if (filters.sort === 'newest') return [...rows].sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at));
    return rows; // sunucudan son tarihe göre sıralı gelir
  }, [events, filters, followed, lang]);

  const topicOptions = TOPICS.filter((tp) => !filters.field || tp.field === filters.field);
  const active = Object.entries(filters).filter(([k, v]) => k !== 'sort' && v !== EMPTY[k as keyof Filters]).length;

  return (
    <section>
      <div className="filters card">
        <input type="search" placeholder={t.search} value={filters.q} onChange={(e) => set('q', e.target.value)} className="grow" />
        <button className="small filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
          ⚙ {t.filters}{active > 0 && <span className="badge">{active}</span>}
        </button>
        <div className={`filter-more ${filtersOpen ? 'open' : ''}`}>
        <select value={filters.field} onChange={(e) => set('field', e.target.value as Filters['field'])} aria-label={t.allFields}>
          <option value="">{t.allFields}</option>
          <option value="cs">{t.fieldCs}</option>
          <option value="ee">{t.fieldEe}</option>
        </select>
        <select value={filters.kind} onChange={(e) => set('kind', e.target.value as Filters['kind'])} aria-label={t.allKinds}>
          <option value="">{t.allKinds}</option>
          <option value="conference">{t.kindConference}</option>
          <option value="workshop">{t.kindWorkshop}</option>
          <option value="journal">{t.kindJournal}</option>
        </select>
        <select value={filters.topic} onChange={(e) => set('topic', e.target.value)} aria-label={t.allTopics}>
          <option value="">{t.allTopics}</option>
          {topicOptions.map((tp) => (
            <option key={tp.id} value={tp.id}>{tp[lang]}</option>
          ))}
        </select>
        <select value={filters.within} onChange={(e) => set('within', e.target.value as Filters['within'])} aria-label={t.withinAny}>
          <option value="">{t.withinAny}</option>
          <option value="7">{t.withinDays(7)}</option>
          <option value="30">{t.withinDays(30)}</option>
          <option value="90">{t.withinDays(90)}</option>
        </select>
        <select value={filters.format} onChange={(e) => set('format', e.target.value as Filters['format'])} aria-label={t.formatAny}>
          <option value="">{t.formatAny}</option>
          <option value="in_person">{t.formatInPerson}</option>
          <option value="online">{t.formatOnline}</option>
        </select>
        <label className="check"><input type="checkbox" checked={filters.ieee} onChange={(e) => set('ieee', e.target.checked)} /> {t.onlyIeee}</label>
        <label className="check"><input type="checkbox" checked={filters.ranked} onChange={(e) => set('ranked', e.target.checked)} /> {t.onlyRanked}</label>
        <label className="check"><input type="checkbox" checked={filters.followedOnly} onChange={(e) => set('followedOnly', e.target.checked)} /> {t.onlyFollowed}</label>
        <label className="check"><input type="checkbox" checked={filters.turkey} onChange={(e) => set('turkey', e.target.checked)} /> 🇹🇷 {t.inTurkey}</label>
        <label className="check" title={t.fundingBadgeTitle}><input type="checkbox" checked={filters.fundingOpen} onChange={(e) => set('fundingOpen', e.target.checked)} /> 💰 {t.fundingFilter}</label>
        <label className="check" title={t.sjrHelp}><input type="checkbox" checked={filters.topQuartile} onChange={(e) => set('topQuartile', e.target.checked)} /> 📊 {t.sjrFilter}</label>
        <label className="check" title={t.cautionHelp}><input type="checkbox" checked={filters.showCaution} onChange={(e) => set('showCaution', e.target.checked)} /> {t.showCaution}</label>
        {active > 0 && (
          <button className="small ghost" onClick={() => setFilters({ ...EMPTY, sort: filters.sort })}>✕ {t.clearFilters}</button>
        )}
        </div>
      </div>

      <div className="list-head">
        <p className="muted small">{events ? `${visible.length} ${t.results}` : t.loading}</p>
        <div className="row">
          {view === 'list' && (
            <select value={filters.sort} onChange={(e) => set('sort', e.target.value as Filters['sort'])} aria-label={t.sortBy} className="small-select">
              <option value="deadline">{t.sortDeadline}</option>
              <option value="event">{t.sortEvent}</option>
              <option value="newest">{t.sortNewest}</option>
            </select>
          )}
          <div className="seg" role="tablist" aria-label={t.view}>
            <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>☰ {t.viewList}</button>
            <button role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>📅 {t.viewCalendar}</button>
            <button role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>🗺️ {t.viewMap}</button>
          </div>
          <button className="small" onClick={() => setDialog({ event: null })}>➕ <span className="hide-sm">{t.suggest}</span></button>
        </div>
      </div>

      {!events ? null : view === 'calendar' ? (
        <CalendarView events={visible} />
      ) : view === 'map' ? (
        <Suspense fallback={<p className="muted center">{t.loading}</p>}>
          <MapView events={visible} />
        </Suspense>
      ) : visible.length === 0 ? (
        <p className="muted center">{t.noEvents}</p>
      ) : (
        <>
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

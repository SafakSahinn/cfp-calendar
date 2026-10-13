// Detay sayfası ekleri: konferans serisi (takip + önceki yıllar), gruptan başvuranlar, benzer çağrılar.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/app';
import { eventHref, useOpenEvents } from '../lib/events';
import { formatDate, formatDeadline } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { supabase, type EventRow } from '../lib/supabase';
import { StatusTag, type Status } from './Submissions';

// jobs/src/quality.ts CAUTION_FLAGS ile aynı
const CAUTION_FLAGS = new Set(['indexing_claims', 'organizer_prefix', 'ei_duplicate', 'generic_journal']);
const isCaution = (e: EventRow) => Object.keys(e.ranks).length === 0 && (e.flags ?? []).some((f) => CAUTION_FLAGS.has(f));

// ---------------------------------------------------------------------------
// Seri: "ICASSP serisini takip et" + geçmiş yılların son tarihleri
// ---------------------------------------------------------------------------
type Edition = Pick<EventRow, 'id' | 'submission_deadline' | 'event_start' | 'location' | 'dedupe_key'>;

export function SeriesCard({ event }: { event: EventRow }) {
  const { t, lang } = useI18n();
  const { seriesFollowed, toggleSeries } = useApp();
  const [editions, setEditions] = useState<Edition[] | null>(null);
  const key = event.series_key;

  useEffect(() => {
    if (!key) return;
    supabase
      .from('events')
      .select('id, submission_deadline, event_start, location, dedupe_key')
      .eq('series_key', key)
      .order('dedupe_key', { ascending: false })
      .limit(8)
      .then(({ data }) => setEditions((data ?? []) as Edition[]));
  }, [key]);

  if (!key) return null;
  const following = seriesFollowed.has(key);
  const yearOf = (e: Edition) => e.dedupe_key.match(/-(\d{4})$/)?.[1] ?? '—';
  const others = (editions ?? []).filter((e) => e.id !== event.id);

  return (
    <section className="card series">
      <div className="row">
        <h3 className="grow">🔁 {t.seriesTitle(event.acronym ?? key)}</h3>
        <button className={`small ${following ? 'primary' : ''}`} onClick={() => toggleSeries(key, event.acronym ?? key)}>
          {following ? `★ ${t.seriesFollowing}` : `☆ ${t.seriesFollow}`}
        </button>
      </div>
      <p className="muted small">{t.seriesHint}</p>
      {others.length > 0 && (
        <dl className="timeline">
          {others.map((e) => (
            <div key={e.id}>
              <dt><a href={eventHref(e.id)}>{event.acronym ?? key} {yearOf(e)}</a></dt>
              <dd>
                {e.submission_deadline ? `${t.deadline}: ${formatDeadline(e.submission_deadline, lang)}` : '—'}
                {e.event_start && <span className="muted"> · {formatDate(e.event_start, lang)}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Gruptan kim başvuruyor (sadece kişinin açıkça paylaştığı başvurular)
// ---------------------------------------------------------------------------
interface Participant { group_id: string; group_name: string; user_id: string; display_name: string | null; academic_title: string | null; status: Status }

export function GroupParticipants({ eventId }: { eventId: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Participant[]>([]);

  useEffect(() => {
    supabase.rpc('event_group_participants', { p_event: eventId }).then(({ data }) => setRows((data ?? []) as Participant[]));
  }, [eventId]);

  // Aynı kişi birden fazla ortak grupta olabilir → kişi başına tek satır
  const people = useMemo(() => {
    const m = new Map<string, Participant & { groups: string[] }>();
    for (const r of rows) {
      const p = m.get(r.user_id);
      if (p) p.groups.push(r.group_name);
      else m.set(r.user_id, { ...r, groups: [r.group_name] });
    }
    return [...m.values()];
  }, [rows]);

  if (people.length === 0) return null;
  return (
    <section className="card participants">
      <h3>👥 {t.groupApplying(people.length)}</h3>
      <ul className="plain">
        {people.map((p) => (
          <li key={p.user_id} className="row">
            <span className="grow">
              {p.academic_title && t.titles[p.academic_title as keyof typeof t.titles] ? `${t.titles[p.academic_title as keyof typeof t.titles]} ` : ''}
              {p.display_name ?? '—'} <span className="muted small">· {p.groups.join(', ')}</span>
            </span>
            <StatusTag status={p.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Benzer çağrılar: ortak konu sayısı + yakın son tarih; aynı seri ve "dikkat" işaretliler hariç
// ---------------------------------------------------------------------------
export function similarEvents(e: EventRow, all: EventRow[], limit = 5): EventRow[] {
  const topics = new Set(e.topics);
  if (topics.size === 0) return [];
  const ref = e.submission_deadline ? new Date(e.submission_deadline).getTime() : Date.now();
  return all
    .filter((x) => x.id !== e.id && (!e.series_key || x.series_key !== e.series_key) && !isCaution(x))
    .map((x) => {
      const common = x.topics.filter((tp) => topics.has(tp)).length;
      const days = Math.abs(new Date(x.submission_deadline!).getTime() - ref) / 86_400_000;
      const score = common * 3 + (x.kind === e.kind ? 1 : 0) + (Object.keys(x.ranks).length ? 1 : 0) - Math.min(days / 30, 4);
      return { x, common, score };
    })
    .filter((r) => r.common > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.x);
}

export function SimilarCalls({ event }: { event: EventRow }) {
  const { t, lang } = useI18n();
  const all = useOpenEvents();
  const list = useMemo(() => (all ? similarEvents(event, all) : []), [all, event]);
  if (list.length === 0) return null;
  return (
    <section className="card similar">
      <h3>{t.similarCalls}</h3>
      <ul className="plain">
        {list.map((x) => (
          <li key={x.id}>
            <a href={eventHref(x.id)}>
              {x.acronym && <strong>{x.acronym} </strong>}
              <span>{x.title}</span>
            </a>
            <span className="muted small">
              {' '}· {t.deadline}: {formatDeadline(x.submission_deadline!, lang)}
              {Object.entries(x.ranks).map(([k, v]) => ` · ${k.toUpperCase()} ${v}`).join('')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

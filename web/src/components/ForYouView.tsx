// Çağrılar → "✨ Senin için": kişisel öneriler ve her birinin nedeni.

import { useEffect, useMemo, useState } from 'react';
import { TOPIC_BY_ID } from '../../../shared/topics';
import { useApp } from '../lib/app';
import { forYou, type Reason } from '../lib/forYou';
import { useI18n } from '../lib/i18n';
import { supabase, type EventRow } from '../lib/supabase';
import { EventCard } from './EventCard';

export function ForYouView({ events, onReport }: { events: EventRow[]; onReport: (e: EventRow) => void }) {
  const { t, lang } = useI18n();
  const { followed, topics, seriesFollowed } = useApp();
  const [applied, setApplied] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from('submissions').select('events(series_key)').then(({ data }) => {
      const keys = ((data ?? []) as unknown as { events: { series_key: string | null } | null }[])
        .map((r) => r.events?.series_key).filter((k): k is string => !!k);
      setApplied(new Set(keys));
    });
  }, []);

  const list = useMemo(
    () => forYou({ events, followed, topics, seriesFollowed, appliedSeries: applied }),
    [events, followed, topics, seriesFollowed, applied],
  );

  const reasonText = (r: Reason) =>
    r.kind === 'series' ? t.fyReasonSeries(r.series)
    : r.kind === 'applied' ? t.fyReasonApplied(r.series)
    : r.kind === 'topic' ? t.fyReasonTopic(TOPIC_BY_ID.get(r.topic)?.[lang] ?? r.topic)
    : r.kind === 'similar' ? t.fyReasonSimilar
    : r.kind === 'rank' ? r.label
    : t.fyReasonNew;

  if (list.length === 0) {
    return (
      <div className="card center">
        <p>{topics.size === 0 && followed.size === 0 ? t.fyEmptyStart : t.fyEmpty}</p>
        <a href="#/profil">{t.fyChooseTopics} →</a>
      </div>
    );
  }
  return (
    <div className="list">
      <p className="muted small">{t.fyIntro}</p>
      {list.map(({ event, reasons }) => (
        <div key={event.id} className="fy-item">
          <div className="fy-reasons">
            {reasons.map((r, i) => <span key={i} className={`fy-reason fy-${r.kind}`}>{reasonText(r)}</span>)}
          </div>
          <EventCard event={event as EventRow} onReport={onReport} />
        </div>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { TOPIC_BY_ID } from '../../../shared/topics';
import { useApp } from '../lib/app';
import { daysUntil, formatDeadline, formatRange } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { EventRow } from '../lib/supabase';

export function KindTag({ kind }: { kind: EventRow['kind'] }) {
  const { t } = useI18n();
  const label = kind === 'journal' ? t.kindJournal : kind === 'workshop' ? t.kindWorkshop : t.kindConference;
  return <span className={`tag kind-${kind}`}>{label}</span>;
}

export function EventCard({ event }: { event: EventRow }) {
  const { t, lang } = useI18n();
  const { followed, toggleFollow, profile, addToCalendar } = useApp();
  const [busy, setBusy] = useState(false);
  const isFollowed = followed.has(event.id);
  const days = event.submission_deadline ? daysUntil(event.submission_deadline) : null;
  const urgent = days !== null && days <= 7;

  const onCalendar = async () => {
    setBusy(true);
    await addToCalendar(event.id);
    setBusy(false);
  };

  return (
    <article className="card event">
      <div className="event-main">
        <div className="event-head">
          {event.acronym && <strong className="acronym">{event.acronym}</strong>}
          <KindTag kind={event.kind} />
          {event.is_ieee && <span className="tag ieee">IEEE</span>}
          {Object.entries(event.ranks).map(([k, v]) => (
            <span key={k} className="tag rank" title={k.toUpperCase()}>
              {k.toUpperCase()} {v}
            </span>
          ))}
        </div>
        <h3 className="event-title">{event.title}</h3>
        <div className="event-meta">
          {event.location && <span>📍 {event.location}</span>}
          {event.event_start && (
            <span>
              🗓 {t.eventDates}: {formatRange(event.event_start, event.event_end, lang)}
            </span>
          )}
        </div>
        <div className="topics">
          {event.topics.slice(0, 5).map((id) => {
            const topic = TOPIC_BY_ID.get(id);
            return topic ? <span key={id} className="chip static">{topic[lang]}</span> : null;
          })}
        </div>
      </div>

      <div className="event-side">
        {event.submission_deadline && (
          <div className={`deadline ${urgent ? 'urgent' : ''}`}>
            <span className="label">{t.deadline}</span>
            <strong>{formatDeadline(event.submission_deadline, lang)}</strong>
            <span className="countdown">{t.daysLeft(days!)}</span>
            {event.abstract_deadline && event.abstract_deadline !== event.submission_deadline && (
              <span className="muted small">
                {t.abstract}: {formatDeadline(event.abstract_deadline, lang)}
              </span>
            )}
          </div>
        )}
        <div className="actions">
          <button className={isFollowed ? 'primary small' : 'small'} onClick={() => toggleFollow(event.id)}>
            {isFollowed ? `★ ${t.following}` : `☆ ${t.follow}`}
          </button>
          <button
            className="small"
            onClick={onCalendar}
            disabled={busy || !profile?.calendar_provider}
            title={profile?.calendar_provider ? undefined : t.needCalendar}
          >
            📅 {t.addToCalendar}
          </button>
          {event.url && (
            <a className="button small ghost" href={event.url} target="_blank" rel="noreferrer">
              ↗ {t.details}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

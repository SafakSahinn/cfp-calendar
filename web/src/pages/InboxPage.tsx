import { useCallback, useEffect, useState } from 'react';
import { TOPIC_BY_ID } from '../../../shared/topics';
import { KindTag } from '../components/EventCard';
import { eventHref } from '../lib/events';
import { useApp } from '../lib/app';
import { formatDeadline, formatRange, timeAgo } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { supabase, type Notification } from '../lib/supabase';

export function InboxPage() {
  const { t, lang } = useI18n();
  const { session, profile, refreshUnread, showToast } = useApp();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const userId = session!.user.id;

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*, events(*), announcements(title, body, url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    setItems((data ?? []) as Notification[]);

    // Görüntülenenleri okundu yap
    const unreadIds = (data ?? []).filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
      refreshUnread();
    }
  }, [userId, refreshUnread]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`inbox-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const respond = async (n: Notification, response: 'interested' | 'not_interested') => {
    setBusy(n.id);
    const { data, error } = await supabase.functions.invoke('respond', { body: { notification_id: n.id, response } });
    setBusy(null);
    if (error || data?.calendar_error) showToast(`${t.calendarError}: ${error?.message ?? data.calendar_error}`);
    setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, response } : x)) ?? null);
  };

  const heading: Record<Notification['type'], string> = {
    submission_open: t.nOpen,
    topic_match: t.nTopic,
    dates_changed: t.nChanged,
    deadline_reminder: t.nReminder,
    announcement: t.nAnnouncement,
    group_recommendation: t.nGroup,
    series_new: t.nSeries,
    group_comment: t.nGroupComment,
  };
  const icon: Record<Notification['type'], string> = {
    submission_open: '📝',
    topic_match: '✨',
    dates_changed: '🔄',
    deadline_reminder: '⏰',
    announcement: '📣',
    group_recommendation: '👥',
    series_new: '🔁',
    group_comment: '💬',
  };

  if (!items) return <p className="muted center">{t.loading}</p>;

  return (
    <section>
      <h2>{t.inboxTitle}</h2>
      {items.length === 0 && <p className="muted">{t.inboxEmpty}</p>}
      <div className="list">
        {items.map((n) => {
          const e = n.events;
          const askable = n.type === 'submission_open' || n.type === 'topic_match' || n.type === 'group_recommendation';
          const a = n.announcements;
          return (
            <article key={n.id} className={`card message ${n.read_at ? '' : 'unread'}`}>
              <div className="message-head">
                <span className="message-icon">{icon[n.type]}</span>
                <strong>{n.type === 'deadline_reminder' && n.payload.days ? t.nReminderDays(n.payload.days) : heading[n.type]}</strong>
                <span className="muted small">{timeAgo(n.created_at, lang)}</span>
              </div>
              {n.type === 'announcement' && a && (
                <div className="message-body">
                  <p className="event-title"><strong>{a.title}</strong></p>
                  <p className="pre">{a.body}</p>
                  {a.url && <a href={a.url} target="_blank" rel="noreferrer noopener" className="small">↗ {a.url}</a>}
                </div>
              )}
              {n.type === 'group_comment' && (
                <p className="message-body small">
                  {t.groupCommentLine(n.payload.by ?? '—', n.payload.group_name ?? '')}
                  {n.group_id && <> · <a href={`#/grup/${n.group_id}`}>{t.openGroup}</a></>}
                  {n.payload.note && <span className="note">💬 {n.payload.note}</span>}
                </p>
              )}
              {n.type === 'group_recommendation' && (
                <p className="message-body small">
                  {t.groupRecLine(n.payload.by ?? '—', n.payload.group_name ?? '')}
                  {n.group_id && <> · <a href={`#/grup/${n.group_id}`}>{t.openGroup}</a></>}
                  {n.payload.note && <span className="note">💬 {n.payload.note}</span>}
                </p>
              )}
              {e && (
                <div className="message-body">
                  <div className="event-head">
                    {e.acronym && <strong className="acronym">{e.acronym}</strong>}
                    <KindTag kind={e.kind} />
                    {e.is_ieee && <span className="tag ieee">IEEE</span>}
                  </div>
                  <p className="event-title"><a href={eventHref(e.id)} className="title-link">{e.title}</a></p>
                  <ul className="facts">
                    {n.type === 'dates_changed' && n.payload.old_deadline && (
                      <li>
                        {t.oldDeadline}: <s>{formatDeadline(n.payload.old_deadline, lang)}</s>
                      </li>
                    )}
                    {e.submission_deadline && (
                      <li>
                        {n.type === 'dates_changed' ? t.newDeadline : t.deadline}: <strong>{formatDeadline(e.submission_deadline, lang)}</strong>
                      </li>
                    )}
                    {e.event_start && <li>{t.eventDates}: {formatRange(e.event_start, e.event_end, lang)}</li>}
                    {e.location && <li>📍 {e.location}</li>}
                    {n.payload.topics && n.payload.topics.length > 0 && (
                      <li>{n.payload.topics.map((id) => TOPIC_BY_ID.get(id)?.[lang]).filter(Boolean).join(', ')}</li>
                    )}
                  </ul>
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" className="small">↗ {t.details}</a>
                  )}
                </div>
              )}
              {askable && e && (
                <div className="ask">
                  {n.response === 'interested' ? (
                    <span className="ok">{profile?.calendar_provider ? t.youInterested : t.youInterestedNoCal}</span>
                  ) : n.response === 'not_interested' ? (
                    <span className="muted">{t.youNotInterested}</span>
                  ) : (
                    <>
                      <span>{t.askInterested}</span>
                      <button className="primary small" disabled={busy === n.id} onClick={() => respond(n, 'interested')}>
                        {t.interested}
                      </button>
                      <button className="small" disabled={busy === n.id} onClick={() => respond(n, 'not_interested')}>
                        {t.notInterested}
                      </button>
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

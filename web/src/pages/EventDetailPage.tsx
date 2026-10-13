import { useState } from 'react';
import { TOPIC_BY_ID } from '../../../shared/topics';
import { KindTag } from '../components/EventCard';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { RecommendDialog } from '../components/RecommendDialog';
import { SubmissionCard } from '../components/Submissions';
import { useApp } from '../lib/app';
import { eventHref, useEvent } from '../lib/events';
import { formatDate, formatDeadline, formatRange, timeLeft } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { siteRoot } from '../lib/supabase';

export function EventDetailPage({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const { followed, toggleFollow, profile, addToCalendar, showToast } = useApp();
  const { event: e, loading } = useEvent(id);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(false);
  const [recommend, setRecommend] = useState(false);

  if (loading) return <p className="muted center">{t.loading}</p>;
  if (!e) {
    return (
      <div className="card center">
        <p>{t.eventNotFound}</p>
        <a href="#/">← {t.backToList}</a>
      </div>
    );
  }

  const isFollowed = followed.has(e.id);
  const open = !!e.submission_deadline && new Date(e.submission_deadline).getTime() > Date.now();
  const shareUrl = `${siteRoot}${eventHref(e.id)}`;
  const name = e.acronym ? `${e.acronym} – ${e.title}` : e.title;

  const share = async () => {
    // Telefonda yerel paylaşım menüsü, masaüstünde panoya kopyala
    if (navigator.share) {
      try {
        await navigator.share({ title: name, text: `${name} · ${t.deadline}: ${e.submission_deadline ? formatDeadline(e.submission_deadline, lang) : '—'}`, url: shareUrl });
        return;
      } catch {
        // kullanıcı vazgeçti veya desteklenmiyor → kopyalamaya düş
      }
    }
    await navigator.clipboard.writeText(shareUrl);
    showToast(t.linkCopied);
  };

  const onCalendar = async () => {
    setBusy(true);
    await addToCalendar(e.id);
    setBusy(false);
  };

  // Tarih çizelgesi: sadece bilinen tarihler
  const main = e.submission_deadline ? new Date(e.submission_deadline).getTime() : null;
  const otherRounds = (e.deadlines ?? []).filter((r) => new Date(r.deadline).getTime() !== main);
  const timeline: [string, string, boolean?][] = [];
  if (e.submission_open) timeline.push([t.dateOpen, formatDate(e.submission_open, lang)]);
  else timeline.push([t.dateFirstSeen, formatDate(e.first_seen_at.slice(0, 10), lang)]);
  if (e.abstract_deadline && new Date(e.abstract_deadline).getTime() !== main) timeline.push([t.abstract, formatDeadline(e.abstract_deadline, lang)]);
  if (e.submission_deadline) timeline.push([t.deadline, formatDeadline(e.submission_deadline, lang), true]);
  for (const r of otherRounds) timeline.push([`${t.deadline}${r.comment ? ` (${r.comment})` : ''}`, formatDeadline(r.deadline, lang)]);
  if (e.notification_date) timeline.push([t.dateNotification, formatDate(e.notification_date, lang)]);
  if (e.event_start) timeline.push([t.eventDates, formatRange(e.event_start, e.event_end, lang)]);

  const caution = e.flags?.length > 0 && Object.keys(e.ranks).length === 0;

  return (
    <article className="detail">
      <a href="#/" className="small">← {t.backToList}</a>

      <div className="card detail-head">
        <div className="event-head">
          {e.acronym && <strong className="acronym">{e.acronym}</strong>}
          <KindTag kind={e.kind} />
          {e.is_ieee && <span className="tag ieee">IEEE</span>}
          {Object.entries(e.ranks).map(([k, v]) => (
            <span key={k} className="tag rank">{k.toUpperCase()} {v}</span>
          ))}
          {caution && <span className="tag caution">⚠ {t.caution}</span>}
        </div>
        <h1>{e.title}</h1>
        {e.location && <p className="muted">📍 {e.location}</p>}
        {open && e.submission_deadline && (
          <p className="detail-countdown">
            {t.deadline}: <strong>{formatDeadline(e.submission_deadline, lang)}</strong> · <span className="countdown">{timeLeft(e.submission_deadline, t)}</span>
          </p>
        )}
        {!open && <p className="notice">{t.deadlinePassed}</p>}

        <div className="actions start">
          <button className={isFollowed ? 'primary' : ''} onClick={() => toggleFollow(e.id)}>
            {isFollowed ? `★ ${t.following}` : `☆ ${t.follow}`}
          </button>
          <button onClick={onCalendar} disabled={busy || !profile?.calendar_provider || !open} title={profile?.calendar_provider ? undefined : t.needCalendar}>
            📅 {t.addToCalendar}
          </button>
          {e.url && <a className="button" href={e.url} target="_blank" rel="noreferrer noopener">↗ {t.officialPage}</a>}
          <button onClick={share}>🔗 {t.share}</button>
          <button onClick={() => setRecommend(true)}>👥 {t.recommendTitle}</button>
          <button className="ghost" onClick={() => setReport(true)}>⚑ {t.report}</button>
        </div>
      </div>

      <SubmissionCard event={e} />

      <div className="detail-grid">
        <section className="card">
          <h3>{t.importantDates}</h3>
          <dl className="timeline">
            {timeline.map(([label, value, strong]) => (
              <div key={label + value} className={strong ? 'strong' : ''}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {e.deadline_tz && <p className="muted small">{t.timesLocal} {t.sourceTz}: {e.deadline_tz}</p>}
        </section>

        <section className="card">
          <h3>{t.detailsHeading}</h3>
          <dl className="facts-dl">
            {e.topics.length > 0 && (
              <div>
                <dt>{t.topicsLabel}</dt>
                <dd className="chips">{e.topics.map((id) => TOPIC_BY_ID.get(id)).filter(Boolean).map((tp) => <span key={tp!.id} className="chip static">{tp![lang]}</span>)}</dd>
              </div>
            )}
            <div>
              <dt>{t.sourceLabel}</dt>
              <dd>{e.source === 'manual' ? t.sourceManual : e.source === 'ccf' ? 'ccf-deadlines' : e.source === 'comsoc' ? 'IEEE ComSoc' : 'WikiCFP'}</dd>
            </div>
            {caution && (
              <div>
                <dt>⚠ {t.caution}</dt>
                <dd className="muted small">{e.flags.map((f) => t.flagReasons[f as keyof typeof t.flagReasons] ?? f).join(' · ')}. {t.cautionHelp}</dd>
              </div>
            )}
          </dl>
          <p className="muted small">{t.verifyNote}</p>
        </section>
      </div>
      {report && <FeedbackDialog event={e} onClose={() => setReport(false)} />}
      {recommend && <RecommendDialog event={e} onClose={() => setRecommend(false)} />}
    </article>
  );
}

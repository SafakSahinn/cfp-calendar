import { useEffect, useState } from 'react';
import { AvatarEditor } from '../components/Avatar';
import { PushCard, ReminderCard } from '../components/PushCard';
import { TOPICS } from '../../../shared/topics';
import { AccountCard, DangerZone } from '../components/AccountSettings';
import { useApp } from '../lib/app';
import { formatDeadline } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { supabase, type EventRow } from '../lib/supabase';
import { GoogleIcon, MicrosoftIcon } from './LandingPage';

/** Üye e-postaları sitede açık mı (GitHub değişkeni MEMBER_EMAILS=on); kapalıyken e-posta ayarları gösterilmez. */
const MEMBER_EMAILS = import.meta.env.VITE_MEMBER_EMAILS === 'on';

export function ProfilePage() {
  const { t, lang } = useI18n();
  const {
    session, profile, topics, followed, toggleTopic, toggleFollow,
    connectCalendar, disconnectCalendar, updateProfile, showToast, providers,
  } = useApp();
  const [followedEvents, setFollowedEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    if (followed.size === 0) {
      setFollowedEvents([]);
      return;
    }
    supabase
      .from('events')
      .select('*')
      .in('id', [...followed])
      .order('submission_deadline', { ascending: true, nullsFirst: false })
      .then(({ data }) => setFollowedEvents((data ?? []) as EventRow[]));
  }, [followed]);

  if (!profile) return <p className="muted center">{t.loading}</p>;

  const icsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ics?token=${profile.ics_token}`;
  const copy = async () => {
    await navigator.clipboard.writeText(icsUrl);
    showToast(t.copied);
  };

  const user = session!.user;
  const name = profile.display_name ?? user.email;

  return (
    <section className="profile">
      <div className="card profile-head">
        <AvatarEditor />
        <div>
          <h2>{name}</h2>
          {(profile.academic_title || profile.institution) && (
            <p>
              {profile.academic_title && t.titles[profile.academic_title]}
              {profile.academic_title && profile.institution && ' · '}
              {profile.institution}
              {profile.department && ` — ${profile.department}`}
            </p>
          )}
          <p className="muted">{profile.email}</p>
        </div>
      </div>

      <AccountCard />

      <div className="card">
        <h3>{t.calendarTitle}</h3>
        <p className="muted">{t.calendarText}</p>
        {profile.calendar_provider ? (
          <div className="connected">
            {profile.calendar_provider === 'google' ? <GoogleIcon /> : <MicrosoftIcon />}
            <span>
              {t.connectedTo}: <strong>{profile.calendar_provider === 'google' ? 'Google' : 'Microsoft'}</strong>
              {profile.calendar_account && ` (${profile.calendar_account})`}
            </span>
            <button className="small ghost" onClick={disconnectCalendar}>{t.disconnect}</button>
          </div>
        ) : null}
        <div className="row">
          <button className="provider" onClick={() => connectCalendar('google')}>
            <GoogleIcon /> {t.connectGoogle}
          </button>
          {providers.microsoft && (
            <button className="provider" onClick={() => connectCalendar('microsoft')}>
              <MicrosoftIcon /> {t.connectMicrosoft}
            </button>
          )}
        </div>
      </div>

      <PushCard />
      <ReminderCard />

      <div className="card">
        <h3>{t.topicsTitle}</h3>
        <p className="muted">{t.topicsText}</p>
        <label className="check">
          <input
            type="checkbox"
            checked={profile.topic_notifications}
            onChange={(e) => updateProfile({ topic_notifications: e.target.checked })}
          />{' '}
          {t.topicNotifications}
        </label>
        {MEMBER_EMAILS && <label className="check">
          <input
            type="checkbox"
            checked={profile.email_notifications}
            onChange={(e) => updateProfile({ email_notifications: e.target.checked })}
          />{' '}
          {t.emailNotifications}
        </label>}
        {MEMBER_EMAILS && profile.email_notifications && (
          <label className="inline-field freq">
            <span className="small muted">{t.emailFrequency}</span>
            <select value={profile.email_frequency} onChange={(e) => updateProfile({ email_frequency: e.target.value as 'weekly' | 'instant' })}>
              <option value="weekly">{t.freqWeekly}</option>
              <option value="instant">{t.freqInstant}</option>
            </select>
          </label>
        )}
        {(['cs', 'ee'] as const).map((field) => (
          <div key={field} className="topic-group">
            <h4>{field === 'cs' ? t.fieldCs : t.fieldEe}</h4>
            <div className="chips">
              {TOPICS.filter((tp) => tp.field === field).map((tp) => (
                <button
                  key={tp.id}
                  className={`chip ${topics.has(tp.id) ? 'on' : ''}`}
                  onClick={() => toggleTopic(tp.id)}
                  aria-pressed={topics.has(tp.id)}
                >
                  {tp[lang]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>{t.followedTitle}</h3>
        {followedEvents.length === 0 ? (
          <p className="muted">{t.noneFollowed}</p>
        ) : (
          <ul className="followed">
            {followedEvents.map((e) => (
              <li key={e.id}>
                <span>
                  <strong>{e.acronym ?? e.title}</strong>
                  {e.submission_deadline && (
                    <span className="muted small"> · {t.deadline}: {formatDeadline(e.submission_deadline, lang)}</span>
                  )}
                </span>
                <button className="small ghost" onClick={() => toggleFollow(e.id)}>{t.unfollow}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>{t.icsTitle}</h3>
        <p className="muted">{t.icsText}</p>
        <div className="row">
          <input readOnly value={icsUrl} className="grow mono" onFocus={(e) => e.target.select()} />
          <button className="small" onClick={copy}>{t.copy}</button>
        </div>
      </div>

      <DangerZone />
    </section>
  );
}

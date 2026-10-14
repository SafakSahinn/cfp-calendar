// Başvuru: kabul sonrası işler (camera-ready / kayıt / sunum), ortak yazarlar, ortak yazar kartı ve davet sayfası.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../lib/app';
import { eventHref } from '../lib/events';
import { formatDate, timeAgo } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { siteRoot, supabase, type EventRow } from '../lib/supabase';
import { STATUSES, StatusTag, type Status } from './Submissions';

export type TaskKey = 'camera_ready_due' | 'registration_due' | 'presentation_at';
export const TASK_KEYS: TaskKey[] = ['camera_ready_due', 'registration_due', 'presentation_at'];
export type TaskDates = Record<TaskKey, string>;

/** Form: kabul sonrası tarih alanları */
export function TaskFields({ value, onChange }: { value: TaskDates; onChange: (v: TaskDates) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="task-fields">
      <legend className="small">📌 {t.afterAcceptance}</legend>
      <div className="task-grid">
        {TASK_KEYS.map((k) => (
          <label key={k} className="field">
            <span className="small">{t.taskLabels[k]}</span>
            <input type="date" value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <span className="muted small">{t.afterAcceptanceHint}</span>
    </fieldset>
  );
}

/** Görünüm: dolu kabul sonrası tarihleri (yaklaşanı vurgulu) */
export function TaskSummary({ s }: { s: Partial<Record<TaskKey, string | null>> }) {
  const { t, lang } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const items = TASK_KEYS.filter((k) => s[k]);
  if (items.length === 0) return null;
  return (
    <ul className="task-list">
      {items.map((k) => (
        <li key={k} className={s[k]! < today ? 'muted' : ''}>📌 {t.taskLabels[k]}: <strong>{formatDate(s[k]!, lang)}</strong></li>
      ))}
    </ul>
  );
}

interface Member { user_id: string; display_name: string | null; academic_title: string | null; role: 'owner' | 'coauthor' }

/** Ekip: sahip + ortak yazarlar; sahip davet bağlantısı oluşturur ve çıkarır, ortak yazar ayrılır. */
export function TeamSection({ submissionId, isOwner, onLeft }: { submissionId: string; isOwner: boolean; onLeft?: () => void }) {
  const { t } = useI18n();
  const { session, showToast } = useApp();
  const me = session?.user.id;
  const [team, setTeam] = useState<Member[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('submission_team', { p_submission: submissionId });
    setTeam((data ?? []) as Member[]);
  }, [submissionId]);
  useEffect(() => {
    load();
  }, [load]);

  const copyInvite = async (regenerate = false) => {
    const { data, error } = await supabase.rpc('submission_invite_code', { p_submission: submissionId, p_regenerate: regenerate });
    if (error) return showToast(error.message);
    await navigator.clipboard.writeText(`${siteRoot}#/ortak/${data}`);
    showToast(regenerate ? t.coauthorLinkRenewed : t.coauthorLinkCopied);
  };
  const remove = async (userId: string) => {
    if (userId === me && !window.confirm(t.coauthorLeaveConfirm)) return;
    const { error } = await supabase.rpc('remove_coauthor', { p_submission: submissionId, p_user: userId });
    if (error) return showToast(error.message);
    if (userId === me) onLeft?.();
    else load();
  };

  return (
    <div className="team">
      <h4 className="small">👥 {t.coauthors}</h4>
      <ul className="plain">
        {team.map((m) => (
          <li key={m.user_id} className="row">
            <span className="grow small">
              {m.academic_title && t.titles[m.academic_title as keyof typeof t.titles] ? `${t.titles[m.academic_title as keyof typeof t.titles]} ` : ''}
              {m.display_name ?? '—'} {m.role === 'owner' && <span className="muted">({t.submissionOwner})</span>}
            </span>
            {m.role === 'coauthor' && (isOwner || m.user_id === me) && (
              <button className="ghost small" onClick={() => remove(m.user_id)}>{m.user_id === me ? t.coauthorLeave : t.coauthorRemove}</button>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <div className="row wrap">
          <button className="small" onClick={() => copyInvite(false)}>🔗 {t.coauthorInvite}</button>
          <button className="small ghost" onClick={() => copyInvite(true)}>{t.coauthorRenew}</button>
        </div>
      )}
      {isOwner && <p className="muted small">{t.coauthorInviteHint}</p>}
    </div>
  );
}

export interface Coauthored {
  id: string; event_id: string; owner_name: string | null; status: Status; paper_title: string | null;
  submitted_at: string | null; decision_at: string | null; camera_ready_due: string | null; registration_due: string | null;
  presentation_at: string | null; shared_notes: string | null; updated_at: string;
}

export const useCoauthored = () => {
  const [rows, setRows] = useState<Coauthored[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_coauthored_submissions');
    setRows((data ?? []) as Coauthored[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { rows, reload: load };
};

/** Detay sayfası: ortak yazarı olduğum başvuru (ortak alanlar düzenlenebilir; sahibin kişisel notları yok). */
export function CoauthoredCard({ event }: { event: EventRow }) {
  const { t, lang } = useI18n();
  const { showToast } = useApp();
  const { rows, reload } = useCoauthored();
  const s = rows?.find((r) => r.event_id === event.id);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ status: Status; paper_title: string; shared_notes: string } & TaskDates>({
    status: 'planning', paper_title: '', shared_notes: '', camera_ready_due: '', registration_due: '', presentation_at: '',
  });
  useEffect(() => {
    if (s) setForm({
      status: s.status, paper_title: s.paper_title ?? '', shared_notes: s.shared_notes ?? '',
      camera_ready_due: s.camera_ready_due ?? '', registration_due: s.registration_due ?? '', presentation_at: s.presentation_at ?? '',
    });
  }, [s]);
  if (!s) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.rpc('update_shared_submission', {
      p_submission: s.id, p_status: form.status, p_paper_title: form.paper_title, p_submitted_at: s.submitted_at, p_decision_at: s.decision_at,
      p_camera_ready_due: form.camera_ready_due || null, p_registration_due: form.registration_due || null,
      p_presentation_at: form.presentation_at || null, p_shared_notes: form.shared_notes,
    });
    if (error) return showToast(error.message);
    setOpen(false);
    showToast(t.saved);
    reload();
  };

  return (
    <section className="card submission coauthored">
      <div className="row">
        <h3 className="grow">{t.coauthoredTitle}</h3>
        <StatusTag status={s.status} />
      </div>
      <p className="muted small">{t.coauthoredBy(s.owner_name ?? '—')} · {t.updated} {timeAgo(s.updated_at, lang)}</p>
      {!open ? (
        <>
          {s.paper_title && <p><strong>{s.paper_title}</strong></p>}
          <TaskSummary s={s} />
          {s.shared_notes && <p className="note pre">📝 {s.shared_notes}</p>}
          <button className="small" onClick={() => setOpen(true)}>{t.update}</button>
        </>
      ) : (
        <form className="email-auth left" onSubmit={save}>
          <div className="field">
            <label htmlFor="c-status">{t.status}</label>
            <select id="c-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}>
              {STATUSES.map((x) => <option key={x} value={x}>{t.statuses[x]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-title">{t.paperTitle}</label>
            <input id="c-title" maxLength={300} value={form.paper_title} onChange={(e) => setForm({ ...form, paper_title: e.target.value })} />
          </div>
          <TaskFields value={form} onChange={(v) => setForm({ ...form, ...v })} />
          <div className="field">
            <label htmlFor="c-notes">{t.sharedNotes}</label>
            <textarea id="c-notes" rows={3} maxLength={2000} value={form.shared_notes} onChange={(e) => setForm({ ...form, shared_notes: e.target.value })} placeholder={t.sharedNotesHint} />
          </div>
          <div className="row end">
            <button type="button" className="ghost" onClick={() => setOpen(false)}>{t.cancel}</button>
            <button type="submit" className="primary">{t.save}</button>
          </div>
        </form>
      )}
      <TeamSection submissionId={s.id} isOwner={false} onLeft={reload} />
    </section>
  );
}

/** #/ortak/<kod>: ortak yazar daveti */
export function JoinSubmissionPage({ code }: { code: string }) {
  const { t } = useI18n();
  const { showToast } = useApp();
  const [preview, setPreview] = useState<{ paper_title: string | null; event_acronym: string | null; event_title: string; owner_name: string | null; members: number } | null | undefined>(undefined);
  useEffect(() => {
    supabase.rpc('submission_preview', { p_code: code }).then(({ data }) => setPreview((data as never[])?.[0] ?? null));
  }, [code]);

  const join = async () => {
    const { data: id, error } = await supabase.rpc('join_submission', { p_code: code });
    if (error) return showToast(/too_many_coauthors/.test(error.message) ? t.coauthorFull : /invalid_code/.test(error.message) ? t.invalidInvite : error.message);
    const { data } = await supabase.rpc('my_coauthored_submissions');
    const ev = ((data ?? []) as Coauthored[]).find((r) => r.id === id)?.event_id;
    showToast(t.coauthorJoined);
    window.location.hash = ev ? eventHref(ev) : '#/takvimim';
  };

  if (preview === undefined) return <p className="muted center">{t.loading}</p>;
  if (preview === null) return <div className="card center"><p>{t.invalidInvite}</p></div>;
  return (
    <div className="card center join-card">
      <p className="muted">{t.coauthorInvitedBy(preview.owner_name ?? '—')}</p>
      <h2>{preview.paper_title ?? t.untitledPaper}</h2>
      <p>{preview.event_acronym ? `${preview.event_acronym} – ` : ''}{preview.event_title}</p>
      <p className="muted small">👥 {t.coauthorTeamSize(preview.members)} · {t.coauthorPrivacy}</p>
      <button className="primary" onClick={join}>{t.coauthorJoin}</button>
    </div>
  );
}

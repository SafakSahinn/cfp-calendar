// Başvuru takibi: detay sayfasındaki "Başvurum" kartı, Takvimim'deki "Başvurularım" listesi,
// grup sahibinin "Başvurular" (danışman) görünümü.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../lib/app';
import { eventHref } from '../lib/events';
import { formatDate, formatDeadline, timeAgo } from '../lib/format';
import { useMyGroups } from '../lib/groups';
import { useI18n } from '../lib/i18n';
import { supabase, type EventRow } from '../lib/supabase';

export const STATUSES = ['planning', 'submitted', 'under_review', 'revision', 'accepted', 'rejected', 'withdrawn'] as const;
export type Status = (typeof STATUSES)[number];
const ACTIVE: Status[] = ['planning', 'submitted', 'under_review', 'revision'];

export interface Submission {
  id: string;
  event_id: string;
  status: Status;
  paper_title: string | null;
  notes: string | null;
  submitted_at: string | null;
  decision_at: string | null;
  shared_group_ids: string[];
  share_with_members: boolean;
  updated_at: string;
  events?: EventRow;
}

export function StatusTag({ status }: { status: Status }) {
  const { t } = useI18n();
  return <span className={`tag st-${status}`}>{t.statuses[status]}</span>;
}

// ---------------------------------------------------------------------------
// Detay sayfası: "Başvurum"
// ---------------------------------------------------------------------------
export function SubmissionCard({ event }: { event: EventRow }) {
  const { t } = useI18n();
  const { showToast, followed, toggleFollow } = useApp();
  const { groups } = useMyGroups();
  const [sub, setSub] = useState<Submission | null | undefined>(undefined);
  const [form, setForm] = useState({ status: 'planning' as Status, paper_title: '', notes: '', shared: [] as string[], members: false });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('submissions').select('*').eq('event_id', event.id).maybeSingle().then(({ data }) => {
      const s = data as Submission | null;
      setSub(s);
      if (s) setForm({ status: s.status, paper_title: s.paper_title ?? '', notes: s.notes ?? '', shared: s.shared_group_ids, members: s.share_with_members });
    });
  }, [event.id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = {
      event_id: event.id,
      status: form.status,
      paper_title: form.paper_title.trim() || null,
      notes: form.notes.trim() || null,
      shared_group_ids: form.shared,
      share_with_members: form.shared.length > 0 && form.members,
    };
    const { data, error } = sub
      ? await supabase.from('submissions').update(row).eq('id', sub.id).select().single()
      : await supabase.from('submissions').insert(row).select().single();
    setBusy(false);
    if (error) return showToast(error.message.includes('not_a_member') ? t.notAMember : error.message);
    setSub(data as Submission);
    setOpen(false);
    if (!followed.has(event.id)) toggleFollow(event.id); // başvurulan çağrı takip listesine de girsin
    showToast(t.saved);
  };

  const remove = async () => {
    if (!sub || !window.confirm(t.confirmDeleteSubmission)) return;
    await supabase.from('submissions').delete().eq('id', sub.id);
    setSub(null);
    setForm({ status: 'planning', paper_title: '', notes: '', shared: [], members: false });
  };

  if (sub === undefined) return null;

  return (
    <section className="card submission">
      <div className="row">
        <h3 className="grow">{t.mySubmission}</h3>
        {sub && <StatusTag status={sub.status} />}
      </div>
      {!sub && !open && (
        <>
          <p className="muted small">{t.submissionIntro}</p>
          <button className="small" onClick={() => setOpen(true)}>📄 {t.trackSubmission}</button>
        </>
      )}
      {sub && !open && (
        <>
          {sub.paper_title && <p><strong>{sub.paper_title}</strong></p>}
          <p className="muted small">
            {sub.submitted_at && `${t.submittedOn}: ${formatDate(sub.submitted_at, 'tr')} · `}
            {sub.decision_at && `${t.decidedOn}: ${formatDate(sub.decision_at, 'tr')} · `}
            {event.notification_date && ACTIVE.includes(sub.status) && `${t.dateNotification}: ${formatDate(event.notification_date, 'tr')} · `}
            {t.updated} {timeAgo(sub.updated_at, 'tr')}
          </p>
          {sub.shared_group_ids.length > 0 && <p className="muted small">👥 {t.sharedWith(sub.shared_group_ids.length)}{sub.share_with_members && ` · ${t.visibleToMembers}`}</p>}
          <button className="small" onClick={() => setOpen(true)}>{t.update}</button>
        </>
      )}
      {open && (
        <form className="email-auth left" onSubmit={save}>
          <div className="field">
            <label htmlFor="s-status">{t.status}</label>
            <select id="s-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}>
              {STATUSES.map((s) => <option key={s} value={s}>{t.statuses[s]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-title">{t.paperTitle}</label>
            <input id="s-title" maxLength={300} value={form.paper_title} onChange={(e) => setForm({ ...form, paper_title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="s-notes">{t.privateNotes}</label>
            <textarea id="s-notes" rows={3} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t.privateNotesHint} />
          </div>
          {groups && groups.length > 0 && (
            <fieldset className="share-groups">
              <legend className="small">{t.shareWithAdvisors}</legend>
              {groups.map((g) => (
                <label key={g.id} className="check">
                  <input
                    type="checkbox"
                    checked={form.shared.includes(g.id)}
                    onChange={(e) => setForm({ ...form, shared: e.target.checked ? [...form.shared, g.id] : form.shared.filter((x) => x !== g.id) })}
                  />{' '}
                  {g.name} {g.role === 'owner' ? `(${t.roleOwner})` : g.owner_name ? `— ${g.owner_name}` : ''}
                </label>
              ))}
              <span className="muted small">{t.shareHint}</span>
              <label className="check">
                <input type="checkbox" disabled={form.shared.length === 0} checked={form.shared.length > 0 && form.members} onChange={(e) => setForm({ ...form, members: e.target.checked })} />{' '}
                {t.shareWithMembers}
              </label>
              <span className="muted small">{t.shareMembersHint}</span>
            </fieldset>
          )}
          <div className="row end">
            {sub && <button type="button" className="ghost" onClick={remove}>{t.deleteRecord}</button>}
            <button type="button" className="ghost" onClick={() => setOpen(false)}>{t.cancel}</button>
            <button type="submit" className="primary" disabled={busy}>{t.save}</button>
          </div>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Takvimim → Başvurularım
// ---------------------------------------------------------------------------
export function MySubmissions() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Submission[] | null>(null);

  useEffect(() => {
    supabase.from('submissions').select('*, events(*)').order('updated_at', { ascending: false })
      .then(({ data }) => setRows(((data ?? []) as Submission[]).filter((s) => s.events)));
  }, []);

  if (rows === null) return <p className="muted center">{t.loading}</p>;
  if (rows.length === 0) return <div className="card center"><p>{t.noSubmissions}</p></div>;

  const counts = STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length] as const).filter(([, n]) => n > 0);
  return (
    <div className="page-stack">
      <div className="pipeline">
        {counts.map(([s, n]) => (
          <div key={s} className={`pipe st-${s}`}><strong>{n}</strong><span>{t.statuses[s]}</span></div>
        ))}
      </div>
      <div className="list">
        {rows.map((r) => (
          <a key={r.id} href={eventHref(r.event_id)} className="card sub-row">
            <div className="row">
              <strong className="grow">{r.events!.acronym ?? r.events!.title}</strong>
              <StatusTag status={r.status} />
            </div>
            {r.paper_title && <span className="small">📄 {r.paper_title}</span>}
            <span className="muted small">
              {r.events!.submission_deadline && `${t.deadline}: ${formatDeadline(r.events!.submission_deadline, lang)}`}
              {r.events!.notification_date && ACTIVE.includes(r.status) && ` · ${t.dateNotification}: ${formatDate(r.events!.notification_date, lang)}`}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grup sahibi → Başvurular (danışman görünümü)
// ---------------------------------------------------------------------------
interface GroupSubmission {
  user_id: string; display_name: string | null; academic_title: string | null; event_id: string;
  event_acronym: string | null; event_title: string; submission_deadline: string | null; notification_date: string | null;
  status: Status; paper_title: string | null; submitted_at: string | null; decision_at: string | null; updated_at: string;
}

export function GroupSubmissions({ groupId }: { groupId: string }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<GroupSubmission[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('group_submissions', { p_group: groupId });
    setRows((data ?? []) as GroupSubmission[]);
  }, [groupId]);
  useEffect(() => {
    load();
  }, [load]);

  if (rows === null) return <p className="muted center">{t.loading}</p>;
  return (
    <div className="page-stack">
      <p className="muted small">{t.advisorViewNote}</p>
      {rows.length === 0 ? (
        <p className="muted">{t.noSharedSubmissions}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t.member}</th><th>{t.call}</th><th>{t.paperTitle}</th><th>{t.status}</th><th>{t.dates}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.user_id}-${r.event_id}`}>
                  <td>
                    <strong>{r.display_name ?? t.unnamed}</strong>
                    {r.academic_title && <div className="muted small">{t.titles[r.academic_title as keyof typeof t.titles]}</div>}
                  </td>
                  <td><a href={eventHref(r.event_id)}>{r.event_acronym ?? r.event_title}</a></td>
                  <td>{r.paper_title ?? '—'}</td>
                  <td><StatusTag status={r.status} /></td>
                  <td className="small">
                    {r.submission_deadline && <div>{t.deadline}: {formatDeadline(r.submission_deadline, lang)}</div>}
                    {r.submitted_at && <div>{t.submittedOn}: {formatDate(r.submitted_at, lang)}</div>}
                    {r.decision_at && <div>{t.decidedOn}: {formatDate(r.decision_at, lang)}</div>}
                    {!r.decision_at && r.notification_date && <div className="muted">{t.dateNotification}: {formatDate(r.notification_date, lang)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

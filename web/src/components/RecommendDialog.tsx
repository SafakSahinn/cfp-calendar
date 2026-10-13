import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../lib/app';
import { canPost, groupError, useMyGroups } from '../lib/groups';
import { useI18n } from '../lib/i18n';
import { supabase, type EventRow } from '../lib/supabase';

/** Bir çağrıyı gruba öner: grup takvimine eklenir, diğer üyelere "İlgileniyor musunuz?" mesajı gider. */
export function RecommendDialog({ event, onClose }: { event: EventRow; onClose: () => void }) {
  const { t } = useI18n();
  const { showToast } = useApp();
  const { groups } = useMyGroups();
  const ref = useRef<HTMLDialogElement>(null);
  const [groupId, setGroupId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const postable = (groups ?? []).filter(canPost);

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    if (!groupId && postable[0]) setGroupId(postable[0].id);
  }, [postable, groupId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupId) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('group_add_event', { p_group: groupId, p_event: event.id, p_note: note.trim() || null });
    setBusy(false);
    if (error) {
      const k = groupError(error.message);
      return showToast(k === 'already_added' ? t.alreadyInGroup : k === 'forbidden' ? t.cannotPost : error.message);
    }
    showToast(t.recommended(data as number));
    onClose();
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form className="email-auth left" onSubmit={submit}>
        <h2>{t.recommendTitle}</h2>
        <p className="muted small"><strong>{event.acronym ?? event.title}</strong> — {t.recommendText}</p>
        {groups === null ? (
          <p className="muted">{t.loading}</p>
        ) : postable.length === 0 ? (
          <p className="muted">{t.noPostableGroups} <a href="#/gruplar">{t.navGroups} →</a></p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="rec-group">{t.group}</label>
              <select id="rec-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                {postable.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.member_count})</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rec-note">{t.noteOptional}</label>
              <textarea id="rec-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.recommendPlaceholder} />
            </div>
          </>
        )}
        <div className="row end">
          <button type="button" className="ghost" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="primary" disabled={busy || !groupId}>{t.recommend}</button>
        </div>
      </form>
    </dialog>
  );
}

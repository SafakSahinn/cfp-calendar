// Grup sayfası: ortak takvimdeki bir çağrının altında üyelerin kısa yorumları.

import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/app';
import { timeAgo } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';

export interface GroupComment {
  id: string;
  event_id: string;
  user_id: string;
  display_name: string | null;
  academic_title: string | null;
  body: string;
  created_at: string;
}

export function CommentThread({ groupId, eventId, comments, me, isOwner, reload }: {
  groupId: string; eventId: string; comments: GroupComment[]; me: string; isOwner: boolean; reload: () => void;
}) {
  const { t, lang } = useI18n();
  const { showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('group_comments').insert({ group_id: groupId, event_id: eventId, body: text.trim() });
    setBusy(false);
    if (error) return showToast(/rate_limited/.test(error.message) ? t.commentRateLimited : error.message);
    setText('');
    reload();
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from('group_comments').delete().eq('id', id);
    if (error) return showToast(error.message);
    reload();
  };

  return (
    <div className="comments">
      <button className="ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>
        💬 {t.comments}{comments.length > 0 && ` (${comments.length})`}
      </button>
      {open && (
        <div className="comment-box">
          {comments.length === 0 && <p className="muted small">{t.commentsNone}</p>}
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <div className="row">
                <strong className="small">
                  {c.academic_title && t.titles[c.academic_title as keyof typeof t.titles] ? `${t.titles[c.academic_title as keyof typeof t.titles]} ` : ''}
                  {c.display_name ?? '—'}
                </strong>
                <span className="muted small grow">{timeAgo(c.created_at, lang)}</span>
                {(c.user_id === me || isOwner) && (
                  <button className="ghost small" onClick={() => remove(c.id)}>{t.commentDelete}</button>
                )}
              </div>
              <p className="pre">{c.body}</p>
            </div>
          ))}
          <form className="comment-form" onSubmit={send}>
            <textarea rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t.commentPlaceholder} aria-label={t.comments} />
            <button type="submit" className="small primary" disabled={busy || !text.trim()}>{t.commentSend}</button>
          </form>
        </div>
      )}
    </div>
  );
}

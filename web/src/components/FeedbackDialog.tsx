import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../lib/app';
import { useI18n } from '../lib/i18n';
import { supabase, type EventRow } from '../lib/supabase';

/** Etkinlik önerisi (event yoksa) veya hatalı bilgi bildirimi (event verilirse). */
export function FeedbackDialog({ event, onClose }: { event: EventRow | null; onClose: () => void }) {
  const { t } = useI18n();
  const { session, showToast } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 3) return setError(t.feedbackTooShort);
    if (!event && !/^https?:\/\/\S+\.\S+/.test(url.trim())) return setError(t.feedbackNeedUrl);
    setBusy(true);
    const { error } = await supabase.from('feedback').insert({
      user_id: session!.user.id,
      kind: event ? 'wrong_info' : 'suggest_event',
      event_id: event?.id ?? null,
      url: url.trim() || null,
      message: message.trim().slice(0, 2000),
    });
    setBusy(false);
    if (error) return setError(error.message);
    showToast(t.feedbackThanks);
    onClose();
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form className="email-auth left" onSubmit={submit} noValidate>
        <h2>{event ? t.reportTitle : t.suggestTitle}</h2>
        <p className="muted small">
          {event ? (
            <>
              <strong>{event.acronym ?? event.title}</strong> — {t.reportText}
            </>
          ) : (
            t.suggestText
          )}
        </p>
        <div className="field">
          <label htmlFor="fb-url">{event ? t.feedbackUrlOptional : t.feedbackUrl}</label>
          <input id="fb-url" type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="fb-msg">{t.feedbackMessage}</label>
          <textarea
            id="fb-msg"
            rows={4}
            maxLength={2000}
            placeholder={event ? t.reportPlaceholder : t.suggestPlaceholder}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="row end">
          <button type="button" className="ghost" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="primary" disabled={busy}>{t.send}</button>
        </div>
      </form>
    </dialog>
  );
}

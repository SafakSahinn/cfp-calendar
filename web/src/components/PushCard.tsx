import { useEffect, useState } from 'react';
import { useApp } from '../lib/app';
import { useI18n } from '../lib/i18n';
import { disablePush, enablePush, pushState, testNotification, type PushState } from '../lib/push';
import { supabase } from '../lib/supabase';

/** Profil: "Bu cihazda anlık bildirim" (telefon / bilgisayar). */
export function PushCard() {
  const { t } = useI18n();
  const { showToast } = useApp();
  const [state, setState] = useState<PushState | null>(null);
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setState(await pushState().catch(() => 'unsupported' as const));
    const { count } = await supabase.from('push_subscriptions').select('*', { count: 'exact', head: true });
    setDevices(count ?? 0);
  };
  useEffect(() => {
    refresh();
  }, []);

  const run = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    try {
      setState(await fn());
    } catch (e) {
      showToast(`${t.pushError}: ${(e as Error).message}`);
    }
    setBusy(false);
    refresh();
  };

  if (state === null) return null;
  return (
    <div className="card push-card">
      <h3>🔔 {t.pushTitle}</h3>
      <p className="muted">{t.pushText}</p>
      {state === 'on' && (
        <>
          <p className="connected">✅ {t.pushOn}</p>
          <div className="row">
            <button className="small" onClick={() => testNotification(t.pushTestTitle, t.pushTestBody)}>{t.pushTest}</button>
            <button className="small ghost" disabled={busy} onClick={() => run(disablePush)}>{t.pushDisable}</button>
          </div>
        </>
      )}
      {state === 'off' && <button className="primary" disabled={busy} onClick={() => run(enablePush)}>🔔 {t.pushEnable}</button>}
      {state === 'denied' && <p className="notice">{t.pushDenied}</p>}
      {state === 'ios-install' && <p className="notice">{t.pushIosInstall}</p>}
      {state === 'unsupported' && <p className="muted small">{t.pushUnsupported}</p>}
      {devices > 0 && <p className="muted small">{t.pushDevices(devices)}</p>}
    </div>
  );
}

/** Profil: son başvurudan kaç gün önce hatırlatılsın. */
export function ReminderCard() {
  const { t } = useI18n();
  const { profile, updateProfile } = useApp();
  if (!profile) return null;
  const days = profile.reminder_days ?? [7];
  const toggle = (d: number) => updateProfile({ reminder_days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => b - a) });
  return (
    <div className="card reminders">
      <h3>⏰ {t.remindersTitle}</h3>
      <p className="muted">{t.remindersText}</p>
      <div className="row wrap">
        {[14, 7, 3, 1].map((d) => (
          <label key={d} className="check"><input type="checkbox" checked={days.includes(d)} onChange={() => toggle(d)} /> {t.reminderDay(d)}</label>
        ))}
      </div>
      <p className="muted small">{t.remindersNote}</p>
    </div>
  );
}

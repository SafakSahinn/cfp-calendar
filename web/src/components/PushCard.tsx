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

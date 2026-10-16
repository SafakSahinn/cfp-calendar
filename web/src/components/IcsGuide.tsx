// Profil → Takvim aboneliği (ICS): tek tıkla ekleme bağlantıları + Outlook / Google / Apple için adım adım rehber.
// Microsoft girişi kurulmadığı için Outlook (okul/iş hesabı dahil) kullananların asıl yolu bu.

import { useI18n } from '../lib/i18n';

export function IcsGuide({ url }: { url: string }) {
  const { t, lang } = useI18n();
  if (!url) return null;
  const enc = encodeURIComponent(url);
  const webcal = url.replace(/^https?:\/\//, 'webcal://');
  const name = encodeURIComponent('CFP Calendar');
  const links: [string, string][] = [
    [t.icsAddOutlookCom, `https://outlook.live.com/calendar/0/addfromweb?url=${enc}&name=${name}`],
    [t.icsAddOutlookWork, `https://outlook.office.com/calendar/0/addfromweb?url=${enc}&name=${name}`],
    [t.icsAddGoogle, `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`],
    [t.icsAddApple, webcal],
  ];
  const steps = t.icsSteps;
  return (
    <div className="ics-guide">
      <div className="row wrap">
        {links.map(([label, href]) => (
          <a key={label} className="button small" href={href} target="_blank" rel="noreferrer noopener">{label}</a>
        ))}
      </div>
      <details>
        <summary className="small">{t.icsHowTo}</summary>
        <div className="ics-steps">
          {steps.map((s) => (
            <div key={s.title}>
              <strong className="small">{s.title}</strong>
              <ol className="small">{s.items.map((it) => <li key={it}>{it}</li>)}</ol>
            </div>
          ))}
          <p className="muted small">{t.icsRefreshNote}</p>
          <p className="muted small">{lang === 'tr' ? '🔒 ' : '🔒 '}{t.icsPrivacyNote}</p>
        </div>
      </details>
    </div>
  );
}

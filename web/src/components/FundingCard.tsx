import { formatDeadline, timeLeft } from '../lib/format';
import { funding, TUBITAK_URL_A, TUBITAK_URL_B } from '../lib/funding';
import { useI18n } from '../lib/i18n';
import type { EventRow } from '../lib/supabase';

/** "Bu konferansa gitmek için TÜBİTAK 2224 desteğine ne zamana kadar başvurmalıyım?" */
export function FundingCard({ event }: { event: EventRow }) {
  const { t, lang } = useI18n();
  const f = funding(event);
  if (!f) return null;
  const url = f.program === '2224-A' ? TUBITAK_URL_A : TUBITAK_URL_B;
  return (
    <section className={`card funding ${f.openNow ? 'open' : ''}`}>
      <div className="row">
        <h3 className="grow">💰 {t.fundingTitle(f.program)}</h3>
        {f.openNow && <span className="tag st-accepted">{t.fundingOpenNow}</span>}
        {f.missed && <span className="tag st-rejected">{t.fundingMissed}</span>}
      </div>
      {f.missed ? (
        <p className="muted">{t.fundingMissedText(f.period.name)}</p>
      ) : (
        <p>
          {t.fundingPeriod(f.period.name)}:{' '}
          <strong>{f.period.estimated ? t.fundingEstimated(new Date(f.period.close).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', { month: 'long', year: 'numeric' })) : formatDeadline(f.period.close, lang)}</strong>
          {f.openNow && <> · <span className="countdown">{timeLeft(f.period.close, t)}</span></>}
        </p>
      )}
      <p className="muted small">{f.program === '2224-A' ? t.fundingRulesA : t.fundingRulesB}</p>
      <a href={url} target="_blank" rel="noreferrer noopener" className="small">↗ {t.fundingOfficial}</a>
    </section>
  );
}

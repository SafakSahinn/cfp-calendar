// "Türkiye'de" filtresi açıkken: Türkiye'de düzenlenen CS/EE konferans serileri (shared/turkiye.ts).
// Bu konferanslar çoğu kaynakta yer almadığı için ayrıca listelenir; çağrısı yayımlanmamış seriler takip edilebilir.

import { useState } from 'react';
import { latestEdition, TR_SERIES } from '../../../shared/turkiye';
import { useApp } from '../lib/app';
import { eventHref } from '../lib/events';
import { formatDate, formatRange } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { EventRow } from '../lib/supabase';

export function TurkeySeries({ events }: { events: EventRow[] }) {
  const { t, lang } = useI18n();
  const { seriesFollowed, toggleSeries } = useApp();
  const [open, setOpen] = useState(true);
  const months = t.monthNames;

  return (
    <section className="card tr-series">
      <div className="row">
        <h3 className="grow">🇹🇷 {t.trSeriesTitle}</h3>
        <button className="ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? t.hide : t.show}</button>
      </div>
      {open && (
        <>
          <p className="muted small">{t.trSeriesHint}</p>
          <ul className="plain">
            {TR_SERIES.map((s) => {
              const current = events.find((e) => e.series_key === s.key);
              const last = latestEdition(s);
              const following = seriesFollowed.has(s.key);
              return (
                <li key={s.key} className="tr-row">
                  <div className="grow">
                    <strong>{s.acronym}</strong> <span>{s.name[lang]}</span>
                    {s.home && <> · <a href={s.home} target="_blank" rel="noreferrer noopener" className="small">↗</a></>}
                    <div className="muted small">
                      {current ? (
                        <a href={eventHref(current.id)} className="applying">✅ {t.trOpenNow(current.submission_deadline ? formatDate(current.submission_deadline.slice(0, 10), lang) : '—')}</a>
                      ) : (
                        <span>{t.trExpected(months[s.deadlineMonth - 1], months[s.eventMonth - 1])}</span>
                      )}
                      {last && !current && (
                        <span> · {t.trLast(last.year, last.deadline ? formatDate(last.deadline, lang) : '—', formatRange(last.eventStart, last.eventEnd, lang), last.location.split(',')[0])}</span>
                      )}
                    </div>
                  </div>
                  <button className={`small ${following ? 'primary' : ''}`} onClick={() => toggleSeries(s.key, s.acronym)}>
                    {following ? `★ ${t.seriesFollowing}` : `☆ ${t.seriesFollow}`}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

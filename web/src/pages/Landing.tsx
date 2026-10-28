import { useI18n } from '../lib/i18n';
import './landing.css';

const FEATURES = [
  ['sources', '🗂️'],
  ['calendar', '📅'],
  ['reminders', '🔔'],
  ['forYou', '✨'],
  ['groups', '👥'],
  ['map', '🗺️'],
] as const;

const STEPS = ['step1', 'step2', 'step3'] as const;

export const goSignIn = () => { window.location.hash = '#/giris'; };

// Kahraman bölümündeki süs: son tarihleri işaretli küçük bir ay takvimi ve etrafında çağrı etiketleri
const MARKS: Record<number, 'open' | 'deadline' | 'conf'> = { 3: 'open', 9: 'deadline', 12: 'open', 17: 'deadline', 22: 'conf', 23: 'conf', 24: 'conf', 29: 'deadline' };
const TAGS: [number, number, string, 'open' | 'deadline' | 'conf'][] = [
  [-8, 34, 'ICASSP · 7d', 'deadline'], [236, 70, 'DAC', 'open'], [-18, 236, 'SIU 2027', 'conf'], [232, 262, 'IEEE Access', 'open'],
];

function CalendarArt({ month }: { month: string }) {
  const cell = 34;
  return (
    <svg className="landing-art" viewBox="-30 0 360 320" aria-hidden="true">
      <rect className="card" x="20" y="20" width="270" height="280" rx="18" />
      <rect className="card-head" x="20" y="20" width="270" height="46" rx="18" />
      <rect className="card-head" x="20" y="48" width="270" height="18" />
      <text className="month" x="155" y="43">{month}</text>
      {Array.from({ length: 35 }, (_, i) => {
        const day = i - 1;
        const x = 36 + (i % 7) * cell;
        const y = 80 + Math.floor(i / 7) * cell + 8;
        const mark = MARKS[day];
        return (
          <g key={i} className={mark ? `day ${mark}` : 'day'}>
            {mark && <rect x={x} y={y} width={cell - 6} height={cell - 6} rx="8" />}
            {day > 0 && day <= 30 && <text x={x + (cell - 6) / 2} y={y + (cell - 6) / 2}>{day}</text>}
          </g>
        );
      })}
      {TAGS.map(([x, y, label, kind], i) => (
        <g key={label} className={`tag ${kind}`} style={{ animationDelay: `${i * 0.6}s` }}>
          <rect x={x} y={y} width={label.length * 7.4 + 22} height="28" rx="14" />
          <text x={x + (label.length * 7.4 + 22) / 2} y={y + 14}>{label}</text>
        </g>
      ))}
    </svg>
  );
}

export function Landing() {
  const { t } = useI18n();
  const L = t.landing;

  return (
    <div className="landing-page">
      <header className="landing-hero">
        <div>
          <p className="landing-eyebrow">{L.eyebrow}</p>
          <h1>{t.heroTitle}</h1>
          <p className="landing-lead">{t.heroText}</p>
          <div className="landing-actions">
            <button className="primary big" onClick={goSignIn}>{L.start}</button>
            <button className="big" onClick={() => document.getElementById('landing-how')?.scrollIntoView({ behavior: 'smooth' })}>
              {L.how}
            </button>
          </div>
          <p className="muted small">{L.free}</p>
        </div>
        <CalendarArt month={L.month} />
      </header>

      <ul className="landing-stats">
        {L.stats.map(([big, small]) => (
          <li key={small}><b>{big}</b><span>{small}</span></li>
        ))}
      </ul>

      <section className="landing-section">
        <h2>{L.featuresTitle}</h2>
        <div className="landing-features">
          {FEATURES.map(([id, icon]) => (
            <article key={id}>
              <span className="landing-icon">{icon}</span>
              <h3>{L.features[id][0]}</h3>
              <p>{L.features[id][1]}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="landing-how" className="landing-section">
        <h2>{L.howTitle}</h2>
        <ol className="landing-steps">
          {STEPS.map((id, i) => (
            <li key={id}>
              <span className="landing-step-no">{i + 1}</span>
              <h3>{L.steps[id][0]}</h3>
              <p>{L.steps[id][1]}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section landing-privacy">
        <h2>🔒 {L.privacyTitle}</h2>
        <ul>
          {L.privacy.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </section>

      <section className="landing-cta">
        <h2>{L.ctaTitle}</h2>
        <button className="primary big" onClick={goSignIn}>{L.start}</button>
      </section>
    </div>
  );
}

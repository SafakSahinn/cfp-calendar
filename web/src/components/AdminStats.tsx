// Yönetim → İstatistikler: büyüme ve kullanım. Tek seri grafikler (efsane gerekmez), tek renk (--chart-1),
// üzerine gelince değer; her grafiğin bir de tablo görünümü var.

import { useState } from 'react';
import { TOPIC_BY_ID } from '../../../shared/topics';
import { eventHref } from '../lib/events';

export interface UsageStats {
  signups_weekly: { week: string; n: number }[];
  top_events: { id: string; acronym: string | null; title: string; n: number }[];
  top_topics: { topic: string; n: number }[];
  adoption: {
    users: number; calendar: number; push_users: number; push_devices: number; series_users: number;
    topic_users: number; group_users: number; submission_users: number; comments_30d: number;
  };
}

const weekLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

/** Haftalık yeni üye: sütun grafiği (12 hafta). */
function WeeklyColumns({ data }: { data: UsageStats['signups_weekly'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 180, padL = 28, padB = 22, padT = 18;
  const max = Math.max(1, ...data.map((d) => d.n));
  const step = (W - padL) / data.length;
  const bw = Math.max(6, Math.min(28, step - 2 * 2)); // 2px yüzey boşluğu her iki yanda
  const y = (n: number) => H - padB - (n / max) * (H - padB - padT);
  const total = data.reduce((s, d) => s + d.n, 0);
  return (
    <figure className="chart">
      <figcaption>
        <strong>Haftalık yeni üye</strong> <span className="muted small">son 12 hafta · toplam {total}</span>
      </figcaption>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Son 12 haftada haftalık yeni üye sayısı, toplam ${total}`}>
          {/* yatay kılavuz: sadece taban ve en üst değer */}
          <line x1={padL} x2={W} y1={H - padB} y2={H - padB} className="axis" />
          <line x1={padL} x2={W} y1={y(max)} y2={y(max)} className="grid" />
          <text x={padL - 6} y={y(max) + 4} className="tick" textAnchor="end">{max}</text>
          <text x={padL - 6} y={H - padB + 4} className="tick" textAnchor="end">0</text>
          {data.map((d, i) => {
            const x = padL + i * step + (step - bw) / 2;
            const top = y(d.n);
            const h = H - padB - top;
            return (
              <g key={d.week} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {/* geniş, görünmez dokunma alanı */}
                <rect x={padL + i * step} y={padT} width={step} height={H - padB - padT} fill="transparent" />
                {d.n > 0 && (
                  <path
                    className={`bar ${hover === i ? 'on' : ''}`}
                    d={`M${x},${H - padB} V${top + Math.min(4, h)} Q${x},${top} ${x + Math.min(4, bw / 2)},${top} H${x + bw - Math.min(4, bw / 2)} Q${x + bw},${top} ${x + bw},${top + Math.min(4, h)} V${H - padB} Z`}
                  />
                )}
                {i % 2 === 1 && <text x={x + bw / 2} y={H - 6} className="tick" textAnchor="middle">{weekLabel(d.week)}</text>}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="chart-tip" style={{ left: `${((padL + hover * step + step / 2) / W) * 100}%` }}>
            <span className="muted">{weekLabel(data[hover].week)} haftası</span>
            <strong>{data[hover].n} üye</strong>
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary className="small">Tablo olarak göster</summary>
        <table><thead><tr><th>Hafta</th><th>Yeni üye</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.week}><td>{weekLabel(d.week)}</td><td>{d.n}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

/** Sıralı yatay çubuklar (en çok takip edilen çağrılar / konular). */
function RankedBars({ title, sub, rows, empty }: { title: string; sub: string; rows: { key: string; label: React.ReactNode; n: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <figure className="chart">
      <figcaption><strong>{title}</strong> <span className="muted small">{sub}</span></figcaption>
      {rows.length === 0 ? <p className="muted small">{empty}</p> : (
        <ol className="hbars">
          {rows.map((r) => (
            <li key={r.key} title={`${r.n}`}>
              <span className="hbar-label">{r.label}</span>
              <span className="hbar-track"><span className="hbar" style={{ width: `${(r.n / max) * 100}%` }} /></span>
              <span className="hbar-value">{r.n}</span>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}

export function AdminStats({ data }: { data: UsageStats }) {
  const a = data.adoption;
  const pct = (n: number) => (a.users ? `%${Math.round((n / a.users) * 100)}` : '—');
  const tiles: [string, number, string][] = [
    ['Takvim bağlayan', a.calendar, `üyelerin ${pct(a.calendar)}`],
    ['Telefon bildirimi açık', a.push_users, `${a.push_devices} cihaz · ${pct(a.push_users)}`],
    ['Konu seçen', a.topic_users, `üyelerin ${pct(a.topic_users)}`],
    ['Seri takip eden', a.series_users, `üyelerin ${pct(a.series_users)}`],
    ['Grupta olan', a.group_users, `üyelerin ${pct(a.group_users)}`],
    ['Başvuru takip eden', a.submission_users, `üyelerin ${pct(a.submission_users)}`],
    ['Grup yorumu (30 gün)', a.comments_30d, 'toplam yorum'],
  ];
  return (
    <div className="page-stack">
      <WeeklyColumns data={data.signups_weekly} />
      <div>
        <h3>Özellik kullanımı</h3>
        <div className="stat-grid">
          {tiles.map(([label, value, sub]) => (
            <div key={label} className="card stat">
              <span className="muted small">{label}</span>
              <strong>{value}</strong>
              <span className="muted small">{sub}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="chart-pair">
        <RankedBars
          title="En çok takip edilen çağrılar" sub="başvurusu açık olanlar" empty="Henüz takip yok."
          rows={data.top_events.map((e) => ({ key: e.id, n: e.n, label: <a href={eventHref(e.id)}>{e.acronym ?? e.title.slice(0, 40)}</a> }))}
        />
        <RankedBars
          title="En popüler ilgi alanları" sub="konu seçen üye sayısı" empty="Henüz konu seçen yok."
          rows={data.top_topics.map((t) => ({ key: t.topic, n: t.n, label: TOPIC_BY_ID.get(t.topic)?.tr ?? t.topic }))}
        />
      </div>
    </div>
  );
}

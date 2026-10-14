// Başvuruları dışa aktarma (CSV / yazdırılabilir liste) — saf fonksiyonlar; tarayıcıya bağımlı değil, birim testlenir.

export type ExportStatus = 'planning' | 'submitted' | 'under_review' | 'revision' | 'accepted' | 'rejected' | 'withdrawn';

export interface ExportRow {
  status: ExportStatus;
  paper_title: string | null;
  notes: string | null;
  submitted_at: string | null;
  decision_at: string | null;
  updated_at: string;
  events: {
    acronym: string | null;
    title: string;
    kind: string;
    location: string | null;
    url: string | null;
    submission_deadline: string | null;
    event_start: string | null;
    event_end: string | null;
  };
}

export interface ExportLabels {
  statuses: Record<ExportStatus, string>;
  kinds: Record<string, string>;
  columns: {
    status: string; paper: string; acronym: string; venue: string; kind: string; location: string; eventDates: string;
    deadline: string; submitted: string; decision: string; link: string; notes: string;
  };
  reportTitle: string;
  generated: string;
  owner: string;
  dateLocale: string;
}

/** Faaliyet raporunda anlamlı sıra: önce sonuçlananlar */
export const STATUS_ORDER: ExportStatus[] = ['accepted', 'under_review', 'revision', 'submitted', 'planning', 'rejected', 'withdrawn'];

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** Seçilen yıla ait mi: etkinlik yılı, yoksa gönderim / son başvuru yılı */
export function yearOf(r: ExportRow): number | null {
  const d = r.events.event_start ?? r.submitted_at ?? r.events.submission_deadline;
  return d ? +d.slice(0, 4) : null;
}

export function filterByYear(rows: ExportRow[], year: number | null): ExportRow[] {
  return year === null ? rows : rows.filter((r) => yearOf(r) === year);
}

function sortRows(rows: ExportRow[]): ExportRow[] {
  return [...rows].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || (b.events.event_start ?? '').localeCompare(a.events.event_start ?? ''),
  );
}

const csvCell = (v: string) => {
  // Excel'in formül olarak yorumlamasını engelle (CSV enjeksiyonu)
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Türkçe Excel için ';' ayraçlı, UTF-8 BOM'lu CSV. */
export function toCsv(rows: ExportRow[], L: ExportLabels, includeNotes: boolean): string {
  const c = L.columns;
  const head = [c.status, c.paper, c.acronym, c.venue, c.kind, c.location, c.eventDates, c.deadline, c.submitted, c.decision, c.link, ...(includeNotes ? [c.notes] : [])];
  const lines = sortRows(rows).map((r) => {
    const e = r.events;
    const dates = e.event_start ? (e.event_end && e.event_end !== e.event_start ? `${e.event_start} – ${e.event_end}` : e.event_start) : '';
    return [
      L.statuses[r.status], r.paper_title ?? '', e.acronym ?? '', e.title, L.kinds[e.kind] ?? e.kind, e.location ?? '', dates,
      day(e.submission_deadline), day(r.submitted_at), day(r.decision_at), e.url ?? '', ...(includeNotes ? [r.notes ?? ''] : []),
    ].map(csvCell).join(';');
  });
  return '﻿' + [head.map(csvCell).join(';'), ...lines].join('\r\n') + '\r\n';
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Yazdırılabilir (PDF'e kaydedilebilir) liste: durum başlıkları altında kaynakça benzeri satırlar. */
export function toPrintHtml(rows: ExportRow[], L: ExportLabels, opts: { includeNotes: boolean; ownerName: string | null; year: number | null; now?: Date }): string {
  const fmt = (iso: string | null) =>
    iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(L.dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const groups = STATUS_ORDER.map((s) => [s, sortRows(rows).filter((r) => r.status === s)] as const).filter(([, g]) => g.length > 0);
  const title = `${L.reportTitle}${opts.year ? ` · ${opts.year}` : ''}`;
  const body = groups.map(([s, g]) => `
    <h2>${esc(L.statuses[s])} <span>(${g.length})</span></h2>
    <ol>${g.map((r) => {
      const e = r.events;
      const venue = `${e.acronym ? `${esc(e.acronym)} – ` : ''}${esc(e.title)}`;
      const place = [e.location, e.event_start ? (e.event_end && e.event_end !== e.event_start ? `${fmt(e.event_start)} – ${fmt(e.event_end)}` : fmt(e.event_start)) : '']
        .filter(Boolean).map((x) => esc(x!)).join(', ');
      const meta = [r.submitted_at && `${esc(L.columns.submitted)}: ${fmt(r.submitted_at)}`, r.decision_at && `${esc(L.columns.decision)}: ${fmt(r.decision_at)}`]
        .filter(Boolean).join(' · ');
      return `<li>${r.paper_title ? `<strong>“${esc(r.paper_title)}”</strong>, ` : ''}<em>${venue}</em>${place ? `, ${place}` : ''}.`
        + `${meta ? `<div class="meta">${meta}</div>` : ''}`
        + `${opts.includeNotes && r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ''}</li>`;
    }).join('')}</ol>`).join('');
  return `<!doctype html><html lang="${L.dateLocale.slice(0, 2)}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font:11pt/1.5 Georgia,'Times New Roman',serif;color:#111;max-width:760px;margin:2rem auto;padding:0 1rem}
  h1{font-size:16pt;margin:0} .sub{color:#555;margin:.2rem 0 1.5rem;font:9.5pt system-ui,sans-serif}
  h2{font:600 11pt system-ui,sans-serif;border-bottom:1px solid #ccc;padding-bottom:.2rem;margin-top:1.4rem} h2 span{color:#777;font-weight:400}
  li{margin:.45rem 0} .meta,.notes{font:9pt system-ui,sans-serif;color:#555} .notes{white-space:pre-wrap;border-left:2px solid #ddd;padding-left:.5rem;margin-top:.2rem}
  @media print{body{margin:0}}
</style></head><body>
<h1>${esc(title)}</h1>
<p class="sub">${opts.ownerName ? `${esc(L.owner)}: ${esc(opts.ownerName)} · ` : ''}${esc(L.generated)}: ${fmt((opts.now ?? new Date()).toISOString())} · CFP Calendar</p>
${body}
</body></html>`;
}

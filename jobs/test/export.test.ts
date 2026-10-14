import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterByYear, toCsv, toPrintHtml, type ExportLabels, type ExportRow } from '../../web/src/lib/exportSubmissions.ts';

const L: ExportLabels = {
  statuses: { planning: 'Planlanıyor', submitted: 'Gönderildi', under_review: 'Değerlendirmede', revision: 'Revizyon', accepted: 'Kabul edildi', rejected: 'Reddedildi', withdrawn: 'Geri çekildi' },
  kinds: { conference: 'Konferans', workshop: 'Çalıştay', journal: 'Dergi' },
  columns: { status: 'Durum', paper: 'Makale', acronym: 'Kısaltma', venue: 'Yer adı', kind: 'Tür', location: 'Yer', eventDates: 'Tarihler', deadline: 'Son başvuru', submitted: 'Gönderim', decision: 'Karar', link: 'Bağlantı', notes: 'Notlar' },
  reportTitle: 'Başvurularım', generated: 'Oluşturulma', owner: 'Ad', dateLocale: 'tr-TR',
};

const row = (o: Partial<ExportRow> & { ev?: Partial<ExportRow['events']> }): ExportRow => ({
  status: 'submitted', paper_title: null, notes: null, submitted_at: null, decision_at: null, updated_at: '2026-01-01',
  ...o,
  events: { acronym: 'SIU', title: 'Sinyal İşleme Kurultayı', kind: 'conference', location: 'İstanbul, Türkiye', url: 'https://siu.example', submission_deadline: '2026-03-13T20:59:59Z', event_start: '2026-07-07', event_end: '2026-07-10', ...o.ev },
});

test('CSV: BOM + ";" ayraç, Türkçe karakter korunur, kabul edilenler önce, notlar varsayılan hariç', () => {
  const csv = toCsv([
    row({ status: 'submitted', paper_title: 'İkinci' }),
    row({ status: 'accepted', paper_title: 'Birinci; "alıntılı"', notes: 'gizli not', submitted_at: '2026-03-01T10:00:00Z', decision_at: '2026-05-18T10:00:00Z' }),
  ], L, false);
  assert.ok(csv.startsWith('﻿Durum;Makale;Kısaltma'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^Kabul edildi;"Birinci; ""alıntılı""";SIU;Sinyal İşleme Kurultayı;Konferans;İstanbul, Türkiye;2026-07-07 – 2026-07-10;2026-03-13;2026-03-01;2026-05-18;https:\/\/siu\.example$/);
  assert.ok(!csv.includes('gizli not'));
  assert.ok(toCsv([row({ notes: 'gizli not' })], L, true).includes('gizli not'));
});

test('CSV: formül enjeksiyonu etkisizleştirilir', () => {
  const csv = toCsv([row({ paper_title: '=HYPERLINK("http://evil")' })], L, false);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`));
});

test('yıl filtresi etkinlik yılına göre; yazdırma çıktısı kaçışlı ve gruplu', () => {
  const rows = [row({ paper_title: 'A' }), row({ paper_title: 'B', ev: { event_start: '2025-05-01', event_end: '2025-05-02' } })];
  assert.equal(filterByYear(rows, 2025).length, 1);
  assert.equal(filterByYear(rows, null).length, 2);
  const html = toPrintHtml([row({ status: 'accepted', paper_title: '<script>x</script>', notes: 'n' })], L, { includeNotes: false, ownerName: 'Ş. Şahin', year: 2026, now: new Date('2026-10-14') });
  assert.ok(!html.includes('<script>x'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.match(html, /<h2>Kabul edildi <span>\(1\)<\/span><\/h2>/);
  assert.match(html, /<title>Başvurularım · 2026<\/title>/);
  assert.ok(!html.includes('class="notes"'));
});

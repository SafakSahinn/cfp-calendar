import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderAdminReport } from '../src/adminReportRender.ts';

const base = {
  date: '2026-11-02', siteUrl: 'https://site/', users: { total: 5, new24h: 1, active7d: 3 }, groups: 1, members: 4,
  submissions: 2, calendar: 1, openEvents: 700, feedbackNew: 0, runs: [],
  maintenance: [{ key: 'tubitak' as const, level: 'todo' as const, title: 'TÜBİTAK <2027>', detail: 'x' }],
};

test('yönetici raporu: konu satırı bakım sayısını içerir, HTML kaçışı yapılır', () => {
  const r = renderAdminReport({ ...base, ok: true });
  assert.equal(r.subject, 'CFP Calendar · Günlük rapor · 5 üye · 1 bakım hatırlatması');
  assert.match(r.html, /TÜBİTAK &lt;2027&gt;/);
  assert.match(r.html, /Yapılacak/);
  assert.ok(r.html.includes('#/yonetim'));
});

test('hata uyarısı: kırmızı şerit ve hata metni', () => {
  const r = renderAdminReport({ ...base, ok: false, error: 'WikiCFP <timeout>' });
  assert.match(r.subject, /BAŞARISIZ/);
  assert.match(r.html, /WikiCFP &lt;timeout&gt;/);
  assert.match(r.html, /#dc2626/);
});

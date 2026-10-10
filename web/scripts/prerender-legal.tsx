// Derleme sonrası: yasal sayfaları JavaScript gerektirmeyen düz HTML olarak dist/ altına yazar.
// Google OAuth doğrulaması gizlilik politikasını bu adresten okur: <site>/privacy.html, <site>/terms.html
// (SPA'daki #/gizlilik sayfası tarayıcıda JavaScript ile çizildiği için tarayıcısız denetleyiciler göremez.)

import { writeFileSync } from 'node:fs';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacyEn, PrivacyTr, TermsEn, TermsTr } from '../src/pages/LegalPage';
import { SITE_NAME } from '../src/lib/site';

const base = process.env.VITE_BASE ?? '/cfp-calendar/';

const css = `
:root { color-scheme: light dark; --bg:#f6f7fb; --card:#fff; --text:#1a1d29; --muted:#6b7185; --border:#e2e5ee; --accent:#3d5afe; --soft:#e8ecff; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f1117; --card:#181b24; --text:#e7e9f0; --muted:#9095a8; --border:#2a2f3c; --accent:#7b8cff; --soft:#252b4d; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.65 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
header { display:flex; align-items:center; gap:.6rem; max-width:760px; margin:0 auto; padding:1rem 16px; }
header a { display:flex; align-items:center; gap:.5rem; color:var(--text); font-weight:700; text-decoration:none; }
nav { margin-left:auto; display:flex; gap:1rem; font-size:.9rem; }
main { max-width:760px; margin:0 auto; padding:0 16px 3rem; display:flex; flex-direction:column; gap:1.25rem; }
.card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:1.5rem 1.75rem; }
a { color:var(--accent); } h1 { font-size:1.6rem; line-height:1.2; margin:0 0 .4rem; } h2 { font-size:1.05rem; margin-top:1.6rem; }
.muted { color:var(--muted); } .small { font-size:.85rem; } ul { padding-left:1.2rem; } li { margin-bottom:.35rem; }
code { font-size:.85em; background:var(--soft); padding:.05rem .3rem; border-radius:4px; }
.callout { border-left:3px solid var(--accent); background:var(--soft); padding:.75rem 1rem; border-radius:0 8px 8px 0; font-size:.9rem; }
`;

function page(file: string, title: string, tr: ReactElement, en: ReactElement) {
  // Uygulama içi bağlantılar (#/gizlilik) statik sayfada da çalışsın
  const body = renderToStaticMarkup(
    <>
      <div id="tr">{tr}</div>
      <div id="en" lang="en">{en}</div>
    </>,
  ).replaceAll('href="#/gizlilik"', `href="${base}privacy.html"`);
  const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ${SITE_NAME}</title>
<link rel="icon" type="image/svg+xml" href="${base}logo.svg">
<style>${css}</style>
</head>
<body>
<header>
  <a href="${base}"><img src="${base}logo.svg" width="28" height="28" alt="">${SITE_NAME}</a>
  <nav><a href="#tr">Türkçe</a><a href="#en">English</a></nav>
</header>
<main>${body}</main>
</body>
</html>
`;
  writeFileSync(`dist/${file}`, html);
  console.log(`dist/${file} yazıldı`);
}

page('privacy.html', 'Gizlilik Politikası / Privacy Policy', <PrivacyTr />, <PrivacyEn />);
page('terms.html', 'Kullanım Koşulları / Terms of Service', <TermsTr />, <TermsEn />);

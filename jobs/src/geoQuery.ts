// Saf yardımcı (veritabanına bağlı değil; birim testte kullanılır).

/** Konum metnini sorgu anahtarına çevirir; çevrim içi / belirsiz yerler için null. */
export function geoQuery(location: string | null | undefined): string | null {
  if (!location) return null;
  if (/^\s*(n\/?a|tb[ad])\s*$/i.test(location)) return null;
  let q = location
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(hybrid|hybrid conference|in[- ]person)\b/gi, ' ')
    .replace(/[|;/]+/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
  if (q.length < 3 || q.length > 120) return null;
  if (/^(online|virtual|tbd|tba|n\/?a|none|to be (announced|determined)|web|internet|zoom|remote|worldwide|global)\b/i.test(q)) return null;
  if (/\b(online|virtual|webinar)\b/i.test(q) && !q.includes(',')) return null;
  q = q.replace(/\b(online|virtual)\b,?\s*/gi, '').replace(/^[,\s]+|[,\s]+$/g, '');
  return q.toLowerCase();
}

// ---------------------------------------------------------------------------
// Ülke kontrolü: yer metnindeki ülke ile bulunan konumun ülkesi tutmalı
// ---------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Ülke adı → ISO kodu (İngilizce ICU adları + yaygın kısaltmalar/eski adlar). */
const COUNTRY: Map<string, string> = (() => {
  const m = new Map<string, string>();
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    try {
      const n = names.of(code);
      if (n && n !== code && !m.has(norm(n))) m.set(norm(n), code); // ilk (asıl) kod kalsın: FR, eski FX değil
    } catch {
      // geçersiz kod
    }
  }
  const alias: Record<string, string> = {
    usa: 'US', 'u s a': 'US', us: 'US', 'united states of america': 'US', america: 'US',
    uk: 'GB', 'u k': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'great britain': 'GB', britain: 'GB', 'northern ireland': 'GB',
    korea: 'KR', 'republic of korea': 'KR', 'korea republic of': 'KR', 'korea south': 'KR', 'south korea': 'KR',
    turkey: 'TR', turkiye: 'TR', 'czech republic': 'CZ', czechia: 'CZ', russia: 'RU', 'russian federation': 'RU',
    vietnam: 'VN', 'viet nam': 'VN', uae: 'AE', 'u a e': 'AE', 'the netherlands': 'NL', holland: 'NL',
    'hong kong': 'HK', 'hong kong sar': 'HK', macau: 'MO', macao: 'MO', taiwan: 'TW', 'p r china': 'CN', prc: 'CN',
    iran: 'IR', syria: 'SY', 'ivory coast': 'CI', 'bosnia and herzegovina': 'BA', 'north macedonia': 'MK', macedonia: 'MK',
  };
  for (const [k, v] of Object.entries(alias)) m.set(k, v);
  m.delete('georgia'); // ABD eyaleti ile karışır ("Atlanta, Georgia"); Gürcistan için kontrol yapılmaz
  return m;
})();

/** "Bordeaux, France" → "FR"; ülke tanınmazsa (ör. "Boston, MA") null. */
export function countryCodeOf(text: string | null | undefined): string | null {
  if (!text) return null;
  const parts = text.split(',').map((p) => norm(p)).filter(Boolean);
  for (const p of parts.slice(-2).reverse()) {
    const hit = COUNTRY.get(p);
    if (hit) return hit;
  }
  return null;
}

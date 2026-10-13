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

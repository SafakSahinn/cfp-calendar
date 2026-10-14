// "Senin için": kullanıcının seçtiği konular, takip ettiği çağrılar ve seriler, başvuru geçmişinden kişisel öneri.
// Saf fonksiyon (tarayıcıya bağımlı değil) — jobs/test/forYou.test.ts ile test edilir.

export interface ForYouEvent {
  id: string;
  kind: string;
  acronym: string | null;
  topics: string[];
  ranks: Record<string, string>;
  is_ieee: boolean;
  flags: string[];
  series_key: string | null;
  submission_deadline: string | null;
  first_seen_at: string;
}

export type Reason =
  | { kind: 'topic'; topic: string }
  | { kind: 'similar' }
  | { kind: 'series'; series: string }
  | { kind: 'rank'; label: string }
  | { kind: 'new' }
  | { kind: 'applied'; series: string };

export interface ForYouInput {
  events: ForYouEvent[];
  followed: Set<string>;
  topics: Set<string>;
  seriesFollowed: Set<string>;
  /** Kullanıcının başvuru kaydı olan çağrıların seri anahtarları (yeni edisyonları öne çıkar) */
  appliedSeries?: Set<string>;
  now?: number;
}

const CAUTION = new Set(['indexing_claims', 'organizer_prefix', 'ei_duplicate', 'generic_journal']);
const DAY = 86_400_000;
const TOP_RANKS: [string, RegExp][] = [['core', /^A\*?$/], ['ccf', /^A$/], ['sjr', /^Q1$/], ['thcpl', /^A$/]];

export function forYou(input: ForYouInput, limit = 20): { event: ForYouEvent; score: number; reasons: Reason[] }[] {
  const now = input.now ?? Date.now();
  // Takip edilen çağrıların konuları: açıkça seçilmemiş ama ilgi gösterilen alanlar
  const implicit = new Map<string, number>();
  for (const e of input.events) {
    if (!input.followed.has(e.id)) continue;
    for (const t of e.topics) implicit.set(t, (implicit.get(t) ?? 0) + 1);
  }

  const out: { event: ForYouEvent; score: number; reasons: Reason[] }[] = [];
  for (const e of input.events) {
    if (input.followed.has(e.id) || !e.submission_deadline) continue;
    if (Object.keys(e.ranks).length === 0 && e.flags.some((f) => CAUTION.has(f))) continue;
    const left = new Date(e.submission_deadline).getTime() - now;
    if (left < 2 * DAY) continue; // yetişmesi zor

    const reasons: Reason[] = [];
    let personal = 0;

    if (e.series_key && input.seriesFollowed.has(e.series_key)) {
      personal += 6;
      reasons.push({ kind: 'series', series: e.acronym ?? e.series_key });
    } else if (e.series_key && input.appliedSeries?.has(e.series_key)) {
      personal += 4;
      reasons.push({ kind: 'applied', series: e.acronym ?? e.series_key });
    }
    const explicit = e.topics.filter((t) => input.topics.has(t));
    if (explicit.length) {
      personal += 3 * Math.min(explicit.length, 2);
      reasons.push({ kind: 'topic', topic: explicit[0] });
    }
    const similar = e.topics.reduce((s, t) => s + Math.min(implicit.get(t) ?? 0, 2), 0);
    if (similar > 0) {
      personal += Math.min(similar, 4);
      if (!explicit.length) reasons.push({ kind: 'similar' });
    }
    if (personal === 0) continue; // kişisel bir bağ yoksa "senin için" değil

    let score = personal;
    const top = TOP_RANKS.find(([k, re]) => e.ranks[k] && re.test(e.ranks[k]));
    if (top) {
      score += 1.5;
      reasons.push({ kind: 'rank', label: `${top[0].toUpperCase()} ${e.ranks[top[0]]}` });
    } else if (Object.keys(e.ranks).length) score += 0.75;
    if (e.is_ieee) score += 0.5;
    if (left > 14 * DAY && left < 75 * DAY) score += 1; // hazırlanmaya yetecek ama çok uzak olmayan
    else if (left < 7 * DAY) score -= 1;
    if (now - new Date(e.first_seen_at).getTime() < 7 * DAY) {
      score += 0.5;
      reasons.push({ kind: 'new' });
    }
    out.push({ event: e, score, reasons: reasons.slice(0, 3) });
  }
  return out
    .sort((a, b) => b.score - a.score || a.event.submission_deadline!.localeCompare(b.event.submission_deadline!))
    .slice(0, limit);
}

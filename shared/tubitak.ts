// TÜBİTAK 2224 (bilimsel etkinliklere katılım desteği) dönem hesabı.
// Kaynak: https://tubitak.gov.tr/tr/destekler/bilimsel-etkinlik/etkinliklere-katilma-destekleri/2224-yurt-disi-bilimsel-etkinliklere-katilimi-destekleme-programi
// Kurallar (çağrı metni): "Etkinlik başlangıç tarihi, başvuru kapanış tarihinden sonra olmalıdır." ve başvuru
// etkinlikten HEMEN ÖNCEKİ başvuru döneminde yapılır. 2224-A: yurt dışı, 2224-B: yurt içi.
//
// BAKIM: TÜBİTAK yeni yılın takvimini açıkladığında KNOWN_PERIODS'a ekleyin. Açıklanmamış dönemler bir önceki yılın
// tarihlerinden "tahmini" olarak türetilir ve arayüzde öyle gösterilir.

export interface Period {
  name: string; // "2026/3"
  open: string; // ISO
  close: string; // ISO (17:30 TSİ)
  estimated: boolean;
}

export const KNOWN_PERIODS: Period[] = [
  { name: '2026/1', open: '2026-02-02T00:00:00+03:00', close: '2026-02-24T17:30:00+03:00', estimated: false },
  { name: '2026/2', open: '2026-06-08T00:00:00+03:00', close: '2026-06-30T17:30:00+03:00', estimated: false },
  { name: '2026/3', open: '2026-10-05T00:00:00+03:00', close: '2026-10-27T17:30:00+03:00', estimated: false },
];

const shiftYear = (iso: string, years: number) => {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString();
};

/** Bilinen dönemler + sonraki 2 yıl için tahmini dönemler (son bilinen yılın tarihleri kaydırılarak). */
export function allPeriods(known: Period[] = KNOWN_PERIODS): Period[] {
  const lastYear = Math.max(...known.map((p) => +p.name.slice(0, 4)));
  const template = known.filter((p) => +p.name.slice(0, 4) === lastYear);
  const estimated: Period[] = [];
  for (let k = 1; k <= 2; k++) {
    for (const p of template) {
      estimated.push({ name: `${lastYear + k}/${p.name.split('/')[1]}`, open: shiftYear(p.open, k), close: shiftYear(p.close, k), estimated: true });
    }
  }
  return [...known, ...estimated].sort((a, b) => a.close.localeCompare(b.close));
}

export type Program = '2224-A' | '2224-B';

export interface FundingInfo {
  program: Program;
  period: Period;
  /** Dönem şu an başvuruya açık mı */
  openNow: boolean;
  /** Başvuru dönemi kaçırıldı mı (etkinlik için doğru dönem kapandı) */
  missed: boolean;
}

/**
 * Bir etkinlik için TÜBİTAK 2224 başvuru dönemi. Konferans/çalıştay değilse, etkinlik tarihi yoksa
 * veya çevrim içi ise null.
 */
export function fundingFor(
  e: { kind: string; event_start: string | null; location: string | null },
  opts: { inTurkey: boolean; online: boolean; now?: number; periods?: Period[] },
): FundingInfo | null {
  if (e.kind === 'journal' || !e.event_start || opts.online) return null;
  const start = new Date(`${e.event_start}T00:00:00+03:00`).getTime();
  const now = opts.now ?? Date.now();
  const periods = opts.periods ?? allPeriods();
  // Etkinlikten önce kapanan en son dönem
  const before = periods.filter((p) => new Date(p.close).getTime() < start);
  const period = before.at(-1);
  if (!period) return null;
  const open = new Date(period.open).getTime();
  const close = new Date(period.close).getTime();
  return {
    program: opts.inTurkey ? '2224-B' : '2224-A',
    period,
    openNow: now >= open && now <= close,
    missed: now > close,
  };
}

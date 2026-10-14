// Son başvuru hatırlatması eşikleri (saf; birim testlenir).

const DAY = 86_400_000;

/** Kalan süre (ms) ve kullanıcının seçtiği gün eşikleri → hatırlatılacak eşik (gün) ya da null.
 *  Kalan süreyi kapsayan EN KÜÇÜK eşik seçilir: çağrı geç takip edilirse birikmiş eşikler toplu gelmez. */
export function reminderThreshold(remainingMs: number, days: number[]): number | null {
  if (remainingMs <= 0) return null;
  return [...days].sort((a, b) => a - b).find((d) => remainingMs < d * DAY) ?? null;
}

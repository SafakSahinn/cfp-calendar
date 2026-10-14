// Son başvuru hatırlatması eşikleri (saf; birim testlenir).

const DAY = 86_400_000;

/** Kalan süre (ms) ve kullanıcının seçtiği gün eşikleri → hatırlatılacak eşik (gün) ya da null.
 *  Kalan süreyi kapsayan EN KÜÇÜK eşik seçilir: çağrı geç takip edilirse birikmiş eşikler toplu gelmez. */
export function reminderThreshold(remainingMs: number, days: number[]): number | null {
  if (remainingMs <= 0) return null;
  return [...days].sort((a, b) => a - b).find((d) => remainingMs < d * DAY) ?? null;
}

export type TaskKind = 'camera_ready' | 'registration' | 'presentation';

export interface TaskSubmission {
  id: string;
  user_id: string;
  event_id: string;
  status: string;
  paper_title: string | null;
  camera_ready_due: string | null;
  registration_due: string | null;
  presentation_at: string | null;
  submission_members?: { user_id: string }[] | null;
}

/** Bir kullanıcının (sahip veya ortak yazar) kabul sonrası iş hatırlatmaları. Tarihler Türkiye saatiyle gün sonu kabul edilir. */
export function taskReminders(subs: TaskSubmission[], userId: string, days: number[], now: number) {
  const out: { event_id: string; dedupe_key: string; payload: { task: TaskKind; date: string; paper: string | null; days: number } }[] = [];
  for (const s of subs) {
    if (s.status === 'rejected' || s.status === 'withdrawn') continue;
    const party = s.user_id === userId || (s.submission_members ?? []).some((m) => m.user_id === userId);
    if (!party) continue;
    for (const [task, date] of [['camera_ready', s.camera_ready_due], ['registration', s.registration_due], ['presentation', s.presentation_at]] as const) {
      if (!date) continue;
      const end = Date.parse(`${date}T23:59:59+03:00`);
      const d = reminderThreshold(end - now, days);
      if (d === null) continue;
      out.push({ event_id: s.event_id, dedupe_key: `task:${s.id}:${task}:${date}:${d}`, payload: { task, date, paper: s.paper_title, days: d } });
    }
  }
  return out;
}

// "Dikkat" işaretleri: herhangi biri olan (ve derecesi olmayan) çağrı arayüzde varsayılan olarak gizlenir,
// öneri ve bildirimlere girmez. Kurallar: jobs/src/quality.ts. Site ve jobs bu listeyi ortak kullanır.

export const CAUTION_FLAGS = ['indexing_claims', 'organizer_prefix', 'ei_duplicate', 'generic_journal', 'bulk_cluster'] as const;
export type Flag = (typeof CAUTION_FLAGS)[number];

const SET = new Set<string>(CAUTION_FLAGS);
export const hasCautionFlag = (flags: readonly string[] | null | undefined) => (flags ?? []).some((f) => SET.has(f));

// TÜBİTAK 2224 dönem bilgisini sitenin etkinlik verisine uygular (kurallar: shared/tubitak.ts).

import { fundingFor, type FundingInfo } from '../../../shared/tubitak';
import { IN_TURKEY, IS_ONLINE } from './events';
import type { EventRow } from './supabase';

export const TUBITAK_URL_A =
  'https://tubitak.gov.tr/tr/destekler/bilimsel-etkinlik/etkinliklere-katilma-destekleri/2224-yurt-disi-bilimsel-etkinliklere-katilimi-destekleme-programi';
export const TUBITAK_URL_B =
  'https://tubitak.gov.tr/tr/destekler/bilimsel-etkinlik/etkinliklere-katilma-destekleri/2224-b-yurt-ici-bilimsel-etkinliklere-katilimi-destekleme-programi';

export function funding(e: EventRow): FundingInfo | null {
  return fundingFor(e, { inTurkey: IN_TURKEY.test(e.location ?? ''), online: IS_ONLINE.test(e.location ?? '') });
}

export type { FundingInfo };

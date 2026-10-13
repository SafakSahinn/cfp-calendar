// Yıllık/dönemsel bakım hatırlatmaları (saf fonksiyon). Yönetici raporu e-postası ve yönetim paneli gösterir.

import type { Period } from '../../shared/tubitak.ts';

export type Level = 'ok' | 'warn' | 'todo';

export interface MaintenanceItem {
  key: 'sjr' | 'tubitak' | 'core';
  level: Level;
  title: string;
  detail: string;
}

const DAY = 86_400_000;
const trDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric' });

export function computeMaintenance(opts: {
  now: number;
  sjr: { year: string; count: number } | null;
  knownPeriods: Period[];
  coreSource: 'live' | 'snapshot' | null;
}): MaintenanceItem[] {
  const items: MaintenanceItem[] = [];
  const now = new Date(opts.now);

  // "scimagojr <yıl>" dosyası o yılın verisini taşır ve ERTESİ yılın ilkbaharında yayımlanır
  // (ör. 2025 listesi 2026 baharında). Bir sonraki liste (yıl+1) bu yüzden yıl+2 baharında beklenir.
  if (!opts.sjr) {
    items.push({ key: 'sjr', level: 'todo', title: 'SCImago dergi listesi yok', detail: 'Dergi çeyrekleri gösterilmiyor. scimagojr.com/journalrank.php?out=xls dosyasını indirip Claude’a “indirdim” deyin.' });
  } else {
    const nextYear = +opts.sjr.year + 1;
    const nextLikelyOut = Date.UTC(nextYear + 1, 5, 1); // yayım yılının 1 Haziranı
    items.push(opts.now >= nextLikelyOut
      ? { key: 'sjr', level: 'todo', title: `Yeni SCImago listesi (${nextYear}) yayımlanmış olmalı`, detail: `Şu an ${opts.sjr.year} listesi kullanılıyor (${opts.sjr.count} dergi). scimagojr.com/journalrank.php?out=xls adresinden yeni dosyayı indirin ve Claude’a “indirdim” deyin.` }
      : { key: 'sjr', level: 'ok', title: `SCImago ${opts.sjr.year} listesi güncel`, detail: `${opts.sjr.count} mühendislik/bilgisayar dergisi. Sonraki liste (${nextYear}) genelde ${nextYear + 1} ilkbaharında yayımlanır.` });
  }

  // TÜBİTAK 2224: bilinen son dönem kapandıysa / 60 gün içinde kapanacaksa yeni yılın takvimi eklenmeli.
  const last = [...opts.knownPeriods].sort((a, b) => a.close.localeCompare(b.close)).at(-1);
  if (last) {
    const close = new Date(last.close).getTime();
    const nextYear = +last.name.slice(0, 4) + 1;
    if (opts.now > close) {
      items.push({ key: 'tubitak', level: 'todo', title: `TÜBİTAK ${nextYear} başvuru takvimi eklenmeli`, detail: `Bilinen son dönem ${last.name} (${trDate(last.close)}) kapandı; sitede ${nextYear} dönemleri “tahmini” görünüyor. TÜBİTAK ${nextYear} takvimini açıklayınca (tubitak.gov.tr → 2224) Claude’a tarihleri iletin.` });
    } else if (close - opts.now < 60 * DAY) {
      items.push({ key: 'tubitak', level: 'warn', title: `TÜBİTAK ${nextYear} takvimini takip edin`, detail: `Bilinen son dönem ${last.name}, ${trDate(last.close)} tarihinde kapanıyor. ${nextYear} takvimi açıklanınca Claude’a tarihleri iletin.` });
    } else {
      items.push({ key: 'tubitak', level: 'ok', title: 'TÜBİTAK 2224 takvimi güncel', detail: `Bilinen son dönem: ${last.name} (son başvuru ${trDate(last.close)}).` });
    }
  }

  // CORE: canlı liste alınamadıysa depodaki kopya (ICORE2026) kullanılır.
  if (opts.coreSource === 'snapshot') {
    items.push({ key: 'core', level: 'warn', title: 'CORE sıralaması canlı alınamadı', detail: 'Depodaki ICORE2026 kopyası kullanıldı. Tekrarlarsa portal.core.edu.au erişimini kontrol edin.' });
  } else if (opts.coreSource === 'live') {
    items.push({ key: 'core', level: 'ok', title: 'CORE sıralaması canlı alındı', detail: 'Konferans dereceleri güncel.' });
  }

  void now;
  return items;
}

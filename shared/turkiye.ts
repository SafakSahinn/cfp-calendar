// Türkiye'de düzenlenen CS/EE konferans serileri. Bu konferanslar WikiCFP/ccf gibi kaynaklarda çoğunlukla yer almaz;
// bilgiler resmi sitelerden elle toplanır (son kontrol: 2026-10-13).
//
// BAKIM: Yeni yılın çağrısı yayımlanınca ilgili serinin `editions` listesine ekleyin (en yenisi başta).
// Yönetici panelindeki "Bakım" kartı, beklenen son başvuru ayından önce hangi serinin kontrol edilmesi gerektiğini hatırlatır.
// Alternatif: yönetim panelinden "Etkinlik ekle" ile aynı kısaltmayla eklenen etkinlik de seriye otomatik bağlanır.

export interface TrEdition {
  year: number;
  /** Son başvuru (YYYY-MM-DD, Türkiye saatiyle gün sonu); uzatıldıysa uzatılmış tarih */
  deadline: string | null;
  /** Uzatmadan önceki ilk son başvuru tarihi (varsa) */
  originalDeadline?: string;
  eventStart: string;
  eventEnd: string;
  location: string;
  url: string;
}

export interface TrSeries {
  /** Seri anahtarı: jobs/src/types.ts seriesKeyOf ile aynı biçim (büyük harf + rakam) */
  key: string;
  acronym: string;
  name: { tr: string; en: string };
  /** Seri ana sayfası (her yıl değişmeyen) */
  home: string | null;
  fields: ('cs' | 'ee')[];
  topics: string[];
  ieee: boolean;
  /** Son başvurunun genelde düştüğü ay (1–12) ve etkinlik ayı — hatırlatma ve "beklenen" bilgisi için */
  deadlineMonth: number;
  eventMonth: number;
  editions: TrEdition[];
}

export const TR_SERIES: TrSeries[] = [
  {
    key: 'SIU', acronym: 'SIU',
    name: { tr: 'Sinyal İşleme ve İletişim Uygulamaları Kurultayı', en: 'Signal Processing and Communications Applications Conference' },
    home: 'https://siu2026.pirireis.edu.tr/', fields: ['ee', 'cs'], topics: ['signal', 'communications', 'ai-ml', 'biomedical'], ieee: true,
    deadlineMonth: 3, eventMonth: 7,
    editions: [
      { year: 2026, deadline: '2026-03-13', eventStart: '2026-07-07', eventEnd: '2026-07-10', location: 'İstanbul, Türkiye', url: 'https://siu2026.pirireis.edu.tr/' },
    ],
  },
  {
    key: 'UBMK', acronym: 'UBMK',
    name: { tr: 'Uluslararası Bilgisayar Bilimleri ve Mühendisliği Konferansı', en: 'International Conference on Computer Science and Engineering' },
    home: 'https://ubmk.org.tr/en/', fields: ['cs'], topics: ['ai-ml', 'software', 'networking', 'security', 'data'], ieee: true,
    deadlineMonth: 6, eventMonth: 9,
    editions: [
      { year: 2026, deadline: '2026-06-30', eventStart: '2026-09-16', eventEnd: '2026-09-18', location: 'İstanbul, Türkiye', url: 'https://ubmk.org.tr/en/' },
    ],
  },
  {
    key: 'ASYU', acronym: 'ASYU',
    name: { tr: 'Akıllı Sistemlerde Yenilikler ve Uygulamaları Konferansı', en: 'Innovations in Intelligent Systems and Applications Conference' },
    home: 'https://asyu2026.ozyegin.edu.tr/en', fields: ['cs', 'ee'], topics: ['ai-ml', 'control', 'robotics', 'signal'], ieee: true,
    deadlineMonth: 6, eventMonth: 9,
    editions: [
      { year: 2026, deadline: '2026-06-20', eventStart: '2026-09-09', eventEnd: '2026-09-11', location: 'İstanbul, Türkiye', url: 'https://asyu2026.ozyegin.edu.tr/en' },
    ],
  },
  {
    key: 'ELECO', acronym: 'ELECO',
    name: { tr: 'Elektrik-Elektronik ve Biyomedikal Mühendisliği Konferansı', en: 'Electrical-Electronics and Biomedical Engineering Conference' },
    home: 'https://www.eleco.org.tr/', fields: ['ee'], topics: ['power', 'electronics', 'communications', 'control', 'biomedical'], ieee: true,
    deadlineMonth: 9, eventMonth: 11,
    editions: [
      { year: 2026, deadline: '2026-10-02', originalDeadline: '2026-09-11', eventStart: '2026-11-26', eventEnd: '2026-11-28', location: 'Bursa, Türkiye', url: 'https://www.eleco.org.tr/' },
    ],
  },
  {
    key: 'TIPTEKNO', acronym: 'TIPTEKNO',
    name: { tr: 'Tıp Teknolojileri Kongresi', en: 'Medical Technologies Congress' },
    home: 'https://www.tiptekno.net/', fields: ['ee'], topics: ['biomedical', 'signal', 'electronics'], ieee: true,
    deadlineMonth: 7, eventMonth: 10,
    editions: [
      { year: 2026, deadline: '2026-07-31', eventStart: '2026-10-15', eventEnd: '2026-10-17', location: 'Gaziantep, Türkiye', url: 'https://www.tiptekno.net/' },
    ],
  },
  {
    key: 'ISMSIT', acronym: 'ISMSIT',
    name: { tr: 'Uluslararası Multidisipliner Çalışmalar ve Yenilikçi Teknolojiler Sempozyumu', en: 'International Symposium on Multidisciplinary Studies and Innovative Technologies' },
    home: 'https://www.ismsitconf.org/', fields: ['cs', 'ee'], topics: ['ai-ml', 'networking', 'power-electronics', 'signal'], ieee: true,
    deadlineMonth: 9, eventMonth: 11,
    editions: [
      { year: 2026, deadline: '2026-09-10', eventStart: '2026-11-13', eventEnd: '2026-11-15', location: 'Antalya, Türkiye', url: 'https://www.ismsitconf.org/' },
    ],
  },
  {
    key: 'IDAP', acronym: 'IDAP',
    name: { tr: 'Uluslararası Yapay Zekâ ve Veri İşleme Sempozyumu', en: 'International Artificial Intelligence and Data Processing Symposium' },
    home: 'https://idap.inonu.edu.tr/', fields: ['cs'], topics: ['ai-ml', 'data', 'vision', 'nlp'], ieee: true,
    deadlineMonth: 6, eventMonth: 9,
    editions: [
      { year: 2026, deadline: '2026-06-30', eventStart: '2026-09-05', eventEnd: '2026-09-06', location: 'Malatya, Türkiye', url: 'https://idap.inonu.edu.tr/' },
    ],
  },
  {
    key: 'ICHORA', acronym: 'ICHORA',
    name: { tr: 'Uluslararası İnsan-Bilgisayar Etkileşimi, Optimizasyon ve Robotik Uygulamalar Kongresi', en: 'International Congress on Human-Computer Interaction, Optimization and Robotic Applications' },
    home: null /* resmi site doğrulanamadı (2026-10) */, fields: ['cs', 'ee'], topics: ['hci', 'robotics', 'ai-ml', 'control'], ieee: true,
    deadlineMonth: 1, eventMonth: 5,
    editions: [],
  },
];

/** Bir serinin bilinen en yeni edisyonu (yoksa null). */
export const latestEdition = (s: TrSeries): TrEdition | null =>
  [...s.editions].sort((a, b) => b.eventStart.localeCompare(a.eventStart))[0] ?? null;

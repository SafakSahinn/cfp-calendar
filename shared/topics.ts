// Konu sınıflandırması: hem veri çekme işleri (etiketleme) hem de arayüz (filtre/profil) kullanır.

export type Field = 'cs' | 'ee';

export interface Topic {
  id: string;
  field: Field;
  tr: string;
  en: string;
  keywords: RegExp;
}

export const TOPICS: Topic[] = [
  // Bilgisayar mühendisliği
  { id: 'ai-ml', field: 'cs', tr: 'Yapay Zekâ / Makine Öğrenmesi', en: 'AI / Machine Learning',
    keywords: /\b(artificial intelligence|machine learning|deep learning|neural|learning representations|\bAI\b|reinforcement learning|LLM|large language)/i },
  { id: 'vision', field: 'cs', tr: 'Bilgisayarlı Görü', en: 'Computer Vision',
    keywords: /\b(computer vision|image processing|pattern recognition|visual|CVPR|ICCV|ECCV)/i },
  { id: 'nlp', field: 'cs', tr: 'Doğal Dil İşleme', en: 'Natural Language Processing',
    keywords: /\b(natural language|computational linguistics|NLP|speech recognition|ACL|EMNLP|NAACL)\b/i },
  { id: 'data', field: 'cs', tr: 'Veri Tabanı / Veri Madenciliği', en: 'Databases / Data Mining',
    keywords: /\b(database|data mining|big data|data science|knowledge discovery|information retrieval|data management)/i },
  { id: 'networking', field: 'cs', tr: 'Bilgisayar Ağları', en: 'Computer Networks',
    keywords: /\b(network|networking|internet|SDN|5G|6G|edge computing)/i },
  { id: 'security', field: 'cs', tr: 'Siber Güvenlik', en: 'Security & Privacy',
    keywords: /\b(security|privacy|cryptograph|cyber|malware|forensic)/i },
  { id: 'software', field: 'cs', tr: 'Yazılım Mühendisliği', en: 'Software Engineering',
    keywords: /\b(software|programming language|compiler|testing|verification)/i },
  { id: 'systems', field: 'cs', tr: 'Dağıtık / Paralel Sistemler', en: 'Distributed & Parallel Systems',
    keywords: /\b(distributed|parallel|cloud|high performance computing|HPC|operating system|storage|grid computing)/i },
  { id: 'architecture', field: 'cs', tr: 'Bilgisayar Mimarisi', en: 'Computer Architecture',
    keywords: /\b(computer architecture|microarchitecture|processor|FPGA|hardware accelerat|ISCA|MICRO|HPCA)/i },
  { id: 'hci', field: 'cs', tr: 'İnsan-Bilgisayar Etkileşimi', en: 'Human-Computer Interaction',
    keywords: /\b(human-computer|human computer|HCI|user interface|ubiquitous|CHI)\b/i },
  { id: 'graphics', field: 'cs', tr: 'Grafik / Multimedya', en: 'Graphics & Multimedia',
    keywords: /\b(graphics|multimedia|virtual reality|augmented reality|visualization|game)/i },
  { id: 'theory', field: 'cs', tr: 'Kuramsal Bilgisayar Bilimi', en: 'Theory of Computing',
    keywords: /\b(theory of computing|algorithm|complexity|logic in computer|automata|combinatori)/i },
  { id: 'robotics', field: 'cs', tr: 'Robotik', en: 'Robotics',
    keywords: /\b(robot|robotics|autonomous systems|mechatronic|unmanned)/i },
  { id: 'quantum', field: 'cs', tr: 'Kuantum Hesaplama', en: 'Quantum Computing',
    keywords: /\b(quantum (comput|information|algorithm|machine learning|software|network|communication|internet|cryptograph|key distribution|error correction|technolog|engineering|simulation|circuit|programming)|qubit|QKD\b|post-quantum)/i },
  { id: 'blockchain', field: 'cs', tr: 'Blokzincir / Dağıtık Defter', en: 'Blockchain & Distributed Ledgers',
    keywords: /\b(blockchain|distributed ledger|smart contract|cryptocurrenc|bitcoin|ethereum|web3|decentralized finance|DeFi\b)/i },
  { id: 'bioinformatics', field: 'cs', tr: 'Biyoinformatik / Hesaplamalı Biyoloji', en: 'Bioinformatics & Computational Biology',
    keywords: /\b(bioinformatic|computational biology|genomic|proteomic|systems biology|ISMB\b|RECOMB\b)/i },
  { id: 'education', field: 'cs', tr: 'Bilgisayar / Mühendislik Eğitimi', en: 'Computing & Engineering Education',
    keywords: /\b(engineering education|computing education|computer science education|educational technolog|technology[- ]enhanced learning|e-learning|MOOC|SIGCSE|ITiCSE)/i },

  // Elektrik-elektronik mühendisliği
  { id: 'power', field: 'ee', tr: 'Güç Sistemleri / Enerji', en: 'Power Systems & Energy',
    keywords: /\b(power system|power engineering|smart grid|energy|renewable|electric vehicle|grid)/i },
  { id: 'power-electronics', field: 'ee', tr: 'Güç Elektroniği', en: 'Power Electronics',
    keywords: /\b(power electronic|converter|inverter|motor drive|electric machine)/i },
  { id: 'signal', field: 'ee', tr: 'Sinyal İşleme', en: 'Signal Processing',
    keywords: /\b(signal processing|ICASSP|audio|speech|radar|sonar)/i },
  { id: 'communications', field: 'ee', tr: 'Haberleşme / Kablosuz', en: 'Communications & Wireless',
    keywords: /\b(communication|wireless|telecommunication|antenna|microwave|RF\b|millimeter|satellite)/i },
  { id: 'control', field: 'ee', tr: 'Kontrol / Otomasyon', en: 'Control & Automation',
    keywords: /\b(control|automation|automatic|cyber-physical|industrial)/i },
  { id: 'vlsi', field: 'ee', tr: 'VLSI / Devreler', en: 'VLSI & Circuits',
    keywords: /\b(VLSI|circuit|integrated circuit|semiconductor|microelectronic|EDA|design automation|chip|DAC\b|ISSCC)/i },
  { id: 'embedded', field: 'ee', tr: 'Gömülü Sistemler / IoT', en: 'Embedded Systems & IoT',
    keywords: /\b(embedded|internet of things|IoT|sensor|real-time system|wearable)/i },
  { id: 'electronics', field: 'ee', tr: 'Elektronik', en: 'Electronics',
    keywords: /\b(electronic|electrical engineering|electrical)/i },
  { id: 'photonics', field: 'ee', tr: 'Fotonik / Optik', en: 'Photonics & Optics',
    keywords: /\b(photonic|optic|laser|optoelectronic)/i },
  { id: 'biomedical', field: 'ee', tr: 'Biyomedikal Mühendisliği', en: 'Biomedical Engineering',
    keywords: /\b(biomedical|medical imaging|bioinformatic|health informatics|EMBC)/i },
  { id: 'rf', field: 'ee', tr: 'RF / Mikrodalga / Antenler', en: 'RF, Microwave & Antennas',
    keywords: /\b(antenna|microwave|millimeter[- ]wave|mmWave|terahertz|THz\b|radio frequency|RF\b|electromagnetic|EMC\b|wave propagation)/i },
  { id: 'sensors', field: 'ee', tr: 'Sensörler / Ölçme', en: 'Sensors & Instrumentation',
    keywords: /\b(sensor|instrumentation|metrology|MEMS\b)/i },
  { id: 'ev', field: 'ee', tr: 'Elektrikli Araçlar / Ulaşım', en: 'Electric Vehicles & Transportation',
    keywords: /\b(electric vehicle|EV charging|vehicular|transportation electrification|battery management|intelligent transportation|automotive|railway)/i },
  { id: 'semiconductor', field: 'ee', tr: 'Yarıiletken / Nanoteknoloji', en: 'Semiconductors & Nanotechnology',
    keywords: /\b(semiconductor device|nanotechnolog|nanoelectronic|nanoscale|nanomaterial|thin film|2D material|transistor|device physics)/i },
];

export const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

/** Metindeki anahtar kelimelere göre konu kimliklerini döndürür. */
export function classify(text: string): string[] {
  return TOPICS.filter((t) => t.keywords.test(text)).map((t) => t.id);
}

/** Konu listesinden alanları (cs/ee) türetir. */
export function fieldsOf(topicIds: string[]): Field[] {
  const set = new Set<Field>();
  for (const id of topicIds) {
    const t = TOPIC_BY_ID.get(id);
    if (t) set.add(t.field);
  }
  return [...set];
}

// Springer Nature: dergilerin açık koleksiyon/özel sayı çağrıları ("Collections and calls for papers").
// Sayfa: https://link.springer.com/journal/<id>/collections?filter=Open — her kart: başlık, açıklama, durum, son tarih.
// "Ongoing" (son tarihsiz sürekli çağrı) koleksiyonlar alınmaz.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';
import { localToUtcIso, parseShortDate, tagTopics, type NormalizedEvent } from '../types.ts';

/** Springer dergi kimliği → sabit konu etiketleri (2026-10'da doğrulandı). */
export const SPRINGER_JOURNALS: Record<string, string[]> = {
  '11265': ['signal', 'embedded'], // Journal of Signal Processing Systems
  '34': ['signal', 'vlsi'], // Circuits, Systems, and Signal Processing
  '10470': ['vlsi', 'signal'], // Analog Integrated Circuits and Signal Processing
  '202': ['electronics', 'power'], // Electrical Engineering
  '42835': ['electronics', 'power'], // Journal of Electrical Engineering & Technology
  '10836': ['vlsi'], // Journal of Electronic Testing
  '10825': ['vlsi', 'electronics'], // Journal of Computational Electronics
  '542': ['vlsi', 'embedded'], // Microsystem Technologies
  '11760': ['signal', 'vision'], // Signal, Image and Video Processing
  '11554': ['vision', 'embedded'], // Journal of Real-Time Image Processing
  '11276': ['networking', 'communications'], // Wireless Networks
  '11277': ['communications', 'networking'], // Wireless Personal Communications
  '11235': ['communications', 'networking'], // Telecommunication Systems
  '11227': ['systems', 'architecture'], // The Journal of Supercomputing
  '10586': ['systems'], // Cluster Computing
  '11042': ['graphics', 'vision'], // Multimedia Tools and Applications
  '521': ['ai-ml'], // Neural Computing and Applications
  '10489': ['ai-ml'], // Applied Intelligence
  '10994': ['ai-ml'], // Machine Learning
  '11063': ['ai-ml'], // Neural Processing Letters
  '10462': ['ai-ml'], // Artificial Intelligence Review
  '40747': ['ai-ml', 'systems'], // Complex & Intelligent Systems
  '12065': ['ai-ml'], // Evolutionary Intelligence
  '11047': ['ai-ml', 'theory'], // Natural Computing
};

const UA = 'Mozilla/5.0 (compatible; CFP-Calendar/1.0; +https://github.com/SafakSahinn/cfp-calendar)';

/**
 * Springer, Node'un fetch istemcisine (TLS parmak izi) JavaScript "Client Challenge" sayfası döndürüyor; curl ile sorun yok.
 * Bu yüzden sayfa curl ile çekilir (argümanlar dizi olarak verilir, kabuk kullanılmaz).
 */
async function curlGet(url: string): Promise<string> {
  const { stdout } = await promisify(execFile)(
    'curl',
    ['-sSL', '--fail', '-m', '30', '-A', UA, '-H', 'Accept: text/html', url],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  if (stdout.includes('<title>Client Challenge</title>')) throw new Error('bot denetimi (Client Challenge)');
  return stdout;
}

export interface SpringerCollection {
  id: string;
  title: string;
  description: string;
  status: string;
  deadline: string | null; // YYYY-MM-DD, "Ongoing" ise null
}

export function parseSpringer(html: string): { journal: string; collections: SpringerCollection[] } {
  const $ = cheerio.load(html);
  // <title>Collections and calls for papers | Journal of Signal Processing Systems | Springer Nature Link</title>
  const journal = $('title').text().split('|')[1]?.trim() ?? '';
  const collections: SpringerCollection[] = [];
  $('a.app-card-collection__heading-link').each((_, a) => {
    const card = $(a).closest('article, li, .app-card-collection');
    const id = ($(a).attr('href') ?? '').split('/').pop() ?? '';
    const fields: Record<string, string> = {};
    card.find('dl.app-card-collection__description-list').each((_, dl) => {
      fields[$(dl).find('dt').text().trim().toLowerCase()] = $(dl).find('dd').text().trim();
    });
    const raw = fields['submission deadline'] ?? '';
    // "30 November 2026" → parseShortDate "November 30, 2026" biçimini bekler
    const m = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    collections.push({
      id,
      title: $(a).text().replace(/\s+/g, ' ').trim(),
      description: card.find('.app-card-collection__text').text().replace(/\s+/g, ' ').trim(),
      status: fields['submission status'] ?? '',
      deadline: m ? parseShortDate(`${m[2]} ${m[1]}, ${m[3]}`) : null,
    });
  });
  return { journal, collections };
}

export function springerToEvent(c: SpringerCollection, journal: string, topics: string[]): NormalizedEvent | null {
  if (!c.deadline || !c.id || c.status.toLowerCase() !== 'open') return null;
  // Sadece davetlilere açık koleksiyonlar herkese açık çağrı değildir
  if (/invitation[- ]only|by invitation/i.test(`${c.title} ${c.description}`)) return null;
  const deadline = localToUtcIso(`${c.deadline} 23:59:59`, 'AoE');
  const tagged = tagTopics(`${c.title} ${c.description}`, topics);
  return {
    source: 'springer',
    source_id: c.id,
    dedupe_key: `SPRINGER-${c.id}`.toUpperCase(),
    kind: 'journal',
    acronym: journal,
    title: `${journal}: ${c.title}`,
    url: `https://link.springer.com/collections/${c.id}`,
    location: null,
    fields: tagged.fields,
    topics: tagged.topics,
    ranks: {},
    is_ieee: false,
    submission_open: null,
    abstract_deadline: null,
    submission_deadline: deadline,
    deadlines: deadline ? [{ deadline }] : [],
    deadline_tz: 'AoE',
    notification_date: null,
    event_start: null,
    event_end: null,
  };
}

export async function fetchSpringer(log: (msg: string) => void = console.log): Promise<NormalizedEvent[]> {
  const out: NormalizedEvent[] = [];
  const now = Date.now();
  for (const [id, topics] of Object.entries(SPRINGER_JOURNALS)) {
    try {
      const { journal, collections } = parseSpringer(await curlGet(`https://link.springer.com/journal/${id}/collections?filter=Open`));
      for (const c of collections) {
        const ev = springerToEvent(c, journal, topics);
        if (ev && new Date(ev.submission_deadline!).getTime() > now) out.push(ev);
      }
    } catch (e) {
      log(`  springer ${id}: ${e}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return out;
}

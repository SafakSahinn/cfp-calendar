// Veritabanına yazmadan kaynakları dener: `npm run dry-run`
import { fetchCcf } from './sources/ccf.ts';
import { fetchComsoc } from './sources/comsoc.ts';
import { fetchWikiCfp } from './sources/wikicfp.ts';
import { merge } from './merge.ts';

const fast = process.argv.includes('--ccf-only');
const ccf = await fetchCcf();
const wiki = fast ? [] : await fetchWikiCfp();
const comsoc = fast ? [] : await fetchComsoc();
console.log(`comsoc: ${comsoc.length}`);
const merged = merge([...ccf, ...wiki, ...comsoc]);
const now = Date.now();
const open = merged.filter((e) => e.submission_deadline && new Date(e.submission_deadline).getTime() > now);

console.log(`ccf: ${ccf.length}, wikicfp: ${wiki.length}, birleşik: ${merged.length}, başvurusu açık: ${open.length}`);
const count = (pred: (e: (typeof merged)[number]) => boolean) => open.filter(pred).length;
console.log(`  açık → CS: ${count((e) => e.fields.includes('cs'))}, EE: ${count((e) => e.fields.includes('ee'))}, ` +
  `dergi: ${count((e) => e.kind === 'journal')}, IEEE: ${count((e) => e.is_ieee)}`);
for (const e of open.sort((a, b) => a.submission_deadline!.localeCompare(b.submission_deadline!)).slice(0, 12)) {
  console.log(`  ${e.submission_deadline!.slice(0, 16)}  ${(e.acronym ?? '').padEnd(14)} ${e.kind.padEnd(10)} ${e.event_start ?? '-'}  [${e.topics.join(',')}]`);
}

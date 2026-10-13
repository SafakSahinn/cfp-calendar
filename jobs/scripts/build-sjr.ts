// Kullanım: npm run build-sjr -- "C:/Users/.../Downloads/scimagojr 2025.csv"
// SCImago CSV'sinden yalnızca Mühendislik + Bilgisayar Bilimi dergilerini (başlık, ISSN, çeyrek, SJR) data/sjr.json'a yazar.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseSjrCsv } from '../src/sjr.ts';

const path = process.argv[2];
if (!path) throw new Error('CSV dosya yolu verin');
const journals = parseSjrCsv(readFileSync(path, 'utf8'));
const year = basename(path).match(/(19|20)\d{2}/)?.[0] ?? String(new Date().getFullYear() - 1);
const out = new URL('../data/sjr.json', import.meta.url);
writeFileSync(out, JSON.stringify({ year, source: 'SCImago Journal Rank (scimagojr.com), Scopus verisi', journals }));
const q = (x: string) => journals.filter((j) => j.quartile === x).length;
console.log(`SJR ${year}: ${journals.length} dergi (Q1 ${q('Q1')}, Q2 ${q('Q2')}, Q3 ${q('Q3')}, Q4 ${q('Q4')}) → data/sjr.json`);

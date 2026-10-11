// Usage: node scripts/opensat/import.mjs --section math|english [--limit 10] [--from-file raw.json] [--dry-run] [--raw-dir d] [--out-dir d]
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTIONS, SOURCE, convertAll, formatReport } from './convert.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const next = process.argv[i + 1]; if (next && !next.startsWith('--')) { args[a.slice(2)] = next; i++; } else args[a.slice(2)] = true; } }
const fail = (m) => { console.error(m); process.exit(1); };

const cli = args.section;
if (!SECTIONS[cli]) fail('Usage: node scripts/opensat/import.mjs --section math|english [--limit 10] [--from-file raw.json] [--dry-run]');
const limit = Number(args.limit ?? 10);
if (!Number.isInteger(limit) || limit < 1) fail('--limit must be a positive integer');
const rawDir = path.resolve(ROOT, args['raw-dir'] ?? 'data-raw/opensat');
const outDir = path.resolve(ROOT, args['out-dir'] ?? 'data-import/opensat');
const importedAt = new Date().toISOString();
const stamp = importedAt.replace(/[:.]/g, '-');

let text, sourceUrl, rawFile;
if (args['from-file']) {
  rawFile = path.resolve(args['from-file']); sourceUrl = `file:${path.basename(rawFile)}`; text = await readFile(rawFile, 'utf8');
} else {
  const url = new URL(SOURCE.api);
  url.searchParams.set('section', cli); url.searchParams.set('limit', String(limit));
  sourceUrl = url.toString();
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'SATLab-importer (educational, small batch)' }, signal: AbortSignal.timeout(30000) }).catch((e) => fail(`Request failed: ${e.message}`));
  if (!res.ok) fail(`API answered ${res.status} ${res.statusText}`);
  text = await res.text(); // saved exactly as received, before any parsing
  rawFile = path.join(rawDir, `${cli}-${stamp}.json`);
  if (!args['dry-run']) { await mkdir(rawDir, { recursive: true }); await writeFile(rawFile, text); }
}
let data;
try { data = JSON.parse(text); } catch { fail('Response is not valid JSON. Nothing was imported.'); }
if (!Array.isArray(data)) fail(`Unexpected response shape (${typeof data}). Nothing was imported.`);

// The API ignored ?limit when this was written, so the limit is also enforced here.
const batch = data.slice(0, limit);
const existing = new Set();
const bankDir = path.join(ROOT, 'src/data/questions');
for (const f of existsSync(bankDir) ? await readdir(bankDir) : []) if (f.endsWith('.json')) for (const q of JSON.parse(await readFile(path.join(bankDir, f), 'utf8'))) existing.add(q.id);
const stagedFile = path.join(outDir, `staged-${cli}.json`);
const staged = existsSync(stagedFile) ? JSON.parse(await readFile(stagedFile, 'utf8')) : [];
staged.forEach((q) => existing.add(q.id));

const { questions, report } = convertAll(batch, { section: SECTIONS[cli], importedAt, sourceUrl, rawFile: path.relative(ROOT, rawFile) }, existing);
report.downloaded = data.length; // what the API sent, before the limit
const md = formatReport(report, `OpenSAT ${cli} import, ${importedAt}`);
console.log(md);
if (args['dry-run']) fail('\nDry run: nothing written.');
await mkdir(outDir, { recursive: true });
await writeFile(stagedFile, JSON.stringify([...staged, ...questions], null, 2));
await writeFile(path.join(outDir, `report-${cli}-${stamp}.json`), JSON.stringify(report, null, 2));
await writeFile(path.join(outDir, `report-${cli}-${stamp}.md`), md);
console.log(`\nStaged ${questions.length} draft question(s) in ${path.relative(ROOT, stagedFile)}. They are NOT published.`);

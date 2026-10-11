// Usage: node scripts/opensat/promote.mjs --section math|english (--ids id1,id2 | --approved) [--staged-dir d] [--target-dir d]
// Publishes questions approved in the review tool. The review tool does the same thing with its Publish button.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTIONS, promoteQuestions } from './convert.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const n = process.argv[i + 1]; if (n && !n.startsWith('--')) { args[a.slice(2)] = n; i++; } else args[a.slice(2)] = true; } }
const fail = (m) => { console.error(m); process.exit(1); };
if (!SECTIONS[args.section] || !(args.ids || args.approved)) fail('Usage: node scripts/opensat/promote.mjs --section math|english (--ids id1,id2 | --approved)');

export async function loadTaxonomy(root = ROOT) {
  const t = await readFile(path.join(root, 'src/data/taxonomy.ts'), 'utf8');
  return { domains: new Map([...t.matchAll(/\{ id: '([\w-]+)', section: '([\w-]+)'/g)].map((m) => [m[1], m[2]])), skills: new Map([...t.matchAll(/\{ id: '([\w-]+)', domain: '([\w-]+)'/g)].map((m) => [m[1], m[2]])) };
}
const tax = await loadTaxonomy();
const stagedFile = path.join(path.resolve(ROOT, args['staged-dir'] ?? 'data-import/opensat'), `staged-${args.section}.json`);
const targetDir = path.resolve(ROOT, args['target-dir'] ?? 'src/data/questions');
const targetFile = path.join(targetDir, `opensat-${args.section}.json`);
if (!existsSync(stagedFile)) fail(`No staged file: ${stagedFile}`);
const staged = JSON.parse(await readFile(stagedFile, 'utf8'));
const target = existsSync(targetFile) ? JSON.parse(await readFile(targetFile, 'utf8')) : [];
const bankIds = new Set();
for (const f of existsSync(targetDir) ? await readdir(targetDir) : []) if (f.endsWith('.json')) for (const q of JSON.parse(await readFile(path.join(targetDir, f), 'utf8'))) bankIds.add(q.id);

const ids = args.approved ? staged.filter((q) => q.reviewState?.status === 'approved').map((q) => q.id) : String(args.ids).split(',').map((s) => s.trim()).filter(Boolean);
const r = promoteQuestions(staged, target, ids, tax, { bankIds });
r.refused.forEach((x) => console.log(`REFUSED ${x.id}:\n  - ${x.blockers.join('\n  - ')}`));
r.skipped.forEach((id) => console.log(`SKIPPED ${id} (already in the bank)`));
if (r.promoted.length) {
  await mkdir(targetDir, { recursive: true });
  await writeFile(targetFile, JSON.stringify([...target, ...r.promoted], null, 2));
  const done = new Set(r.promoted.map((q) => q.id));
  await writeFile(stagedFile, JSON.stringify(staged.map((q) => (done.has(q.id) ? { ...q, reviewState: { ...q.reviewState, status: 'published' } } : q)), null, 2));
}
console.log(`Published ${r.promoted.length}, refused ${r.refused.length}, skipped ${r.skipped.length}.`);

// Local review tool. Usage: npm run review:opensat   (then open the printed address)
// Listens on 127.0.0.1 only, and every API call needs a random token that is embedded in the page it serves.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACK_FLAGS, HARD_FLAGS, SECTIONS, contentBlockers, flagStatus, promoteQuestions, publishBlockers } from './convert.mjs';
import { applyReview } from './review.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i]?.slice(2)] = process.argv[i + 1];
const PORT = Number(args.port ?? 4173);
const stagedDir = path.resolve(ROOT, args['staged-dir'] ?? 'data-import/opensat');
const targetDir = path.resolve(ROOT, args['target-dir'] ?? 'src/data/questions');
const TOKEN = randomBytes(16).toString('hex');
const page = (await readFile(new URL('./review-ui.html', import.meta.url), 'utf8'));

const ts = await readFile(path.join(ROOT, 'src/data/taxonomy.ts'), 'utf8');
const doms = [...ts.matchAll(/\{ id: '([\w-]+)', section: '([\w-]+)', label: '([^']+)'/g)].map((m) => ({ id: m[1], section: m[2], label: m[3] }));
const skls = [...ts.matchAll(/\{ id: '([\w-]+)', domain: '([\w-]+)', label: '([^']+)'/g)].map((m) => ({ id: m[1], domain: m[2], label: m[3] }));
const tax = { domains: new Map(doms.map((d) => [d.id, d.section])), skills: new Map(skls.map((s) => [s.id, s.domain])) };

const cliOf = (section) => Object.keys(SECTIONS).find((k) => SECTIONS[k] === section);
const stagedPath = (cli) => path.join(stagedDir, `staged-${cli}.json`);
async function readStaged(cli) { return existsSync(stagedPath(cli)) ? JSON.parse(await readFile(stagedPath(cli), 'utf8')) : []; }
const view = (q) => ({ ...q, flags: flagStatus(q, tax), blockers: publishBlockers(q, tax), contentBlockers: contentBlockers(q, tax) });

async function bankIds() {
  const ids = new Set();
  for (const f of existsSync(targetDir) ? await readdir(targetDir) : []) if (f.endsWith('.json')) for (const q of JSON.parse(await readFile(path.join(targetDir, f), 'utf8'))) ids.add(q.id);
  return ids;
}
async function body(req) {
  let n = 0, s = '';
  for await (const c of req) { n += c.length; if (n > 200_000) throw new Error('Request too large'); s += c; }
  return s ? JSON.parse(s) : {};
}

const server = http.createServer(async (req, res) => {
  const send = (code, data, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'" });
    res.end(typeof data === 'string' ? data : JSON.stringify(data));
  };
  try {
    if (!['127.0.0.1', 'localhost'].includes((req.headers.host ?? '').split(':')[0])) return send(403, { error: 'forbidden' });
    const url = new URL(req.url, 'http://local');
    if (req.method === 'GET' && url.pathname === '/') return send(200, page.replace('__TOKEN__', TOKEN), 'text/html; charset=utf-8');
    if (req.headers['x-review-token'] !== TOKEN) return send(403, { error: 'bad token' });
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const questions = [];
      for (const cli of Object.keys(SECTIONS)) for (const q of await readStaged(cli)) questions.push(view(q));
      return send(200, { questions, taxonomy: { domains: doms, skills: skls }, ackFlags: ACK_FLAGS, hardFlags: HARD_FLAGS });
    }
    if (req.method === 'POST' && url.pathname === '/api/review') {
      const b = await body(req);
      for (const cli of Object.keys(SECTIONS)) {
        const list = await readStaged(cli), i = list.findIndex((q) => q.id === b.id);
        if (i < 0) continue;
        const r = applyReview(list[i], b, tax);
        if (!r.ok) return send(400, { errors: r.errors });
        list[i] = r.question;
        await mkdir(stagedDir, { recursive: true });
        await writeFile(stagedPath(cli), JSON.stringify(list, null, 2));
        return send(200, { question: view(r.question) });
      }
      return send(404, { errors: ['Question not found.'] });
    }
    if (req.method === 'POST' && url.pathname === '/api/publish') {
      const ids = await bankIds(), summary = { published: 0, refused: [], skipped: 0 };
      for (const cli of Object.keys(SECTIONS)) {
        const staged = await readStaged(cli), file = path.join(targetDir, `opensat-${cli}.json`);
        const target = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : [];
        const r = promoteQuestions(staged, target, staged.filter((q) => q.reviewState?.status === 'approved').map((q) => q.id), tax, { bankIds: ids });
        summary.refused.push(...r.refused); summary.skipped += r.skipped.length;
        if (r.promoted.length) {
          await mkdir(targetDir, { recursive: true });
          await writeFile(file, JSON.stringify([...target, ...r.promoted], null, 2));
          const done = new Set(r.promoted.map((q) => q.id));
          await writeFile(stagedPath(cli), JSON.stringify(staged.map((q) => (done.has(q.id) ? { ...q, reviewState: { ...q.reviewState, status: 'published' } } : q)), null, 2));
          summary.published += r.promoted.length;
        }
      }
      return send(200, summary);
    }
    send(404, { error: 'not found' });
  } catch (e) { send(500, { errors: [String(e.message ?? e)] }); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`SATLab review tool: http://127.0.0.1:${PORT}  (Ctrl+C to stop)`));

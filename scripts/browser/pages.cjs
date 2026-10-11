// Real-browser test of Home, Practice and Dashboard with the real components, real compiled Tailwind and the real question bank.
// The router is a small stand-in (pages-router.js). Learner data is synthetic and exists only inside this test.
// Needs: npm i -D playwright esbuild && npx playwright install chromium     Run: node scripts/browser/pages.cjs   (SHOTS=dir saves screenshots)
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const path = require('path'), os = require('os'), fs = require('fs');
const assert = require('assert');
const root = path.join(__dirname, '..', '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satlab-pages-'));
// esbuild has no import.meta.glob, so this plugin swaps it for static imports of the same JSON files.
const glob = { name: 'glob', setup(b) { b.onLoad({ filter: /questionBank\.ts$/ }, (a) => {
  const qd = path.join(root, 'src/data/questions'), files = fs.readdirSync(qd).filter((f) => f.endsWith('.json')).sort();
  const imports = files.map((f, i) => `import q${i} from ${JSON.stringify(path.join(qd, f))};`).join('\n');
  const src = fs.readFileSync(a.path, 'utf8').replace(/import\.meta\.glob<Question\[\]>\([^)]*\)/, `({${files.map((f, i) => `${JSON.stringify(f)}: q${i}`).join(',')}} as Record<string, Question[]>)`);
  return { contents: imports + '\n' + src, loader: 'ts', resolveDir: path.dirname(a.path) };
}); } };
const built = esbuild.build({ entryPoints: [path.join(__dirname, 'pages-entry.tsx')], bundle: true, format: 'iife', jsx: 'automatic', plugins: [glob], alias: { 'react-router-dom': path.join(__dirname, 'pages-router.js') }, define: { 'process.env.NODE_ENV': '"production"' }, nodePaths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean), outfile: path.join(dir, 'bundle.js') });
const tw = process.env.TAILWIND_CLI ? ['node', [process.env.TAILWIND_CLI]] : ['npx', ['tailwindcss']];
require('child_process').execFileSync(tw[0], [...tw[1], '-c', 'tailwind.config.js', '-i', 'src/index.css', '-o', path.join(dir, 'app.css')], { cwd: root, stdio: 'ignore' });
fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><link rel=stylesheet href="app.css"><div id=root></div><script src="bundle.js"></script>');

const meta = { M0001: ['math', 'algebra', 'linear-equations-one-variable', 'easy'], RW0001: ['reading-writing', 'craft-and-structure', 'words-in-context', 'medium'], RW0006: ['reading-writing', 'craft-and-structure', 'words-in-context', 'hard'], M0003: ['math', 'advanced-math', 'nonlinear-equations', 'medium'] };
let n = 0;
const at = (q, ok, o = {}) => { const [section, domain, skill, difficulty] = meta[q]; return { id: 'a' + n, questionId: q, questionVersion: 1, response: ok ? 'B' : 'A', isCorrect: ok, at: 1_700_000_000_000 + 1000 * n++, source: 'practice', section, domain, skill, difficulty, timeSpentSec: 10, sessionId: 'S0', ...o }; };
const attempts = [at('M0001', false, { errorType: 'careless', confidence: 'sure' }), at('M0001', false, { errorType: 'careless', confidence: 'unsure' }), at('M0001', false, { errorType: 'careless' }), at('M0001', false), at('M0001', true),
  at('RW0001', false, { errorType: 'careless', confidence: 'guess' }), at('RW0006', false), at('RW0001', true), at('RW0006', false), at('M0003', true), at('M0003', true), at('M0003', true)];
const answers = { M0001: 'A', M0002: null, M0003: null, M0004: null, M0005: null, M0006: 'A' };
const store = { attempts, results: [{ id: 'r1', testId: 'math-mini', title: 'Math mini test', at: 1_700_000_100_000, durationSec: 120, answers: { ...answers, M0006: 'A' } }], notes: {}, sessions: [] };
const validResult = (s) => s;

(async () => {
  await built; // plugins need the async esbuild API
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ok = (m) => console.log('ok  -', m);
  const open = async (pg, { seed, width = 1280, height = 900 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height } }); const page = await ctx.newPage();
    page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
    if (seed) await page.addInitScript((s) => localStorage.setItem('satlab:v2', JSON.stringify(s)), seed);
    await page.goto(`file://${path.join(dir, 'index.html')}?page=${pg}`); await page.waitForSelector('main h1, main h2');
    return page;
  };
  const shot = async (page, name) => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), fullPage: true }); } };
  const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

  // Home: new user
  let p = await open('landing'); await shot(p, 'home-new');
  const t0 = await p.textContent('main'); assert.ok(t0.includes('Practice smarter for the SAT.') && t0.includes('Start your first practice session') && !t0.includes('Continue learning'));
  assert.deepStrictEqual(await p.$$eval('main a', (a) => a.map((x) => x.getAttribute('href'))), ['#/practice', '#/tests', '#/practice', '#/practice', '#/tests', '#/mistakes', '#/dashboard']);
  assert.ok(await p.$('header a[href="#/"]')); assert.strictEqual((await p.$$eval('footer a', (a) => a.map((x) => x.getAttribute('href')))).join(), '#/about,mailto:nguyendinhquyetthang100@gmail.com'); ok('Home (new user): welcome state, no invented statistics, every card and button has the right destination, footer has About and mailto');
  await p.context().close();

  // Home: with data. Numbers must equal what the stored data says.
  p = await open('landing', { seed: store }); await shot(p, 'home-data');
  const t1 = await p.textContent('main'), last10 = attempts.slice(-10);
  assert.ok(t1.includes('Continue learning') && t1.includes(`${Math.round(100 * last10.filter((a) => a.isCorrect).length / 10)}%`) && t1.includes('last 10 answers'));
  assert.ok(t1.includes('Words in Context') || t1.includes('Linear equations in one variable')); assert.ok(t1.includes('4different') || t1.includes('4 different')); const lastBy = new Map(); attempts.forEach((a) => lastBy.set(a.questionId, a.isCorrect)); const mistakes = [...lastBy.values()].filter((v) => !v).length; assert.ok(t1.includes(`Review mistakes (${mistakes})`), t1); ok('Home (with data): answered, recent accuracy, next skill and mistake count all match the stored data');
  await p.setViewportSize({ width: 390, height: 800 }); await shot(p, 'home-mobile'); assert.ok(await noOverflow(p)); ok('Home on mobile: no horizontal overflow'); await p.context().close();

  // Practice
  p = await open('practice', { seed: store }); await shot(p, 'practice-data');
  const t2 = await p.textContent('main');
  assert.ok(t2.includes('2 skills need attention')); assert.ok(t2.includes('Only 3 matching questions are available, so this session will have 3 (you chose 10)')); assert.ok(t2.includes('Nothing is repeated'));
  assert.strictEqual((await p.$$('li button:has-text("Practice this skill")')).length, 2);
  assert.ok(t2.includes('20%') && t2.includes('5 attempts') && t2.includes('25%') && t2.includes('4 attempts') && t2.includes('Needs attention')); ok('Practice: "2 skills need attention", per-skill accuracy, attempts and status; only-3-available notice shown before starting');
  assert.strictEqual(await p.$eval('details', (d) => d.open), false); await p.click('details summary'); assert.ok((await p.textContent('details')).includes('You answered')); ok('detailed reasoning is collapsed under "Why this skill?" and opens on demand');
  await p.click('li button:has-text("Practice this skill") >> nth=0');
  assert.match(await p.evaluate(() => window.__nav), /^\/practice\/session\/s\d+$/);
  const ss = await p.evaluate(() => JSON.parse(localStorage.getItem('satlab:v2')).sessions);
  assert.strictEqual(ss.length, 1); assert.deepStrictEqual(ss[0].questionIds, ['M0001']); assert.strictEqual(ss[0].plan.items.length, 1);
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('satlab:v2')).attempts.length), attempts.length); ok('"Practice this skill" starts a one-skill session from eligible published questions and records no attempts');
  await p.selectOption('select >> nth=1', '5'); assert.ok((await p.textContent('main')).includes('Only 3 matching')); await p.context().close();
  p = await open('practice'); const t3 = await p.textContent('main');
  assert.ok(t3.includes('No skills need attention yet') && t3.includes('no practice history') && await p.isDisabled('button:has-text("Practice weak areas")')); await shot(p, 'practice-new'); ok('Practice with no history: explains why there is no recommendation and disables the button'); await p.context().close();
  p = await open('practice', { seed: store, width: 390, height: 800 }); await shot(p, 'practice-mobile'); assert.ok(await noOverflow(p)); ok('Practice on mobile: no horizontal overflow'); await p.context().close();

  // Dashboard
  p = await open('dashboard', { seed: store }); await shot(p, 'dashboard-data');
  const stat = async (label) => p.evaluate((l) => { const el = [...document.querySelectorAll('main p')].find((x) => x.textContent === l); return el ? [el.nextElementSibling.textContent, el.nextElementSibling.nextElementSibling?.textContent ?? ''] : null; }, label);
  const correct = attempts.filter((a) => a.isCorrect).length;
  assert.deepStrictEqual((await stat('Questions answered'))[0], String(attempts.length));
  assert.deepStrictEqual((await stat('Accuracy')), [`${Math.round(100 * correct / attempts.length)}%`, `${correct} of ${attempts.length} answers correct`]);
  assert.strictEqual((await stat('Average test score'))[0], '17%'); // one correct answer out of six questions: 1/6 = 16.7%
  const avgTime = await stat('Average time per question'); assert.strictEqual(avgTime[0], '10s'); assert.ok(avgTime[1].includes('12 timed'));
  const err = await stat('Most common error type'); assert.ok(err[0] === 'Calculation / careless mistake' && err[1].includes('Based on only 4 recorded mistakes')); ok('Dashboard numbers equal the stored data (accuracy, average test score, average time, error type with small-sample caveat)');
  const t4 = await p.textContent('main'); assert.ok(t4.includes('Recommended next step') && t4.includes('Practice this skill') && t4.includes('Practice all weak areas') && t4.includes('Linear equations in one variable') && t4.includes('This is based on only 5 answers')); ok('Dashboard: recommended next step uses real accuracy and attempts, with actions');
  p.once('dialog', (d) => d.dismiss()); await p.click('button:has-text("Reset data")'); assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('satlab:v2')).attempts.length), attempts.length); ok('Reset asks for confirmation and keeps data when cancelled');
  await p.setViewportSize({ width: 390, height: 800 }); await shot(p, 'dashboard-mobile'); assert.ok(await noOverflow(p)); ok('Dashboard on mobile: no horizontal overflow'); await p.context().close();

  // Dashboard edge cases: bad data must not crash or distort numbers
  const messy = { ...store, attempts: [at('M0001', true, { timeSpentSec: 0 }), at('M0001', false, { timeSpentSec: -4 }), at('RW0001', true, { timeSpentSec: NaN }), at('RW0001', false, { at: undefined, timeSpentSec: 6 }), at('M0001', true, { timeSpentSec: 999999 })], results: [{ id: 'r9', testId: 'x', title: 'Broken', at: 1, durationSec: 5, answers: {} }, { id: 'r8', testId: 'math-mini', title: 'Ok', at: 2, durationSec: 5, answers: { M0001: 'B', M0002: null } }] };
  p = await open('dashboard', { seed: messy }); const m1 = await p.textContent('main');
  assert.ok(m1.includes('6s') && m1.includes('1 timed') && m1.includes('4 invalid ignored')); assert.strictEqual((await stat('Average test score'))[0], '50%'); assert.deepStrictEqual(p.errors, []); ok('invalid or missing durations and timestamps are ignored, an empty test has no score, nothing crashes'); await p.context().close();
  p = await open('dashboard', { seed: { attempts: [], results: [], notes: {}, sessions: [] } }); assert.ok((await p.textContent('main')).includes('No data yet')); await shot(p, 'dashboard-empty'); await p.context().close();
  p = await open('dashboard', { seed: { attempts: [at('M0001', true, { timeSpentSec: undefined })], results: [], notes: {}, sessions: [] } }); const f = await p.textContent('main');
  assert.ok(f.includes('Keep practicing') && f.includes('Time is recorded') === false && f.includes('Not available') && f.includes('None')); assert.deepStrictEqual(p.errors, []); ok('very little data: no recommendation, "Not available" instead of fake numbers'); await p.context().close();
  // Timed test in the exam workspace
  p = await open('testrun&id=mixed'); assert.ok((await p.textContent('main')).includes('Mixed mini test')); await p.click('button:has-text("Begin")'); await p.waitForSelector('section[aria-label="Question"]');
  const clock = () => p.textContent('[role=timer]'); const c1 = await clock(); assert.match(c1, /^(18:00|17:59)$/); await p.waitForTimeout(2200); assert.notStrictEqual(await clock(), c1); ok('test starts in the exam workspace and the timer counts down');
  await p.click('[role=radio] >> nth=1'); await p.click('footer button:has-text("Next")'); await p.click('footer button:has-text("Previous")');
  assert.strictEqual(await p.getAttribute('[role=radio] >> nth=1', 'aria-checked'), 'true'); ok('test answers persist when moving between questions');
  await p.click('footer button[aria-haspopup="dialog"]'); const nl = await p.$$eval('[role=dialog] button[aria-label^="Question"]', (b) => b.map((x) => x.getAttribute('aria-label')));
  assert.strictEqual(nl.length, 12); assert.strictEqual(nl[0], 'Question 1, answered'); assert.strictEqual(nl[1], 'Question 2, not answered');
  await p.click('[role=dialog] button:has-text("Submit")'); let dlg = await p.textContent('[role=dialog]'); assert.ok(dlg.includes('11 questions are not answered') && /1\d:\d\d left/.test(dlg)); ok('submit asks for confirmation with the unanswered count and time left');
  await p.click('[role=dialog] button:has-text("Keep working")'); assert.strictEqual(await p.evaluate(() => window.__nav), undefined); assert.deepStrictEqual(await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('satlab:v2') || '{}'); return [(d.attempts || []).length, (d.results || []).length]; }), [0, 0]); ok('cancelling changes nothing');
  await p.click('header button:has-text("Exit")'); assert.ok((await p.textContent('[role=dialog]')).includes('will be lost')); await p.click('[role=dialog] button:has-text("Stay")'); assert.ok(await p.isVisible('section[aria-label="Question"]')); ok('leaving a test warns that answers will be lost');
  await p.click('footer button[aria-haspopup="dialog"]'); await p.click('[role=dialog] button:has-text("Submit")'); await p.click('[role=dialog] button:has-text("Submit") >> nth=-1');
  assert.match(await p.evaluate(() => window.__nav), /^\/results\/r\d+$/);
  const db = await p.evaluate(() => JSON.parse(localStorage.getItem('satlab:v2')));
  assert.strictEqual(db.results.length, 1); assert.strictEqual(Object.keys(db.results[0].answers).length, 12); assert.strictEqual(Object.values(db.results[0].answers).filter((v) => v !== null).length, 1);
  assert.strictEqual(db.attempts.length, 12); assert.ok(db.attempts.every((a) => a.source === 'test' && a.testResultId === db.results[0].id)); assert.strictEqual(db.attempts.filter((a) => a.response === null && a.isCorrect === false).length, 11);
  ok('submitting saves the result and one attempt per question; unanswered questions are recorded as unanswered, not correct'); assert.deepStrictEqual(p.errors, []); await p.context().close();
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });

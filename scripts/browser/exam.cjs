// Real-browser test of the exam workspace (two panels, navigation, persistence, mobile tabs, highlights, keyboard, finish).
// Needs: npm i -D playwright esbuild && npx playwright install chromium     Run: node scripts/browser/exam.cjs
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const path = require('path'), os = require('os'), fs = require('fs');
const assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satlab-exam-'));
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'exam-entry.tsx')], bundle: true, format: 'iife', jsx: 'automatic', alias: { 'react-router-dom': path.join(__dirname, 'router.js') }, define: { 'process.env.NODE_ENV': '"production"' }, nodePaths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean), outfile: path.join(dir, 'bundle.js') });
// The project's real Tailwind build, so layout checks run against the real classes. TAILWIND_CLI can point at a tailwind cli.js.
const root = path.join(__dirname, '..', '..');
const tw = process.env.TAILWIND_CLI ? ['node', [process.env.TAILWIND_CLI]] : ['npx', ['tailwindcss']];
require('child_process').execFileSync(tw[0], [...tw[1], '-c', 'tailwind.config.js', '-i', 'src/index.css', '-o', path.join(dir, 'app.css')], { cwd: root, stdio: 'ignore' });
let katexCss = path.join(root, 'node_modules/katex/dist/katex.min.css'); try { katexCss = require.resolve('katex/dist/katex.min.css', { paths: [root] }); } catch { /* use default path */ }
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="file://${katexCss}"><div id=root></div><script src="bundle.js"></script>`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const url = 'file://' + path.join(dir, 'index.html');
  const ok = (n) => console.log('ok  -', n);
  const L = 'section[aria-label="Question"]', R = 'section[aria-label="Answers"]';
  const box = (s) => page.$eval(s, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const top = (s) => page.$eval(s, (e) => e.scrollTop);
  const checked = (label) => page.getAttribute(`[role=radio]:has-text("${label}")`, 'aria-checked');
  const pos = () => page.textContent('header p');
  const next = () => page.click('footer button:has-text("Next")'), prev = () => page.click('footer button:has-text("Previous")');
  const select = (a, ao, b, bo, field = 'passage') => page.evaluate(([a, ao, b, bo, field]) => {
    const root = document.querySelector(`[data-field="${field}"]`), w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), ns = []; while (w.nextNode()) ns.push(w.currentNode);
    const f = (t) => { const n = ns.find((x) => x.data.includes(t)); return [n, n.data.indexOf(t)]; };
    const [n1, i1] = f(a), [n2, i2] = f(b), r = document.createRange(); n1.parentElement.scrollIntoView({ block: 'center' }); r.setStart(n1, i1 + ao); r.setEnd(n2, i2 + bo); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }, [a, ao, b, bo, field]);
  const shot = async (n) => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOTS, n + '.png') }); } };
  await page.goto(url); await page.waitForSelector(L);

  // 1. two panels side by side, whole page does not scroll
  const l = await box(L), r = await box(R);
  assert.ok(l.x + l.w <= r.x + 1 && Math.abs(l.y - r.y) < 2 && l.h > 300, JSON.stringify([l, r]));
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.body.scrollHeight <= innerHeight + 1)); ok('desktop: passage left, answers right, side by side, no page-level scrolling');
  assert.ok(await page.$eval(L, (e) => e.scrollHeight > e.clientHeight) && await page.$eval(R, (e) => e.scrollHeight > e.clientHeight)); ok('long passage and long answer choices both overflow their own panel');

  await shot('exam-desktop');
  // 2. independent scrolling
  await page.mouse.move(l.x + l.w / 2, l.y + 200); await page.mouse.wheel(0, 700); await page.waitForTimeout(150);
  const leftTop = await top(L); assert.ok(leftTop > 100 && await top(R) === 0); ok('scrolling the passage does not move the answers');
  await page.mouse.move(r.x + r.w / 2, r.y + 200); await page.mouse.wheel(0, 500); await page.waitForTimeout(150);
  assert.ok(await top(R) > 50 && await top(L) === leftTop); ok('scrolling the answers does not move the passage');

  // 3. answers and scroll positions survive Next / Previous
  const rightTop = await top(R);
  await page.click('[role=radio]:has-text("Choice B")'); assert.strictEqual(await checked('Choice B'), 'true');
  await next(); assert.match(await pos(), /Question 2 of 3/); assert.strictEqual(await top(L), 0);
  await prev(); assert.match(await pos(), /Question 1 of 3/);
  assert.strictEqual(await checked('Choice B'), 'true'); assert.ok(Math.abs(await top(L) - leftTop) <= 1 && Math.abs(await top(R) - rightTop) <= 1); ok('Previous restores the selected answer without checking it, and both scroll positions');
  assert.ok(await page.$eval('#root', (e) => e.hasAttribute('inert'))); ok('the site behind the workspace is inert (keyboard cannot leave it)');

  // 4. flag + navigator
  await page.click('header button:has-text("Flag")'); assert.strictEqual(await page.getAttribute('header button[aria-pressed]', 'aria-pressed'), 'true');
  await page.click('footer button:has-text("Question 1 of 3")');
  const labels = await page.$$eval('[role=dialog] button[aria-label^="Question"]', (b) => b.map((x) => x.getAttribute('aria-label')));
  assert.deepStrictEqual(labels, ['Question 1, answered, flagged', 'Question 2, not answered', 'Question 3, not answered']); ok('navigator shows answered, unanswered and flagged questions');
  await page.keyboard.press('Escape'); assert.strictEqual(await page.$('[role=dialog]'), null); ok('Escape closes the navigator');
  await page.click('footer button:has-text("Question 1 of 3")'); await page.click('[role=dialog] button[aria-label^="Question 2"]'); assert.match(await pos(), /Question 2 of 3/); ok('navigator jumps to a question');

  // 5. math question without passage: formulas, figure inside the panel, check + confidence persist
  assert.ok(await page.$(`${L} .katex`)); const fig = await page.$(`${L} img[alt="A number line from 0 to 10"]`); assert.ok(fig);
  const fb = await fig.boundingBox(), lb = await box(L); assert.ok(fb.x >= lb.x && fb.x + fb.width <= lb.x + lb.w + 1); ok('equation renders, figure keeps its alt text and stays inside the panel');
  await page.click('[role=radio]:has-text("x = 6")'); await page.click(`${R} button:has-text("Check")`);
  assert.ok((await page.textContent(R)).includes('Correct')); await page.click('button:text-is("Sure")'); await shot('exam-math-checked'); ok('Check shows the result and explanation');
  await prev(); await next(); assert.ok((await page.textContent(R)).includes('Correct')); assert.strictEqual(await page.getAttribute('button:text-is("Sure")', 'aria-pressed'), 'true'); ok('a checked answer and its confidence are restored after navigating away');

  // 6. typed answer persists; reload keeps position, draft and recorded answers
  await next(); assert.match(await pos(), /Question 3 of 3/); await page.fill('input', '7'); await prev(); await next(); assert.strictEqual(await page.inputValue('input'), '7');
  await page.reload(); await page.waitForSelector(L);
  assert.match(await pos(), /Question 3 of 3/); assert.strictEqual(await page.inputValue('input'), '7'); await prev();
  assert.ok((await page.textContent(R)).includes('Correct')); ok('typed answer survives navigation; after a reload position, draft and checked answers are restored');

  // 7. highlights in the new left panel persist across navigation
  await prev(); await select('go now', 0, 'go now', 6); await page.waitForSelector('[role=toolbar]'); await page.click('[role=toolbar] button:has-text("Highlight")');
  assert.deepStrictEqual(await page.$$eval(`${L} .hl`, (n) => n.map((x) => x.textContent)), ['go now']);
  await next(); await prev(); assert.deepStrictEqual(await page.$$eval(`${L} .hl`, (n) => n.map((x) => x.textContent)), ['go now']);
  await page.click('button:has-text("Clear highlights")'); assert.strictEqual((await page.$$(`${L} .hl`)).length, 0); ok('highlight works in the passage panel, persists across questions, and clears');

  // 8. keyboard: arrows and letters pick answers; Tab is not trapped
  await page.focus('[role=radio][aria-checked=true]'); await page.keyboard.press('ArrowDown'); assert.strictEqual(await checked('Choice C'), 'true');
  await page.keyboard.press('a'); assert.strictEqual(await checked('Choice A'), 'true'); await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !document.activeElement.closest('[role=radiogroup]'))); ok('keyboard: arrow keys and A-D choose answers; Tab leaves the group');

  // 9. mobile: tabs, no overflow, answer kept; back to desktop keeps it too
  await page.setViewportSize({ width: 390, height: 800 });
  await shot('exam-mobile-question');
  const fits = () => page.$$eval('header button, footer button, [role=group][aria-label=Show] button', (bs) => bs.every((b) => { const r = b.getBoundingClientRect(); return r.left >= -0.5 && r.right <= innerWidth + 0.5; }));
  assert.ok(await fits(), 'controls overflow at 390px'); await page.setViewportSize({ width: 360, height: 700 }); assert.ok(await fits(), 'controls overflow at 360px'); await page.setViewportSize({ width: 390, height: 800 }); ok('mobile: toolbar and bottom bar controls fit at 390px and 360px');
  assert.ok(await page.isVisible('button:has-text("Answers")')); assert.ok(!(await page.isVisible(R)) && await page.isVisible(L));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); ok('mobile: tab switch instead of squeezed columns, no horizontal overflow');
  await page.click('button[aria-pressed]:has-text("Answers")'); assert.ok(await page.isVisible(R)); assert.strictEqual(await checked('Choice A'), 'true');
  await shot('exam-mobile-answers');
  assert.ok(await page.$eval(R, (e) => e.scrollWidth <= e.clientWidth + 1)); await page.setViewportSize({ width: 1280, height: 800 });
  assert.ok(await page.isVisible(L) && await page.isVisible(R)); assert.strictEqual(await checked('Choice A'), 'true'); ok('switching between mobile and desktop mid-session keeps the answer');

  // 10. wrong answer: error reason can be recorded
  await page.click(`${R} button:has-text("Check")`); assert.ok((await page.textContent(R)).includes('Not quite'));
  await page.click('button:has-text("I guessed")'); assert.strictEqual(await page.getAttribute('button:has-text("I guessed")', 'aria-pressed'), 'true'); assert.strictEqual(await page.$('button:has-text("Skip")'), null); ok('wrong answer asks why; the reason is saved');

  // 11. finish: confirmation, cancel keeps going, confirm records pending answers
  await next(); await next(); assert.strictEqual(await page.isVisible('footer button:has-text("Finish session")'), true);
  await page.click('footer button:has-text("Finish session")'); const msg = await page.textContent('[role=dialog]');
  assert.ok(msg.includes('You answered every question') && msg.includes('1 selected answer')); await page.click('[role=dialog] button:has-text("Keep going")');
  assert.strictEqual(await page.$('[role=dialog]'), null); assert.strictEqual(await page.$('#done'), null); ok('finish asks for confirmation and can be cancelled');
  await page.click('footer button:has-text("Finish session")'); await page.click('[role=dialog] button:has-text("Finish session")'); await page.waitForSelector('#done');
  const att = await page.evaluate(() => JSON.parse(localStorage.getItem('satlab:v2')).attempts);
  assert.deepStrictEqual(att.map((a) => [a.questionId, a.response, a.isCorrect]).sort(), [['E1', 'A', false], ['E2', 'B', true], ['E3', '7', true]]);
  assert.ok(att.every((a) => a.sessionId === 'S1' && Number.isInteger(a.timeSpentSec) && a.timeSpentSec >= 1)); assert.strictEqual(att.find((a) => a.questionId === 'E1').errorType, 'guess'); assert.strictEqual(att.find((a) => a.questionId === 'E2').confidence, 'sure');
  assert.ok(!(await page.$eval('#root', (e) => e.hasAttribute('inert')))); ok('finishing records the unchecked answer, with time, confidence and error reason; the site becomes usable again');
  assert.deepStrictEqual(errors, [], errors.join(' | ')); ok('no console or page errors');
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });

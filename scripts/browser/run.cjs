// Real-browser test of the highlight feature on the actual QuestionCard.
// Needs: npm i -D playwright esbuild && npx playwright install chromium   (not part of the app's dependencies)
// Run:   node scripts/browser/run.cjs      (set CHROMIUM_PATH to use an existing Chromium)
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const path = require('path'), os = require('os'), fs = require('fs');
const assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satlab-bt-'));
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'entry.tsx')], bundle: true, format: 'iife', jsx: 'automatic', alias: { 'react-router-dom': path.join(__dirname, 'router.js') }, define: { 'process.env.NODE_ENV': '"production"' }, nodePaths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean), outfile: path.join(dir, 'bundle.js') });
fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><meta charset=utf-8><div id=root></div><script src="bundle.js"></script>');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('file://' + path.join(dir, 'index.html'));
  const PASSAGE = await page.evaluate(() => window.PASSAGE);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('satlab:highlights:v1') || '{}')['T1@1']);
  const marks = () => page.$$eval('[data-field="passage"] .hl', (n) => n.map((x) => x.textContent));
  // select by DOM text: pick(startText, startOffset, endText, endOffset, field, nth)
  const select = (a, ao, b, bo, field = 'passage', nth = 0) => page.evaluate(([a, ao, b, bo, field, nth]) => {
    const root = document.querySelector(`[data-field="${field}"]`);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    const find = (txt, n) => { let c = 0; for (const t of nodes) { let i = -1; while ((i = t.data.indexOf(txt, i + 1)) >= 0) { if (c++ === n) return [t, i]; } } throw new Error('no text ' + txt); };
    const [n1, i1] = find(a, nth), [n2, i2] = b === a ? [n1, i1] : find(b, 0);
    const r = document.createRange(); r.setStart(n1, i1 + ao); r.setEnd(n2, i2 + bo);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }, [a, ao, b, bo, field, nth]);
  const ok = (name) => console.log('ok  -', name);

  // 1. toolbar appears on selection and highlights exactly the selected words
  await select('wrote about', 0, 'wrote about', 11);
  await page.waitForSelector('[role=toolbar]');
  await page.click('[role=toolbar] button:has-text("Highlight")');
  assert.deepStrictEqual(await marks(), ['wrote about']);
  let st = await stored(); assert.strictEqual(PASSAGE.slice(...st.passage[0]), 'wrote about'); ok('select + Highlight highlights exactly the selection, saved as source offsets');

  // 2. selection across italic, formula and plain text; the formula is highlighted whole
  await select('Color Purple', 0, ' twice', 6);
  await page.waitForSelector('[role=toolbar]'); await page.click('[role=toolbar] button:has-text("Highlight")');
  st = await stored();
  const s = PASSAGE.indexOf('Color'), e = PASSAGE.indexOf('$x^2 + 3$') + '$x^2 + 3$'.length + 6;
  const close = PASSAGE.indexOf('_ the'); assert.deepStrictEqual(st.passage, [[s, close], [close + 1, e]]); // the hidden closing _ of the italics is the only gap; the earlier "wrote about" range merged in
  assert.ok(await page.$('[data-field="passage"] .katex.hl, [data-field="passage"] span.hl .katex')); ok('selection across <em>, KaTeX formula and text; ranges merged; formula highlighted whole');

  // 3. persists after reload
  await page.reload(); assert.ok((await marks()).length >= 3); assert.deepStrictEqual((await stored()).passage, [[s, close], [close + 1, e]]); ok('highlights persist after a page reload');

  // 4. click an existing highlight to remove it
  await page.click('mark.hl >> nth=0'); const tb = await page.waitForSelector('[role=toolbar]');
  assert.strictEqual(await page.$('[role=toolbar] button:has-text("Highlight")'), null); await page.click('[role=toolbar] button:has-text("Remove")');
  assert.deepStrictEqual((await stored()).passage, [[close + 1, e]]); await page.click('button:has-text("Clear highlights")'); assert.strictEqual(await stored(), undefined); ok('clicking a highlight offers Remove, and removing it works');

  // 5. repeated text: only the second occurrence is highlighted
  await select('go', 0, 'go', 2, 'passage', 1); await page.waitForSelector('[role=toolbar]'); await page.click('[role=toolbar] button:has-text("Highlight")');
  st = await stored(); const second = PASSAGE.lastIndexOf('go'); assert.deepStrictEqual(st.passage, [[second, second + 2]]); assert.deepStrictEqual(await marks(), ['go']); ok('repeated words: only the selected occurrence is highlighted');

  // 6. partial removal inside a highlight, then Clear highlights
  await select('Say go now, then go again.'.slice(0, 0) + 'go', 0, 'go', 1, 'passage', 1); await page.waitForSelector('[role=toolbar]');
  await page.click('[role=toolbar] button:has-text("Remove")'); assert.deepStrictEqual((await stored()).passage, [[second + 1, second + 2]]); ok('Remove on a partial selection trims only that part');
  await page.click('button:has-text("Clear highlights")'); assert.strictEqual((await marks()).length, 0); assert.strictEqual(await stored(), undefined); ok('Clear highlights empties the question and its storage');

  // 7. prompt highlights are stored separately from passage highlights
  await select('main idea', 0, 'main idea', 9, 'prompt'); await page.waitForSelector('[role=toolbar]'); await page.click('[role=toolbar] button:has-text("Highlight")');
  st = await stored(); assert.deepStrictEqual(st.passage || [], []); assert.strictEqual('Which choice best states the main idea?'.slice(...st.prompt[0]), 'main idea'); ok('prompt highlights use their own offsets');
  await page.click('button:has-text("Clear highlights")');

  // 8. selecting answer text shows no toolbar; clicking choices still selects them
  await page.evaluate(() => { const t = document.querySelector('[role=radiogroup] button span:last-child'); const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await page.waitForTimeout(150); assert.strictEqual(await page.$('[role=toolbar]'), null); ok('no highlight toolbar for answer choices');
  await page.click('[role=radio]:has-text("Third")'); assert.strictEqual(await page.textContent('#sel'), 'C'); assert.strictEqual(await page.getAttribute('[role=radio]:has-text("Third")', 'aria-checked'), 'true'); ok('answer choices stay clickable and selectable');
  await select('wrote about', 0, 'wrote about', 5); await page.waitForSelector('[role=toolbar]'); await page.click('[role=toolbar] button:has-text("Highlight")'); await page.click('[role=radio]:has-text("Fourth")');
  assert.strictEqual(await page.textContent('#sel'), 'D'); await page.click('button:has-text("Clear highlights")'); ok('choosing an answer works while highlights exist');

  // 9. keyboard: Alt+Shift+H highlights the selection, Alt+Shift+U removes it
  await select('wrote about', 0, 'wrote about', 11); await page.focus('[role=group]'); await page.keyboard.press('Alt+Shift+KeyH');
  assert.deepStrictEqual(await marks(), ['wrote about']);
  await select('wrote about', 0, 'wrote about', 11); await page.keyboard.press('Alt+Shift+KeyU'); assert.strictEqual((await marks()).length, 0); ok('keyboard shortcuts add and remove highlights');

  // 10. corrupt storage does not break the page
  await page.evaluate(() => localStorage.setItem('satlab:highlights:v1', '{oops')); await page.reload();
  assert.ok(await page.$('[role=radiogroup]')); ok('corrupt highlight storage is ignored');

  // 11. rendering: no raw markup shown, math rendered, no HTML injected from text
  const text = await page.textContent('[data-field="passage"]');
  assert.ok(!text.includes('<sup>') && !text.includes('_The') && !text.includes('\\$'), text); assert.ok(await page.$('[data-field="passage"] .katex-mathml')); assert.ok(await page.$('[role=radiogroup] .katex')); ok('markdown, <sup>, \\$ and LaTeX render without raw markup');
  assert.deepStrictEqual(errors, [], 'console/page errors: ' + errors.join(' | ')); ok('no console or page errors');
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });

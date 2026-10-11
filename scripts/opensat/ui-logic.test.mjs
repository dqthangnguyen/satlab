import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let rt, hi, fb, katex;
try { rt = await import('../../src/lib/richText.ts'); hi = await import('../../src/lib/highlights.ts'); fb = await import('../../src/lib/feedback.ts'); } catch { /* old Node */ }
try { katex = (await import('katex')).default; } catch { /* dependencies not installed */ }
const skip = rt ? false : 'needs Node 22.18+ (runs TypeScript directly)';
const fixtures = ['sample-math.json', 'sample-english.json'].flatMap((f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')));
const kinds = (s) => rt.parseRichText(s).map((x) => x.kind);

test('rich text: inline and display math, italics, superscripts, escaped dollars', { skip }, () => {
  assert.deepEqual(kinds('If $x+5 = 12$, what is x?'), ['text', 'math', 'text']);
  assert.equal(rt.parseRichText('If $x+5 = 12$, what').find((s) => s.kind === 'math').tex, 'x+5 = 12');
  assert.deepEqual(rt.parseRichText('see $$x^2$$ and \\[y\\] and \\(z\\)').filter((s) => s.kind === 'math').map((s) => s.display), [true, true, false]);
  assert.deepEqual(kinds('the _Color Purple_ novel'), ['text', 'em', 'text']);
  assert.deepEqual(kinds('x<sup>2</sup> is *big*'), ['text', 'sup', 'text', 'em']);
  assert.deepEqual(rt.parseRichText('costs \\$60 today').map((s) => s.kind), ['text', 'lit', 'text']);
  assert.equal(rt.parseRichText('costs \\$60').find((s) => s.kind === 'lit').text, '$');
});
test('rich text: currency, blanks, snake_case and spaced asterisks stay plain text', { skip }, () => {
  assert.deepEqual(kinds('apples at $1.20 per pound and oranges at $0.80 per pound'), ['text']);
  assert.deepEqual(kinds('Fill the ______ with a word and ____.'), ['text']);
  assert.deepEqual(kinds('use x_1 + y_2 here'), ['text']);
  assert.deepEqual(kinds('3 * 4 * 5'), ['text']);
  assert.deepEqual(kinds('<b>not parsed</b> <script>alert(1)</script>'), ['text']); // unknown HTML is just text
});
test('rich text: visible text always matches the source at its offset', { skip }, () => {
  const strings = fixtures.flatMap((r) => [r.question.question, r.question.paragraph, r.question.explanation, ...Object.values(r.question.choices)]).filter((x) => typeof x === 'string');
  for (const src of strings) for (const s of rt.parseRichText(src)) {
    if (s.kind === 'math' || s.kind === 'lit') assert.ok(s.end > s.start && src.slice(s.start, s.end).length === s.end - s.start);
    else assert.equal(src.slice(s.start, s.start + s.text.length), s.text, src);
  }
});
test('rich text: every formula in the sample questions renders with KaTeX', { skip: skip || (katex ? false : 'katex not installed (run npm install)') }, () => {
  let n = 0;
  for (const r of fixtures) for (const src of [r.question.question, r.question.explanation, ...Object.values(r.question.choices)]) for (const s of rt.parseRichText(src)) if (s.kind === 'math') {
    const html = katex.renderToString(s.tex, { displayMode: s.display, throwOnError: true, trust: false, strict: 'ignore', output: 'htmlAndMathml' });
    assert.ok(html.includes('katex')); n++;
  }
  assert.ok(n > 10);
});
test('highlights: splitting text around ranges', { skip }, () => {
  assert.deepEqual(rt.splitByRanges('hello world', 10, [[12, 15]]), [{ text: 'he', start: 10, hl: false }, { text: 'llo', start: 12, hl: true }, { text: ' world', start: 15, hl: false }]);
  assert.deepEqual(rt.splitByRanges('abc', 0, [[5, 9]]), [{ text: 'abc', start: 0, hl: false }]);
  assert.equal(rt.overlaps([[4, 8]], 7, 12), true); assert.equal(rt.overlaps([[4, 8]], 8, 12), false);
});
test('highlights: add, merge, remove and ignore invalid spans', { skip }, () => {
  assert.deepEqual(hi.addRange([[0, 3], [10, 12]], [2, 10]), [[0, 12]]);
  assert.deepEqual(hi.addRange([[0, 3]], [3, 5]), [[0, 5]]); // touching spans merge
  assert.deepEqual(hi.removeRange([[0, 12]], [4, 6]), [[0, 4], [6, 12]]);
  assert.deepEqual(hi.removeRange([[2, 5]], [0, 9]), []);
  assert.deepEqual(hi.normalize([[3, 3], [-1, 4], [5, 2], [1.5, 3]]), []);
});
test('highlights persist per question and version, and clearing removes them', { skip }, () => {
  const mem = new Map(); const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  mem.set('satlab:v2', '{"attempts":[1]}');
  const key = hi.highlightKey('RW0001', 1), h = hi.emptyHighlights(); h.passage = [[4, 9]]; h.prompt = [[0, 3], [8, 10]];
  hi.saveHighlights(storage, key, h);
  assert.deepEqual(hi.loadHighlights(storage, key), h); // survives a "reload"
  assert.ok(hi.isEmpty(hi.loadHighlights(storage, hi.highlightKey('RW0002', 1)))); // other question
  assert.ok(hi.isEmpty(hi.loadHighlights(storage, hi.highlightKey('RW0001', 2)))); // revised text
  const h2 = hi.emptyHighlights(); h2.prompt = [[1, 2]]; hi.saveHighlights(storage, hi.highlightKey('M0001', 1), h2);
  hi.saveHighlights(storage, key, hi.emptyHighlights()); // "Clear highlights"
  assert.ok(hi.isEmpty(hi.loadHighlights(storage, key))); assert.deepEqual(hi.loadHighlights(storage, hi.highlightKey('M0001', 1)).prompt, [[1, 2]]);
  assert.equal(mem.get('satlab:v2'), '{"attempts":[1]}'); // progress data is never touched
});
test('highlights: corrupt or hostile stored data is ignored safely', { skip }, () => {
  for (const bad of ['{not json', '[]', '"x"', 'null', '{"k@1":{"passage":"x","prompt":[[1],["a","b"],[2,4]]}}']) {
    const storage = { getItem: () => bad, setItem() {} };
    const h = hi.loadHighlights(storage, 'k@1');
    assert.ok(Array.isArray(h.passage) && Array.isArray(h.prompt));
  }
  assert.deepEqual(hi.loadHighlights({ getItem: () => '{"k@1":{"prompt":[[1],["a","b"],[2,4]]}}', setItem() {} }, 'k@1').prompt, [[2, 4]]);
  assert.doesNotThrow(() => hi.saveHighlights({ getItem: () => null, setItem() { throw new Error('quota'); } }, 'k', hi.emptyHighlights()));
});
test('feedback: thresholds decide the headline', { skip }, () => {
  const t = fb.FEEDBACK;
  assert.deepEqual([100, 90, 89, 75, 74, 50, 49, 0].map((a) => fb.toneFor(a)), ['excellent', 'excellent', 'good', 'good', 'mixed', 'mixed', 'low', 'low']);
  assert.deepEqual([95, 80, 60, 20].map((a) => fb.buildFeedback({ correct: a, total: 100, weakAreasReady: false, enoughData: true }).headline), [fb.HEADLINES.excellent, fb.HEADLINES.good, fb.HEADLINES.mixed, fb.HEADLINES.low]);
  const custom = { ...t, excellent: 95 }; assert.equal(fb.toneFor(92, custom), 'good'); // configurable
  for (const h of Object.values(fb.HEADLINES)) assert.ok(!/fail|bad|poor|stupid/i.test(h));
});
test('feedback: next step comes from the real result and nothing is overstated', { skip }, () => {
  const mk = (o) => fb.buildFeedback({ correct: 6, total: 10, weakAreasReady: false, enoughData: true, ...o });
  assert.equal(mk({}).primary.label, 'Review mistakes'); assert.equal(mk({}).secondary, undefined);
  const both = mk({ weakAreasReady: true }); assert.equal(both.primary.label, 'Review mistakes'); assert.equal(both.secondary.label, 'Practice weak areas');
  assert.equal(mk({ correct: 10, weakAreasReady: true }).primary.label, 'Practice weak areas');
  assert.equal(mk({ correct: 10 }).primary.label, 'Start practice');
  assert.ok(mk({ enoughData: false }).notes.some((n) => /not enough practice/i.test(n))); assert.equal(mk({}).notes.length, 0);
  assert.ok(mk({ correct: 2, total: 3 }).notes.some((n) => /very short set/i.test(n)));
  assert.equal(fb.buildFeedback({ correct: 0, total: 0, weakAreasReady: true, enoughData: true }).primary.label, 'Start practice');
  for (const f of [mk({}), both]) assert.ok(!/\b(sat score|predict|ready for)/i.test(JSON.stringify(f)));
});

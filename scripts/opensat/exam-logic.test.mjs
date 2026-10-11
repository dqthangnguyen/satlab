import test from 'node:test';
import assert from 'node:assert/strict';

let m, nav, ui;
try { m = await import('../../src/lib/metrics.ts'); nav = await import('../../src/lib/examNav.ts'); ui = await import('../../src/lib/sessionUi.ts'); } catch { /* old Node */ }
const skip = m ? false : 'needs Node 22.18+ (runs TypeScript directly)';
const at = (o) => ({ id: 'x', questionId: 'q', questionVersion: 1, response: 'A', isCorrect: true, at: 1000, source: 'practice', section: 'math', domain: 'algebra', skill: 's', difficulty: 'easy', ...o });

test('durations: only finite positive seconds under the cap count', { skip }, () => {
  for (const bad of [0, -5, NaN, Infinity, '12', null, undefined, 4 * 3600 + 1]) assert.equal(m.validDuration(bad), false, String(bad));
  for (const good of [1, 4, 59.5, 4 * 3600]) assert.equal(m.validDuration(good), true);
});
test('average time ignores invalid and missing durations and says how many it ignored', { skip }, () => {
  const t = m.timeStats([at({ timeSpentSec: 4 }), at({ timeSpentSec: 6 }), at({ timeSpentSec: 0 }), at({ timeSpentSec: -3 }), at({ timeSpentSec: NaN }), at({}), at({ timeSpentSec: 999999 })]);
  assert.deepEqual(t, { count: 2, ignored: 4, totalSec: 10, avgSec: 5 });
  assert.deepEqual(m.timeStats([]), { count: 0, ignored: 0, totalSec: 0, avgSec: null }); // no data: unavailable, not 0
  assert.equal(m.timeStats([at({})]).avgSec, null); // tests and old data have no time
});
test('timestamps: a missing or invalid "at" never breaks ordering', { skip }, () => {
  assert.equal(m.attemptTime({}), 0); assert.equal(m.attemptTime({ at: NaN }), 0); assert.equal(m.attemptTime({ at: 5 }), 5);
  const list = [at({ at: 30, isCorrect: true }), at({ at: undefined, isCorrect: false }), at({ at: 20, isCorrect: false }), at({ at: NaN, isCorrect: false })];
  assert.deepEqual(m.recentAccuracy(list, 2), { count: 2, correct: 1, pct: 50 }); // newest two: at=20 (wrong) and at=30 (right)
});
test('recent accuracy, unique questions and averages with no data', { skip }, () => {
  assert.deepEqual(m.recentAccuracy([]), { count: 0, correct: 0, pct: null });
  assert.equal(m.uniqueQuestions([at({ questionId: 'a' }), at({ questionId: 'a' }), at({ questionId: 'b' })]), 2);
  assert.equal(m.mean([]), null); assert.equal(m.mean([10, 25]), 18); // 17.5 rounds to 18
  assert.equal(m.recentAccuracy([at({ isCorrect: undefined }), at({ isCorrect: true })]).pct, 50); // missing answer data counts as not correct
});
test('navigation: bounds, first unanswered, and unanswered counts', { skip }, () => {
  assert.deepEqual([nav.canPrev(0), nav.canPrev(1), nav.canNext(2, 3), nav.canNext(1, 3)], [false, true, false, true]);
  assert.deepEqual([nav.clampIndex(-4, 5), nav.clampIndex(9, 5), nav.clampIndex(NaN, 5), nav.clampIndex(2, 0)], [0, 4, 0, 0]);
  assert.equal(nav.firstUnanswered(['a', 'b', 'c'], new Set(['a'])), 1); assert.equal(nav.firstUnanswered(['a', 'b'], new Set(['a', 'b'])), 0);
  const items = nav.navItems(['a', 'b', 'c'], (id) => id === 'a', { b: true });
  assert.deepEqual(items, [{ answered: true, flagged: false }, { answered: false, flagged: true }, { answered: false, flagged: false }]); assert.equal(nav.countUnanswered(items), 2);
});
test('session screen state: saved, restored, validated and pruned', { skip }, () => {
  const mem = new Map(); const s = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  mem.set('satlab:v2', '{"attempts":[1]}');
  assert.equal(ui.loadSessionUi(s, 'S1'), null);
  ui.saveSessionUi(s, 'S1', { cursor: 2, drafts: { q1: 'B' }, flags: { q2: true }, skipped: {} });
  assert.deepEqual(ui.loadSessionUi(s, 'S1'), { cursor: 2, drafts: { q1: 'B' }, flags: { q2: true }, skipped: {} });
  assert.equal(ui.loadSessionUi(s, 'S2'), null); assert.equal(mem.get('satlab:v2'), '{"attempts":[1]}');
  for (let i = 0; i < 40; i++) ui.saveSessionUi(s, 'n' + i, { cursor: 0, drafts: {}, flags: {}, skipped: {} }, 1000 + i);
  assert.equal(Object.keys(JSON.parse(mem.get(ui.SESSION_UI_KEY))).length, 30); assert.ok(ui.loadSessionUi(s, 'n39'));
  for (const bad of ['{oops', '[]', 'null', '{"S1":{"cursor":"x","drafts":{"a":1,"b":"C"},"flags":{"q":false,"r":true}}}']) {
    const r = ui.loadSessionUi({ getItem: () => bad, setItem() {} }, 'S1'); assert.ok(r === null || (r.cursor === 0 && r.drafts.a === undefined));
  }
  assert.deepEqual(ui.loadSessionUi({ getItem: () => '{"S1":{"drafts":{"a":1,"b":"C"},"flags":{"q":false,"r":true}}}', setItem() {} }, 'S1'), { cursor: 0, drafts: { b: 'C' }, flags: { r: true }, skipped: {} });
  assert.doesNotThrow(() => ui.saveSessionUi({ getItem: () => null, setItem() { throw new Error('quota'); } }, 'S', { cursor: 0, drafts: {}, flags: {}, skipped: {} }));
});

test('durations are shown in plain units', { skip }, () => {
  assert.deepEqual([4, 45, 59.4, 60, 125, 3600].map(m.fmtDuration), ['4s', '45s', '59s', '1:00', '2:05', '60:00']);
});

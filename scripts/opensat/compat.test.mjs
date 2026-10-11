import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

let idx = null, utils = null;
try { idx = await import('../../src/lib/questionIndex.ts'); utils = await import('../../src/lib/questionUtils.ts'); } catch { /* old Node */ }
const skip = idx ? false : 'needs Node 22.18+ (runs TypeScript directly)';
const dir = new URL('../../src/data/questions/', import.meta.url);
const all = readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
const original = ['M0001', 'M0002', 'M0003', 'M0004', 'M0005', 'M0006', 'RW0001', 'RW0002', 'RW0003', 'RW0004', 'RW0005', 'RW0006'];

test('the 12 original questions are intact and practice-ready', { skip }, () => {
  const { byId, published } = idx.buildIndex(all);
  for (const id of original) { assert.ok(byId.has(id), id); assert.ok(published.some((q) => q.id === id), id); }
  const m2 = byId.get('M0002'); assert.equal(m2.answer.choiceId, 'B'); assert.equal(m2.estimatedTimeSec, 75);
});
test('drafts, retired, unmapped, unknown-difficulty and flagged questions never enter practice', { skip }, () => {
  const base = all.find((q) => q.id === 'M0001');
  const variant = (id, patch) => ({ ...structuredClone(base), id, ...patch });
  const extra = [variant('d1', { status: 'draft' }), variant('r1', { status: 'retired' }), variant('u1', { skill: 'unmapped' }), variant('u2', { domain: 'unmapped' }),
    variant('k1', { difficulty: 'unknown' }), variant('f1', { reviewFlags: ['unverified-provenance'] }), variant('ok1', { reviewFlags: [] })];
  const warn = console.warn; console.warn = () => {};
  const { byId, published } = idx.buildIndex([...all, ...extra]);
  console.warn = warn;
  const ids = new Set(published.map((q) => q.id));
  for (const bad of ['d1', 'r1', 'u1', 'u2', 'k1', 'f1']) assert.ok(!ids.has(bad), `${bad} must not be practiced`);
  assert.ok(ids.has('ok1'));
  assert.ok(byId.has('r1') && byId.has('d1')); // history can still resolve them
  const hits = idx.queryIndex(published, { skill: 'linear-equations-one-variable' }).map((q) => q.id);
  assert.ok(!hits.includes('d1') && !hits.includes('r1') && hits.includes('M0001'));
  assert.equal(published.find((q) => q.id === 'M0003').skill, 'nonlinear-equations');
});
test('a Phase 3 attempt still resolves and answers still check', { skip }, () => {
  const { byId } = idx.buildIndex(all);
  const attempt = { id: '1-M0002-ab', questionId: 'M0002', questionVersion: 1, response: 'A', isCorrect: false, at: 1, source: 'practice', section: 'math', domain: 'algebra', skill: 'linear-functions', difficulty: 'medium', timeSpentSec: 42, confidence: 'unsure', errorType: 'careless' };
  const q = byId.get(attempt.questionId);
  assert.ok(q); assert.equal(utils.isCorrect(q, 'B'), true); assert.equal(utils.isCorrect(q, attempt.response), false);
  const fresh = utils.createAttempt(q, 'B', 'practice');
  assert.equal(fresh.isCorrect, true); assert.equal(fresh.skill, 'linear-functions'); assert.equal(fresh.questionVersion, 1);
});
test('imported questions on disk are never auto-published', () => {
  for (const f of ['data-import/opensat/staged-math.json', 'data-import/opensat/staged-english.json']) {
    const p = new URL(`../../${f}`, import.meta.url);
    if (existsSync(p)) for (const q of JSON.parse(readFileSync(p, 'utf8'))) assert.notEqual(q.status, 'published', q.id);
  }
  for (const q of all.filter((x) => x.source === 'third-party')) assert.ok(q.review && q.review.reviewedBy && !(q.reviewFlags || []).length && q.skill !== 'unmapped', q.id);
});

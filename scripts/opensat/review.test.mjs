import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convertRecord, flagStatus, promoteQuestions, publishBlockers } from './convert.mjs';
import { applyReview } from './review.mjs';

const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const eng = load('sample-english.json'), math = load('sample-math.json');
const tax = { domains: new Map([['standard-english-conventions', 'reading-writing'], ['algebra', 'math']]), skills: new Map([['boundaries', 'standard-english-conventions'], ['linear-equations-one-variable', 'algebra']]) };
const ctx = (section) => ({ section, importedAt: '2026-10-09T00:00:00.000Z', sourceUrl: 'test', rawFile: 'raw.json' });
const staged = (list, id, section) => convertRecord(structuredClone(list.find((r) => r.id === id)), ctx(section)).question;
const NOTE = 'Checked by hand, matches the key.';
const ackAll = (q) => Object.fromEntries(q.reviewFlags.filter((f) => ['unverified-provenance', 'unverified-answer-key', 'unverified-difficulty', 'contains-markup', 'source-id-reused'].includes(f)).map((f) => [f, NOTE]));
const good = { reviewer: 'Ray', domain: 'standard-english-conventions', skill: 'boundaries', difficulty: 'easy' };

test('a reviewer name is required for every action', () => {
  const q = staged(eng, 'random_id_e1', 'reading-writing');
  for (const type of ['save', 'approve', 'reject']) { assert.equal(applyReview(q, { type, reviewer: ' ', reason: 'bad' }, tax).ok, false); }
});
test('approval is blocked while the skill is unmapped or flags are open, and lists why', () => {
  const q = staged(eng, 'random_id_e1', 'reading-writing');
  const r = applyReview(q, { type: 'approve', reviewer: 'Ray' }, tax);
  assert.equal(r.ok, false); assert.ok(r.errors.includes('skill is unmapped')); assert.ok(r.errors.some((e) => e.startsWith('open flag')));
  const noNote = applyReview(q, { type: 'approve', ...good, acknowledged: { 'unverified-answer-key': 'ok' } }, tax); // note too short
  assert.equal(noNote.ok, false);
});
test('full review path: fix fields, confirm flags, approve, publish', () => {
  const q = staged(eng, 'random_id_e1', 'reading-writing');
  const approved = applyReview(q, { type: 'approve', ...good, acknowledged: ackAll(q) }, tax, '2026-10-10T00:00:00.000Z');
  assert.ok(approved.ok, approved.errors?.join());
  const s = approved.question;
  assert.equal(s.reviewState.status, 'approved'); assert.deepEqual(publishBlockers(s, tax), []);
  assert.deepEqual(s.answer, q.answer); assert.equal(s.prompt, q.prompt); assert.deepEqual(s.choices, q.choices); assert.equal(s.explanation.short, q.explanation.short);
  const r = promoteQuestions([s], [], [s.id], tax);
  assert.equal(r.promoted.length, 1);
  const p = r.promoted[0];
  assert.equal(p.status, 'published'); assert.deepEqual(p.reviewFlags, []); assert.equal('reviewState' in p, false);
  assert.equal(p.review.reviewedBy, 'Ray'); assert.equal(p.provenance.sourceId, 'random_id_e1'); assert.equal(p.provenance.sourceDifficulty, 'Easy');
  assert.deepEqual(p.reviewLog.map((l) => l.flag).sort(), [...q.reviewFlags].sort());
  assert.ok(p.reviewLog.find((l) => l.flag === 'unverified-answer-key').note === NOTE);
});
test('the answer key, stem and explanation cannot be changed through a review action', () => {
  const q = staged(eng, 'random_id_e1', 'reading-writing');
  const r = applyReview(q, { type: 'save', ...good, answer: { kind: 'choice', choiceId: 'C' }, prompt: 'changed', choices: [], explanation: { short: 'changed' } }, tax);
  assert.ok(r.ok); assert.deepEqual(r.question.answer, q.answer); assert.equal(r.question.prompt, q.prompt); assert.equal(r.question.choices.length, 4);
  assert.equal(r.question.reviewState.history.length, 1);
});
test('defective questions cannot be approved: hard flags cannot be waived', () => {
  const q = staged(math, 'random_id_c10', 'math'); // identical choices
  assert.ok(q.reviewFlags.includes('duplicate-choices'));
  const r = applyReview(q, { type: 'approve', reviewer: 'Ray', domain: 'algebra', skill: 'linear-equations-one-variable', difficulty: 'easy', acknowledged: { ...ackAll(q), 'duplicate-choices': NOTE } }, tax);
  assert.equal(r.ok, false); assert.ok(r.errors.includes('open flag: duplicate-choices'));
  assert.ok(flagStatus(q, tax).find((f) => f.flag === 'duplicate-choices').open);
});
test('editing after approval cancels it; rejected or unapproved questions are never published', () => {
  const q = staged(eng, 'random_id_e1', 'reading-writing');
  const approved = applyReview(q, { type: 'approve', ...good, acknowledged: ackAll(q) }, tax).question;
  const edited = applyReview(approved, { type: 'save', reviewer: 'Ray', difficulty: 'hard' }, tax).question;
  assert.equal(edited.reviewState.status, 'pending'); assert.ok(promoteQuestions([edited], [], [edited.id], tax).refused[0].blockers.includes('not approved in review'));
  assert.equal(applyReview(q, { type: 'reject', reviewer: 'Ray', reason: '' }, tax).ok, false);
  const rejected = applyReview(approved, { type: 'reject', reviewer: 'Ray', reason: 'Answer key is wrong' }, tax).question;
  assert.equal(promoteQuestions([rejected], [], [rejected.id], tax).promoted.length, 0);
  assert.equal(promoteQuestions([q], [], [q.id], tax).promoted.length, 0); // never reviewed
});
test('domain and skill must belong together; a short confirmation does not resolve a flag', () => {
  const q = staged(eng, 'random_id_e1', 'reading-writing');
  assert.equal(applyReview(q, { type: 'save', reviewer: 'Ray', domain: 'algebra' }, tax).ok, false); // math domain on an English question
  assert.equal(applyReview(q, { type: 'save', reviewer: 'Ray', domain: 'standard-english-conventions', skill: 'linear-equations-one-variable' }, tax).ok, false);
  const s = applyReview(q, { type: 'save', ...good, acknowledged: { 'unverified-provenance': 'ok' } }, tax).question;
  assert.ok(flagStatus(s, tax).find((f) => f.flag === 'unverified-provenance').open);
});
test('publishing never overwrites an existing question', () => {
  const q = staged(eng, 'random_id_e1', 'reading-writing');
  const s = applyReview(q, { type: 'approve', ...good, acknowledged: ackAll(q) }, tax).question;
  assert.equal(promoteQuestions([s], [], [s.id], tax, { bankIds: new Set([s.id]) }).skipped.length, 1);
  assert.equal(promoteQuestions([s], [{ id: s.id }], [s.id], tax).skipped.length, 1);
  assert.equal(promoteQuestions([s, s], [], [s.id, s.id], tax).promoted.length, 1); // same id twice in one run
});
test('only reviewed questions become practice-ready; drafts and flagged ones stay out', async (t) => {
  let idx; try { idx = await import('../../src/lib/questionIndex.ts'); } catch { return t.skip('needs Node 22.18+'); }
  const q = staged(eng, 'random_id_e1', 'reading-writing');
  const s = applyReview(q, { type: 'approve', ...good, acknowledged: ackAll(q) }, tax).question;
  const published = promoteQuestions([s], [], [s.id], tax).promoted[0];
  const warn = console.warn; console.warn = () => {};
  const { published: list } = idx.buildIndex([published, q, s, { ...q, id: 'x', status: 'published' }]);
  console.warn = warn;
  assert.deepEqual(list.map((x) => x.id), [published.id]); // the draft, the approved-but-unpublished copy and the flagged "published" one are all excluded
});

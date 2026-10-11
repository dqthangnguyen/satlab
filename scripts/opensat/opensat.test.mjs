import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convertRecord, convertAll, UNMAPPED } from './convert.mjs';

const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const math = load('sample-math.json'), eng = load('sample-english.json');
const pick = (list, id) => structuredClone(list.find((r) => r.id === id));
const ctx = { section: 'math', importedAt: '2026-10-09T00:00:00.000Z', sourceUrl: 'test', rawFile: 'test.json' };
const rw = { ...ctx, section: 'reading-writing' };

test('valid real record converts to a draft that keeps provenance', () => {
  const r = convertRecord(pick(math, 'f84da248'), ctx);
  assert.ok(r.ok);
  const q = r.question;
  assert.match(q.id, /^opensat-math-[0-9a-f]{12}$/);
  assert.equal(q.status, 'draft'); assert.equal(q.source, 'third-party');
  assert.equal(q.domain, 'algebra'); assert.equal(q.skill, UNMAPPED); assert.equal(q.difficulty, 'easy');
  assert.deepEqual(q.answer, { kind: 'choice', choiceId: 'B' });
  assert.equal(q.choices.length, 4); assert.equal('passage' in q, false); // "null" paragraph removed
  assert.equal('estimatedTimeSec' in q, false); // never invented
  assert.equal(q.provenance.sourceId, 'f84da248'); assert.equal(q.provenance.sourceDifficulty, 'Easy');
  assert.ok(q.provenance.licenseNote.includes('unverified')); assert.ok(q.reviewFlags.includes('unmapped-skill'));
});
test('ids are stable and the same text in a different choice order gets the same id', () => {
  const a = convertRecord(pick(math, 'f84da248'), ctx).question.id;
  assert.equal(convertRecord(pick(math, 'f84da248'), ctx).question.id, a);
  const shuffled = pick(math, 'f84da248'); const c = shuffled.question.choices;
  shuffled.question.choices = { A: c.D, B: c.C, C: c.B, D: c.A }; shuffled.question.correct_answer = 'C';
  assert.equal(convertRecord(shuffled, ctx).question.id, a);
});
test('invalid answer keys are rejected', () => {
  for (const bad of ['E', '', 'b ', undefined, 2]) {
    const rec = pick(math, 'f84da248'); rec.question.correct_answer = bad;
    const r = convertRecord(rec, ctx);
    if (bad === 'b ') assert.ok(r.ok); // trimmed and upper-cased, a real letter
    else assert.deepEqual(r.reasons, ['invalid-answer-key']);
  }
});
test('missing or incomplete choices are rejected', () => {
  const none = pick(math, 'f84da248'); delete none.question.choices;
  assert.deepEqual(convertRecord(none, ctx).reasons, ['missing-choices']);
  const three = pick(math, 'f84da248'); delete three.question.choices.D;
  assert.deepEqual(convertRecord(three, ctx).reasons, ['invalid-choice-keys']);
  const empty = pick(math, 'f84da248'); empty.question.choices.C = 'null';
  assert.deepEqual(convertRecord(empty, ctx).reasons, ['empty-choice-C']);
  const noText = pick(math, 'f84da248'); noText.question.question = '';
  assert.ok(convertRecord(noText, ctx).reasons.includes('missing-question-text'));
});
test('duplicates: same content once, same source id with different content both kept and flagged', () => {
  const a = pick(math, 'f84da248');
  const { questions, report } = convertAll([a, structuredClone(a)], ctx);
  assert.equal(questions.length, 1); assert.equal(report.duplicates.length, 1);
  const other = pick(math, 'f84da248'); other.question.question = 'If $x+6 = 12$, what is the value of $x$?';
  const both = convertAll([a, other], ctx);
  assert.equal(both.questions.length, 2); assert.notEqual(both.questions[0].id, both.questions[1].id);
  assert.ok(both.questions[1].reviewFlags.includes('source-id-reused')); assert.equal(both.report.sourceIdsReused.length, 1);
  const again = convertAll([a], ctx, new Set([both.questions[0].id]));
  assert.equal(again.questions.length, 0); assert.match(again.report.duplicates[0].reason, /already/);
});
test('unknown domain is staged as unmapped, wrong-section domain is rejected', () => {
  const odd = pick(math, 'f84da248'); odd.domain = 'Probability Theory';
  const r = convertAll([odd], ctx);
  assert.equal(r.questions[0].domain, UNMAPPED); assert.ok(r.questions[0].reviewFlags.includes('unmapped-domain'));
  assert.deepEqual(r.report.unmappedDomains, { 'Probability Theory': 1 });
  const wrong = pick(math, 'f84da248'); wrong.domain = 'Craft and Structure';
  assert.deepEqual(convertRecord(wrong, ctx).reasons, ['domain-section-mismatch']);
});
test('missing difficulty becomes unknown, never guessed', () => {
  const rec = pick(math, 'f84da248'); delete rec.difficulty;
  const q = convertRecord(rec, ctx).question;
  assert.equal(q.difficulty, 'unknown'); assert.ok(q.reviewFlags.includes('missing-difficulty'));
});
test('quality flags catch real defects seen in the API', () => {
  const dup = convertRecord(pick(math, 'random_id_c10'), ctx).question; assert.ok(dup.reviewFlags.includes('duplicate-choices'));
  const hedge = convertRecord(pick(math, '1915b42d'), ctx).question; assert.ok(hedge.reviewFlags.includes('explanation-hedges'));
  assert.ok(convertRecord(pick(math, 'f84da248'), ctx).question.reviewFlags.includes('contains-markup'));
  const fig = pick(math, 'f84da248'); fig.question.question = 'In the figure above, what is $x$?';
  assert.ok(convertRecord(fig, ctx).question.reviewFlags.includes('missing-figure'));
  const vis = pick(math, 'f84da248'); vis.visuals = { type: 'svg', svg_content: '<svg/>' };
  assert.ok(convertRecord(vis, ctx).question.reviewFlags.includes('has-visual-unsupported'));
  const mismatch = pick(eng, 'random_id_e1'); mismatch.question.explanation = 'Choice B is the best answer.';
  assert.ok(convertRecord(mismatch, rw).question.reviewFlags.includes('explanation-key-mismatch'));
  const fine = convertRecord(pick(eng, 'random_id_3'), rw).question; assert.ok(!fine.reviewFlags.includes('explanation-key-mismatch'));
  const noExp = pick(eng, 'random_id_e1'); delete noExp.question.explanation;
  assert.ok(convertRecord(noExp, rw).question.reviewFlags.includes('missing-explanation'));
});
test('records with "visuals" nested inside "question" are handled', () => {
  const rec = pick(math, 'f84da248'); rec.question.visuals = rec.visuals; delete rec.visuals;
  assert.ok(convertRecord(rec, ctx).ok);
  assert.equal(convertAll([rec], ctx).report.shape.visualsNestedInQuestion, 1);
});
test('report adds up and reports every source record', () => {
  const bad = pick(math, 'f84da248'); bad.question.correct_answer = 'Z';
  const { report } = convertAll([...math, bad, null], ctx);
  assert.equal(report.downloaded, math.length + 2);
  assert.equal(report.imported + report.duplicates.length + report.rejected.length, report.downloaded);
  assert.equal(report.rejected.length, 2);
});

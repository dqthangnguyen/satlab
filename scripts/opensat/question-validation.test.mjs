import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
const supportsNativeTypeScript = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 18);
const validation = supportsNativeTypeScript ? await import('../../src/lib/questionValidation.ts') : null;
const skip = supportsNativeTypeScript ? false : 'needs Node 22.18+ (runs TypeScript directly)';
const readQuestions = (name) => JSON.parse(readFileSync(new URL(`../../src/data/questions/${name}`, import.meta.url), 'utf8'));
const questions = [...readQuestions('math.json'), ...readQuestions('reading-writing.json')];

test('all 12 existing questions satisfy the question data contract', { skip }, () => {
  assert.equal(questions.length, 12);
  for (const question of questions) {
    const result = validation.validateQuestion(question);
    assert.deepEqual(result.errors, [], `${question.id}: ${validation.formatQuestionValidationErrors(result.errors)}`);
    assert.equal(result.valid, true, question.id);
  }
});

test('accepts student-produced questions, optional passages, and figures', { skip }, () => {
  const question = structuredClone(questions.find((item) => item.id === 'M0001'));
  question.status = 'draft';
  question.format = 'student_produced';
  question.answer = { kind: 'numeric', accepted: ['6', '6.0'] };
  delete question.choices;
  question.figure = { src: '/figures/example.svg', alt: 'A labeled line segment' };
  question.passage = '';

  assert.deepEqual(validation.validateQuestion(question).errors, []);
});

test('allows incomplete taxonomy and unknown difficulty only on drafts', { skip }, () => {
  const question = structuredClone(questions.find((item) => item.id === 'M0001'));
  question.status = 'draft';
  question.domain = 'unmapped';
  question.skill = 'unmapped';
  question.difficulty = 'unknown';
  assert.deepEqual(validation.validateQuestion(question).errors, []);

  question.status = 'published';
  const result = validation.validateQuestion(question);
  assert.ok(result.errors.some((error) => error.path === 'domain'));
  assert.ok(result.errors.some((error) => error.path === 'skill'));
  assert.ok(result.errors.some((error) => error.path === 'difficulty'));
});

test('reports malformed records with specific paths and readable messages', { skip }, () => {
  const question = structuredClone(questions.find((item) => item.id === 'M0001'));
  question.domain = 'craft-and-structure';
  question.skill = 'words-in-context';
  question.choices[1].id = 'A';
  question.answer.choiceId = 'D';
  question.explanation.short = ' ';

  const result = validation.validateQuestion(question);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path === 'domain' && /section/.test(error.message)));
  assert.ok(result.errors.some((error) => error.path === 'choices[1].id' && /duplicate/.test(error.message)));
  assert.ok(result.errors.some((error) => error.path === 'choices' && /exactly one/.test(error.message)));
  assert.ok(result.errors.some((error) => error.path === 'explanation.short'));
  assert.match(validation.formatQuestionValidationErrors(result.errors), /domain: does not belong to the selected section/);
});

test('requires source and generation provenance for non-original content', { skip }, () => {
  const question = structuredClone(questions.find((item) => item.id === 'M0001'));
  question.source = 'third-party';
  assert.ok(validation.validateQuestion(question).errors.some((error) => error.path === 'provenance'));

  question.source = 'ai-generated';
  question.provenance = {
    name: 'SATLab question generator',
    sourceId: 'generation-job-1',
    contentHash: 'sha256:example',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: 'SATLab generator',
    model: 'configured-model',
    promptVersion: '1',
    referenceIds: ['public-framework-reference'],
  };
  assert.deepEqual(validation.validateQuestion(question).errors, []);

  delete question.provenance.model;
  assert.ok(validation.validateQuestion(question).errors.some((error) => error.path === 'provenance.model'));
});

import type { Attempt, Question } from '../types';

const choiceText = (q: Question, id: string) => q.choices?.find((c) => c.id === id)?.text ?? id;

export function isCorrect(q: Question, response: string | null): boolean {
  if (response === null || !q.answer) return false;
  const a = q.answer;
  return a.kind === 'choice' ? response === a.choiceId : a.accepted.some((x) => x.trim() === response.trim());
}
/** Short key of the right answer: "B" for multiple choice, or the first accepted typed answer. */
export const correctKey = (q: Question): string => (!q.answer ? '' : q.answer.kind === 'choice' ? q.answer.choiceId : q.answer.accepted?.[0] ?? '');
/** Human-readable right answer, e.g. "x = 2 and x = 3". */
export const correctLabel = (q: Question): string => (q.answer?.kind === 'choice' ? choiceText(q, q.answer.choiceId) : correctKey(q));
/** Human-readable text of what the student answered. */
export const responseLabel = (q: Question, response: string | null): string =>
  response === null || response === '' ? 'None' : q.answer?.kind === 'choice' ? choiceText(q, response) : response;

/** Builds a complete Attempt record, copying section/domain/skill/difficulty from the question. */
export function createAttempt(q: Question, response: string | null, source: Attempt['source'], extra: Partial<Attempt> = {}): Attempt {
  const at = extra.at ?? Date.now();
  return {
    id: `${at}-${q.id}-${Math.random().toString(36).slice(2, 7)}`,
    questionId: q.id, questionVersion: q.version, response, isCorrect: isCorrect(q, response), at, source,
    section: q.section, domain: q.domain, skill: q.skill, difficulty: q.difficulty, ...extra,
  };
}

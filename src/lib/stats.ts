import { getQuestion } from './questionBank';
import { isCorrect } from './questionUtils';
import { difficultyLabel, domainLabel, sectionLabel, skillLabel } from '../data/taxonomy';
import { errorTypeLabel } from './labels';
import { timeStats } from './metrics';
export { timeStats } from './metrics';
import type { Attempt, Difficulty, TestResult } from '../types';

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function latest(attempts: Attempt[]) {
  const m = new Map<string, Attempt>();
  attempts.forEach((a) => m.set(a.questionId, a));
  return m;
}
export interface TopicStat { domain: string; topic: string; section: string; total: number; correct: number; acc: number }
/** Accuracy per domain. `topic` holds the domain's display name so the pages did not need to change. */
export function topicStats(attempts: Attempt[]): TopicStat[] {
  const m = new Map<string, TopicStat>();
  for (const a of attempts) {
    const t = m.get(a.domain) ?? { domain: a.domain, topic: domainLabel(a.domain), section: sectionLabel(a.section), total: 0, correct: 0, acc: 0 };
    t.total++;
    if (a.isCorrect) t.correct++;
    t.acc = pct(t.correct, t.total);
    m.set(a.domain, t);
  }
  return [...m.values()].sort((a, b) => a.acc - b.acc);
}
export function scoreResult(r: TestResult) {
  const ids = Object.keys(r.answers ?? {});
  const correct = ids.filter((id) => { const q = getQuestion(id); return !!q && isCorrect(q, r.answers[id]); }).length;
  return { correct, total: ids.length, pct: pct(correct, ids.length) };
}

export interface Breakdown { key: string; label: string; total: number; correct: number; acc: number }
export function groupBy(attempts: Attempt[], keyOf: (a: Attempt) => string, labelOf: (k: string) => string): Breakdown[] {
  const m = new Map<string, Breakdown>();
  for (const a of attempts) {
    const k = keyOf(a);
    const b = m.get(k) ?? { key: k, label: labelOf(k), total: 0, correct: 0, acc: 0 };
    b.total++;
    if (a.isCorrect) b.correct++;
    b.acc = pct(b.correct, b.total);
    m.set(k, b);
  }
  return [...m.values()].sort((x, y) => x.acc - y.acc); // weakest first
}
export const byDomain = (at: Attempt[]) => groupBy(at, (a) => a.domain, domainLabel);
export const bySkill = (at: Attempt[]) => groupBy(at, (a) => a.skill, skillLabel);
const diffOrder = ['easy', 'medium', 'hard', 'unknown'];
export const byDifficulty = (at: Attempt[]) =>
  groupBy(at, (a) => a.difficulty, (k) => difficultyLabel(k as Difficulty)).sort((x, y) => diffOrder.indexOf(x.key) - diffOrder.indexOf(y.key));

export interface ErrorCount { type: string; label: string; count: number }
export function errorCounts(attempts: Attempt[]): ErrorCount[] {
  const m = new Map<string, number>();
  for (const a of attempts) if (!a.isCorrect && a.errorType) m.set(a.errorType, (m.get(a.errorType) ?? 0) + 1);
  return [...m].map(([type, count]) => ({ type, label: errorTypeLabel(type), count })).sort((x, y) => y.count - x.count);
}
export function summarize(attempts: Attempt[]) {
  const correct = attempts.filter((a) => a.isCorrect).length;
  return { total: attempts.length, correct, acc: pct(correct, attempts.length), time: timeStats(attempts), domains: byDomain(attempts), errors: errorCounts(attempts) };
}

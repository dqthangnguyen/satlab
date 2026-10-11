import type { Attempt } from '../types';

// Pure helpers behind the dashboard numbers. All durations are SECONDS (the app stores Math.round(ms / 1000)).
export const MAX_SECONDS_PER_QUESTION = 4 * 60 * 60; // longer than this cannot be real answering time (a forgotten open tab)

/** A recorded duration is usable only if it is a finite number of seconds, above zero and below the sanity cap. */
export const validDuration = (s: unknown): s is number => typeof s === 'number' && Number.isFinite(s) && s > 0 && s <= MAX_SECONDS_PER_QUESTION;

/** Records without a usable `at` timestamp are treated as the oldest instead of breaking sorting. */
export const attemptTime = (a: { at?: number }): number => (typeof a.at === 'number' && Number.isFinite(a.at) ? a.at : 0);

/** Only attempts with a valid recorded time count. Tests record no per-question time, so they are not part of this. */
export function timeStats(attempts: Attempt[]) {
  const timed = attempts.filter((a) => validDuration(a.timeSpentSec));
  const totalSec = timed.reduce((s, a) => s + (a.timeSpentSec as number), 0);
  const ignored = attempts.filter((a) => a.timeSpentSec !== undefined && !validDuration(a.timeSpentSec)).length;
  return { count: timed.length, ignored, totalSec, avgSec: timed.length ? Math.round(totalSec / timed.length) : null };
}
export const uniqueQuestions = (attempts: Attempt[]) => new Set(attempts.map((a) => a.questionId)).size;

/** Accuracy over the most recent `n` answers (oldest first by timestamp). pct is null when there are no answers. */
export function recentAccuracy(attempts: Attempt[], n = 10) {
  const last = [...attempts].sort((a, b) => attemptTime(a) - attemptTime(b)).slice(-n);
  const correct = last.filter((a) => a.isCorrect === true).length;
  return { count: last.length, correct, pct: last.length ? Math.round((correct / last.length) * 100) : null };
}
export const mean = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** 45 -> "45s", 125 -> "2:05". Seconds only, so a short average is not shown as a confusing "0:04". */
export const fmtDuration = (s: number): string => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`);

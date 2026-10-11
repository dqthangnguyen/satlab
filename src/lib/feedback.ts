// Result feedback. Thresholds are percentages of correct answers; change them here.
export const FEEDBACK = { excellent: 90, good: 75, mixed: 50, smallSet: 5 };
export type Tone = 'excellent' | 'good' | 'mixed' | 'low';
export const HEADLINES: Record<Tone, string> = {
  excellent: 'Excellent work! You’re showing strong command of this set.',
  good: 'Great progress! Keep building on what you know.',
  mixed: 'You’re making progress. Let’s strengthen a few skills.',
  low: 'Every attempt helps you improve. Review your mistakes and try again.',
};
export const toneFor = (accuracy: number, t = FEEDBACK): Tone => (accuracy >= t.excellent ? 'excellent' : accuracy >= t.good ? 'good' : accuracy >= t.mixed ? 'mixed' : 'low');

export interface FeedbackInput { correct: number; total: number; weakAreasReady: boolean; enoughData: boolean }
export interface Action { label: string; to: string }
export interface Feedback { tone: Tone; headline: string; notes: string[]; primary: Action; secondary?: Action }

export function buildFeedback(i: FeedbackInput, t = FEEDBACK): Feedback {
  const review = { label: 'Review mistakes', to: '/mistakes' }, weak = { label: 'Practice weak areas', to: '/practice' }, more = { label: 'Start practice', to: '/practice' };
  if (i.total === 0) return { tone: 'mixed', headline: 'No answers to review yet.', notes: [], primary: more };
  const mistakes = i.total - i.correct;
  const tone = toneFor(Math.round((i.correct / i.total) * 100), t);
  const notes: string[] = [];
  if (i.total < t.smallSet) notes.push('This is a very short set, so treat it as a snapshot, not a measure of your level.');
  if (!i.enoughData) notes.push('There is not enough practice yet to pinpoint your weak skills. A few more sessions will help.');
  if (mistakes > 0) return { tone, headline: HEADLINES[tone], notes, primary: review, secondary: i.weakAreasReady ? weak : undefined };
  return { tone, headline: HEADLINES[tone], notes, primary: i.weakAreasReady ? weak : more };
}

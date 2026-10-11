import { topicStats } from './stats';
import type { Attempt } from '../types';

// Rule-based placeholder. Replace this function with a real AI call later.
export function coachReply(input: string, attempts: Attempt[]): string {
  const t = input.toLowerCase();
  if (/time|pace|speed|fast/.test(t))
    return 'On the digital SAT you have roughly 70 seconds per Reading and Writing question and about 95 seconds per Math question. If a question takes longer, flag it, make your best guess and return if time remains.';
  const ts = topicStats(attempts);
  if (!ts.length)
    return 'I do not have any results yet. Answer a few practice questions or take a mini test, and I will point out where to focus.';
  const weak = ts.slice(0, 3);
  const list = weak.map((w) => `${w.topic} (${w.acc}% over ${w.total} attempts)`).join(', ');
  if (/plan|schedule|week/.test(t))
    return `Here is a short plan. First, spend 15 minutes on ${weak[0].topic} without a timer and read every explanation. Second, redo the questions in your Mistakes notebook. Third, finish with one timed mini test. Your focus areas: ${list}.`;
  if (/weak|improve|focus|worst|area/.test(t))
    return `Your lowest-accuracy topics are ${list}. Start with ${weak[0].topic}, and work through each explanation before moving on.`;
  return 'I can summarize your weak areas, build a short study plan, or give pacing advice. Try one of the suggestions below.';
}

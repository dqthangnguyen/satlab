import { getAllQuestions, getQuestion } from './questionBank';
import { byDifficulty, byDomain, errorCounts, groupBy, pct } from './stats';
import type { Breakdown, ErrorCount } from './stats';
import { confidenceLabel } from './labels';
import { attemptTime, validDuration } from './metrics';
import { sectionLabel, skillLabel } from '../data/taxonomy';
import type { Attempt, SectionId } from '../types';

/**
 * Every threshold used by the analysis lives here, so the rules are explicit and easy to change.
 * An "attempt" is one saved answer. Repeating a question counts again.
 */
export const RULES = {
  minAttempts: 3, // fewer attempts than this: the skill is "insufficient" and is never called weak
  weakBelow: 60, // accuracy % under which a skill with enough data is "weak"
  strongFrom: 80, // accuracy % from which a skill is "strong" (between the two: "developing")
  recentWindow: 7, // "your last N attempts" statements
  trendWindow: 3, // trend compares the last 3 attempts with everything before; needs at least 3 + 3 attempts
  trendDelta: 20, // accuracy points of difference that count as improving or declining
  minTimed: 3, // timed attempts needed before judging pace
  slowAbove: 1.5, // time spent / estimated time at or above this is "slow"
  fastBelow: 0.6, // at or below this is "fast"
  minConfidence: 3, // confidence-tagged attempts needed before commenting on confidence
  oftenShare: 0.5, // share of Guess/Unsure answers that counts as "often"
  minRepeatedError: 2, // the same error type must be recorded this many times to be called a pattern
  staleDays: 7, // not practiced for longer than this is "not practiced recently"
};

export type SkillStatus = 'insufficient' | 'weak' | 'developing' | 'strong';
export type Pace = 'slow' | 'on-pace' | 'fast' | null;
export interface SkillProfile {
  skill: string; label: string; domain: string; section: SectionId;
  attempts: number; correct: number; accuracy: number;
  timedAttempts: number; avgTimeSec: number | null; paceRatio: number | null; pace: Pace;
  topError: ErrorCount | null;
  confidence: { guess: number; unsure: number; sure: number; tagged: number };
  recentCount: number; recentWrong: number;
  trend: { direction: 'improving' | 'declining' | 'steady'; recent: number; earlier: number } | null;
  lastAt: number; // 0 when never practiced
  status: SkillStatus;
}
export interface ErrorPattern extends ErrorCount { topSkill: string | null }
export interface LearnerProfile {
  totalAttempts: number;
  skills: SkillProfile[];
  weakSkills: SkillProfile[]; // status "weak", lowest accuracy first
  insufficient: SkillProfile[]; // fewer than minAttempts, including skills never practiced
  bySection: Breakdown[]; byDomain: Breakdown[]; byDifficulty: Breakdown[]; byConfidence: Breakdown[];
  errors: ErrorCount[]; errorPatterns: ErrorPattern[];
  pacing: { timedAttempts: number; avgTimeSec: number | null; paceRatio: number | null; pace: Pace };
}

/** Time spent compared with each question's estimatedTimeSec. Attempts without a recorded time (tests, older data) are ignored. */
function pacing(list: Attempt[]) {
  const timed = list.filter((a) => validDuration(a.timeSpentSec));
  const total = timed.reduce((s, a) => s + (a.timeSpentSec ?? 0), 0);
  let sec = 0, est = 0, n = 0;
  for (const a of timed) {
    const e = getQuestion(a.questionId)?.estimatedTimeSec;
    if (e && e > 0) { sec += a.timeSpentSec ?? 0; est += e; n++; }
  }
  const paceRatio = n >= RULES.minTimed ? sec / est : null;
  const pace: Pace = paceRatio === null ? null : paceRatio >= RULES.slowAbove ? 'slow' : paceRatio <= RULES.fastBelow ? 'fast' : 'on-pace';
  return { timedAttempts: timed.length, avgTimeSec: timed.length ? Math.round(total / timed.length) : null, paceRatio, pace };
}

function profileSkill(skill: string, raw: Attempt[]): SkillProfile {
  const list = [...raw].sort((a, b) => attemptTime(a) - attemptTime(b));
  const n = list.length;
  const correct = list.filter((a) => a.isCorrect).length;
  const accuracy = pct(correct, n);
  const bank = n ? undefined : getAllQuestions().find((q) => q.skill === skill);
  const confidence = { guess: 0, unsure: 0, sure: 0, tagged: 0 };
  for (const a of list) if (a.confidence) { confidence[a.confidence]++; confidence.tagged++; }
  const recent = list.slice(-RULES.recentWindow);
  let trend: SkillProfile['trend'] = null;
  if (n >= RULES.trendWindow * 2) {
    const r = list.slice(-RULES.trendWindow), e = list.slice(0, -RULES.trendWindow);
    const ra = pct(r.filter((a) => a.isCorrect).length, r.length), ea = pct(e.filter((a) => a.isCorrect).length, e.length);
    const d = ra - ea;
    trend = { direction: d >= RULES.trendDelta ? 'improving' : d <= -RULES.trendDelta ? 'declining' : 'steady', recent: ra, earlier: ea };
  }
  const status: SkillStatus = n < RULES.minAttempts ? 'insufficient' : accuracy < RULES.weakBelow ? 'weak' : accuracy < RULES.strongFrom ? 'developing' : 'strong';
  return {
    skill, label: skillLabel(skill), domain: list[0]?.domain ?? bank?.domain ?? '', section: (list[0]?.section ?? bank?.section) as SectionId,
    attempts: n, correct, accuracy, ...pacing(list), topError: errorCounts(list)[0] ?? null, confidence,
    recentCount: recent.length, recentWrong: recent.filter((a) => !a.isCorrect).length, trend,
    lastAt: n ? attemptTime(list[n - 1]) : 0, status,
  };
}

export function buildProfile(attempts: Attempt[]): LearnerProfile {
  const valid = attempts.filter((a) => a.skill); // ignore malformed or very old records
  const m = new Map<string, Attempt[]>();
  for (const a of valid) { const l = m.get(a.skill); if (l) l.push(a); else m.set(a.skill, [a]); }
  for (const q of getAllQuestions()) if (!m.has(q.skill)) m.set(q.skill, []); // skills never practiced
  const skills = [...m].map(([s, l]) => profileSkill(s, l));
  const confOrder = ['guess', 'unsure', 'sure'];
  return {
    totalAttempts: valid.length,
    skills,
    weakSkills: skills.filter((s) => s.status === 'weak').sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts),
    insufficient: skills.filter((s) => s.status === 'insufficient').sort((a, b) => a.attempts - b.attempts),
    bySection: groupBy(valid, (a) => a.section, sectionLabel),
    byDomain: byDomain(valid), byDifficulty: byDifficulty(valid),
    byConfidence: groupBy(valid.filter((a) => a.confidence), (a) => a.confidence as string, confidenceLabel).sort((x, y) => confOrder.indexOf(x.key) - confOrder.indexOf(y.key)),
    errors: errorCounts(valid),
    errorPatterns: errorCounts(valid).map((e) => {
      const per = new Map<string, number>();
      for (const a of valid) if (!a.isCorrect && a.errorType === e.type) per.set(a.skill, (per.get(a.skill) ?? 0) + 1);
      const top = [...per].sort((x, y) => y[1] - x[1])[0];
      return { ...e, topSkill: top ? skillLabel(top[0]) : null };
    }),
    pacing: pacing(valid),
  };
}

/** Plain-language reasons for one skill. Every sentence is computed from saved attempts; nothing is guessed. */
export function explainSkill(p: SkillProfile, now = Date.now()): string[] {
  const out: string[] = [];
  const wrong = p.attempts - p.correct;
  out.push(p.attempts <= RULES.recentWindow
    ? `You answered ${wrong} of your ${p.attempts} ${p.label} attempts incorrectly (${p.accuracy}% correct, below the ${RULES.weakBelow}% threshold).`
    : `You answered ${p.recentWrong} of your last ${p.recentCount} ${p.label} attempts incorrectly. Overall accuracy is ${p.accuracy}% over ${p.attempts} attempts.`);
  if (p.trend?.direction === 'declining') out.push(`Your last ${RULES.trendWindow} attempts were ${p.trend.recent}% correct, compared with ${p.trend.earlier}% before that.`);
  if (p.trend?.direction === 'improving') out.push(`Your last ${RULES.trendWindow} attempts are improving (${p.trend.recent}% vs ${p.trend.earlier}% before), but the skill is still below ${RULES.weakBelow}% overall.`);
  if (p.topError && p.topError.count >= RULES.minRepeatedError) out.push(`Your most common reason for missing this skill: "${p.topError.label}" (${p.topError.count} times).`);
  const low = p.confidence.guess + p.confidence.unsure;
  if (p.confidence.tagged >= RULES.minConfidence && low / p.confidence.tagged >= RULES.oftenShare) out.push(`You marked Guess or Unsure on ${low} of ${p.confidence.tagged} answers in this skill.`);
  if (p.pace === 'slow' && p.paceRatio !== null) out.push(`You took about ${p.paceRatio.toFixed(1)}x the expected time per question in this skill.`);
  const days = Math.floor((now - p.lastAt) / 86400000);
  if (p.lastAt && days > RULES.staleDays) out.push(`You have not practiced this skill in ${days} days.`);
  return out;
}

export const STATUS_LABEL: Record<SkillStatus, string> = { weak: 'Needs attention', developing: 'Developing', strong: 'Strong', insufficient: 'Not enough data' };
export const STATUS_TONE = { weak: 'red', developing: 'amber', strong: 'green', insufficient: 'slate' } as const;
/** One short line for lists. The full reasoning stays in explainSkill. */
export function shortReason(p: SkillProfile): string {
  const parts = [`${p.correct} of ${p.attempts} correct`];
  if (p.topError && p.topError.count >= RULES.minRepeatedError) parts.push(`often "${p.topError.label}"`);
  if (p.trend?.direction === 'declining') parts.push('recent results are dropping');
  return parts.join(', ');
}

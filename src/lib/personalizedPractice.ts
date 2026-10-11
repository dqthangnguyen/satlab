import { queryQuestions } from './questionBank';
import { latest } from './stats';
import { RULES, explainSkill } from './learnerProfile';
import type { LearnerProfile } from './learnerProfile';
import { sectionLabel } from '../data/taxonomy';
import type { Attempt, SectionId, SessionPlan } from '../types';

export const WEAK_COUNT_OPTIONS = [5, 10, 15];
export const MIN_SESSION_SIZE = 1; // a smaller pool than requested is allowed, but never padded with duplicates or ineligible questions

export type PersonalizedPlan = { ok: true; questionIds: string[]; plan: SessionPlan; available: number; requested: number } | { ok: false; reason: string };

/**
 * Picks questions from weak skills only (see RULES). Order of preference:
 * 1) never attempted, 2) latest attempt was wrong, 3) latest attempt was correct (only to fill the session).
 * Within a tier the weakest skill comes first. Only published questions that match the section filter are used.
 * This only reads data. It never records an attempt.
 */
export function planWeakAreas(profile: LearnerProfile, attempts: Attempt[], count: number, section?: SectionId, now = Date.now(), onlySkill?: string): PersonalizedPlan {
  const scope = section ? ` in ${sectionLabel(section)}` : '';
  if (profile.totalAttempts === 0)
    return { ok: false, reason: 'You have no practice history yet. Finish a Practice session first, so SATLab has answers to look for patterns in.' };
  const inScope = profile.skills.filter((s) => !section || s.section === section);
  if (!inScope.some((s) => s.status !== 'insufficient'))
    return { ok: false, reason: `No skill${scope} has at least ${RULES.minAttempts} answers yet, so SATLab cannot judge weak areas reliably. Keep practicing, then try again.` };
  const focus = profile.weakSkills.filter((s) => (!section || s.section === section) && (!onlySkill || s.skill === onlySkill));
  if (!focus.length)
    return { ok: false, reason: `None of your skills${scope} with enough data is below ${RULES.weakBelow}% accuracy, so there is no weak area to target right now.` };

  const last = latest(attempts);
  const cands: { id: string; skill: string; rank: number; tier: number; r: number }[] = [];
  focus.forEach((s, rank) => {
    for (const q of queryQuestions({ skill: s.skill, section })) {
      const a = last.get(q.id);
      cands.push({ id: q.id, skill: s.skill, rank, tier: !a ? 0 : a.isCorrect ? 2 : 1, r: Math.random() });
    }
  });
  cands.sort((x, y) => x.tier - y.tier || x.rank - y.rank || x.r - y.r);
  const picked = cands.slice(0, count);
  if (picked.length < MIN_SESSION_SIZE)
    return { ok: false, reason: `Your weak skills (${focus.map((s) => s.label).join(', ')}) have no published questions to practice yet. The question bank needs more questions for these skills.` };

  const items = focus.map((s) => {
    const mine = picked.filter((c) => c.skill === s.skill);
    if (!mine.length) return null;
    const t = [0, 1, 2].map((tier) => mine.filter((c) => c.tier === tier).length);
    const parts = [t[0] && `${t[0]} not attempted yet`, t[1] && `${t[1]} you missed last time`, t[2] && `${t[2]} you answered correctly before`].filter(Boolean);
    return { skill: s.skill, reasons: [...explainSkill(s, now), `Selected ${mine.length} question${mine.length === 1 ? '' : 's'}: ${parts.join(', ')}.`] };
  }).filter((x): x is { skill: string; reasons: string[] } => x !== null);

  const notes: string[] = [];
  if (picked.length < count) notes.push(`You asked for ${count} questions, but only ${picked.length} matching published questions are available.`);
  if (picked.some((c) => c.tier === 2)) notes.push('Some questions you answered correctly before were added, because there were not enough new or missed questions in these skills.');
  return { ok: true, questionIds: picked.map((c) => c.id), plan: { kind: 'weak-areas', items, notes }, available: cands.length, requested: count };
}

import { queryQuestions } from './questionBank';
import { difficultyLabel, domainLabel, sectionLabel, skillLabel } from '../data/taxonomy';
import type { PracticeFilters, PracticeSession } from '../types';

export const COUNT_OPTIONS = [5, 10, 15, 20];

/** Random sample of matching questions. queryQuestions only returns status "published", so retired and draft questions never enter a queue. */
export function buildQueue(filters: PracticeFilters, count: number): string[] {
  const ids = queryQuestions(filters).map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
}
export function describeFilters(f: PracticeFilters): string {
  const parts = [f.section && sectionLabel(f.section), f.domain && domainLabel(f.domain), f.skill && skillLabel(f.skill), f.difficulty && difficultyLabel(f.difficulty)].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'All questions';
}

export function describeSession(s: PracticeSession): string {
  return s.plan ? `Weak areas${s.filters.section ? ` · ${sectionLabel(s.filters.section)}` : ''}` : describeFilters(s.filters);
}

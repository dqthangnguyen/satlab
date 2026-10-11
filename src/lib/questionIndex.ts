import type { Difficulty, Question, SectionId } from '../types';

// Pure logic, no Vite-only APIs, so it can be tested directly in Node.
export const UNMAPPED = 'unmapped';

export interface QuestionFilter {
  section?: SectionId; domain?: string; skill?: string; difficulty?: Difficulty; tag?: string;
  ids?: string[]; excludeIds?: string[]; limit?: number;
}

/** Why a question may not be shown to students, or null when it is practice-ready. */
export function practiceBlocker(q: Question): string | null {
  if (q.status !== 'published') return `status is ${q.status}`;
  if (q.domain === UNMAPPED || q.skill === UNMAPPED) return 'domain or skill is unmapped';
  if (q.difficulty === 'unknown') return 'difficulty is unknown';
  if (q.reviewFlags && q.reviewFlags.length > 0) return 'it has open review flags';
  return null;
}

export function buildIndex(all: Question[]) {
  const byId = new Map<string, Question>(); // every question, so old attempts can still find retired ones
  const published: Question[] = []; // only what students may practice
  for (const q of all) {
    if (byId.has(q.id)) { console.warn(`Duplicate question id ignored: ${q.id}`); continue; }
    byId.set(q.id, q);
    const why = practiceBlocker(q);
    if (!why) published.push(q);
    else if (q.status === 'published') console.warn(`Question ${q.id} is marked published but kept out of practice: ${why}`);
  }
  return { byId, published };
}

export function queryIndex(published: Question[], f: QuestionFilter = {}): Question[] {
  const list = published.filter((q) =>
    (!f.section || q.section === f.section) && (!f.domain || q.domain === f.domain) && (!f.skill || q.skill === f.skill) &&
    (!f.difficulty || q.difficulty === f.difficulty) && (!f.tag || q.tags.includes(f.tag)) &&
    (!f.ids || f.ids.includes(q.id)) && !f.excludeIds?.includes(q.id));
  return f.limit ? list.slice(0, f.limit) : list;
}

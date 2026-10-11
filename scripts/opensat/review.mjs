// Review decisions on staged questions. Pure functions, no file access.
import { ACK_FLAGS, UNMAPPED, contentBlockers } from './convert.mjs';

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const fail = (...errors) => ({ ok: false, errors });

/**
 * action: { type: 'save' | 'approve' | 'reject', reviewer, domain?, skill?, difficulty?, acknowledged?: {flag: note}, reason? }
 * Only domain, skill, difficulty and written confirmations can change. The stem, passage, choices, answer key and explanation never do.
 * The source's own values stay in `provenance` (sourceDomain, sourceDifficulty), and every action is logged in reviewState.history.
 */
export function applyReview(q, action, tax, now = new Date().toISOString()) {
  const reviewer = String(action.reviewer ?? '').trim();
  if (reviewer.length < 2) return fail('Enter your reviewer name first.');
  if (q.reviewState?.status === 'published') return fail('This question is already published.');
  const next = structuredClone(q);
  const st = (next.reviewState = next.reviewState ?? { status: 'pending', acknowledged: {}, history: [] });
  if (action.type === 'reject') {
    const reason = String(action.reason ?? '').trim();
    if (reason.length < 3) return fail('Say why you are rejecting this question.');
    st.status = 'rejected'; st.rejectReason = reason;
  } else {
    if (action.domain !== undefined) {
      if (action.domain !== UNMAPPED && tax.domains.get(action.domain) !== next.section) return fail('That domain does not belong to this section.');
      next.domain = action.domain;
      if (next.skill !== UNMAPPED && tax.skills.get(next.skill) !== next.domain) next.skill = UNMAPPED; // skill must match the domain
    }
    if (action.skill !== undefined) {
      if (action.skill !== UNMAPPED && tax.skills.get(action.skill) !== next.domain) return fail('That skill does not belong to the domain.');
      next.skill = action.skill;
    }
    if (action.difficulty !== undefined) {
      if (action.difficulty !== 'unknown' && !DIFFICULTIES.includes(action.difficulty)) return fail('Difficulty must be easy, medium or hard.');
      next.difficulty = action.difficulty;
    }
    for (const [flag, note] of Object.entries(action.acknowledged ?? {})) if (flag in ACK_FLAGS) st.acknowledged[flag] = String(note).trim().slice(0, 500);
    if (action.type === 'approve') {
      const blockers = contentBlockers(next, tax);
      if (blockers.length) return fail(...blockers);
      st.status = 'approved';
    } else if (action.type === 'save') st.status = 'pending'; // any edit cancels an earlier approval
    else return fail(`Unknown action "${action.type}".`);
    delete st.rejectReason;
  }
  st.reviewer = reviewer; st.at = now;
  st.history = [...(st.history ?? []), { at: now, reviewer, action: action.type }];
  return { ok: true, question: next };
}

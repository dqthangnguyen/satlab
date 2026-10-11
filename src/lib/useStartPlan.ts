import { useNavigate } from 'react-router-dom';
import { useStore } from './store';
import type { PersonalizedPlan } from './personalizedPractice';
import type { PracticeSession, SectionId } from '../types';

/** Turns a successful personalized plan into a stored practice session and opens it. */
export function useStartPlan() {
  const { startSession } = useStore();
  const nav = useNavigate();
  return (plan: Extract<PersonalizedPlan, { ok: true }>, section?: SectionId) => {
    const s: PracticeSession = { id: `s${Date.now()}`, createdAt: Date.now(), filters: { section }, questionIds: plan.questionIds, plan: plan.plan };
    startSession(s);
    nav(`/practice/session/${s.id}`);
  };
}

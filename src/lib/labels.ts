import type { Attempt, ErrorType } from '../types';

export const errorOptions: { value: ErrorType; label: string }[] = [
  { value: 'concept-gap', label: "I didn't know the concept" },
  { value: 'misread', label: 'I misunderstood the question' },
  { value: 'careless', label: 'Calculation / careless mistake' },
  { value: 'guess', label: 'I guessed' },
  { value: 'time-pressure', label: 'I ran out of time' },
];
const otherErrors: Record<string, string> = { vocabulary: 'Vocabulary', 'trap-choice': 'Fell for a trap choice' };
export const errorTypeLabel = (t: string) => errorOptions.find((o) => o.value === t)?.label ?? otherErrors[t] ?? t;

export const confidenceOptions: { value: NonNullable<Attempt['confidence']>; label: string }[] = [
  { value: 'guess', label: 'Guess' }, { value: 'unsure', label: 'Unsure' }, { value: 'sure', label: 'Sure' },
];
export const confidenceLabel = (c: string) => confidenceOptions.find((o) => o.value === c)?.label ?? c;

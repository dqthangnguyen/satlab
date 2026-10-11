import type { Question } from '../types';
import { buildIndex, queryIndex } from './questionIndex';
import type { QuestionFilter } from './questionIndex';
export type { QuestionFilter } from './questionIndex';

// The only place that knows where question data lives. Every file in data/questions/*.json is loaded automatically.
const files = import.meta.glob<Question[]>('../data/questions/*.json', { eager: true, import: 'default' });
const { byId, published } = buildIndex(Object.values(files).flat());

export const getQuestion = (id: string): Question | undefined => byId.get(id);
export const getAllQuestions = (): Question[] => published;
export const queryQuestions = (f: QuestionFilter = {}): Question[] => queryIndex(published, f);

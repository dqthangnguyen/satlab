export type SectionId = 'math' | 'reading-writing';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'unknown'; // 'unknown' is only allowed on unpublished questions
export type ErrorType = 'concept-gap' | 'careless' | 'misread' | 'vocabulary' | 'time-pressure' | 'guess' | 'trap-choice';
export type ChoiceId = 'A' | 'B' | 'C' | 'D';

export interface Choice {
  id: ChoiceId;
  text: string;
  errorTag?: string; // typical mistake this wrong choice represents (free-form, kebab-case)
}

export type Answer =
  | { kind: 'choice'; choiceId: ChoiceId }
  | { kind: 'numeric'; accepted: string[] }; // student-produced responses, e.g. ["6", "6.0", "12/2"]

export interface Question {
  id: string; // stable forever, never reused
  status: 'draft' | 'reviewed' | 'published' | 'retired';
  version: number; // bump when wording or answer changes
  source: 'original' | 'ai-generated' | 'licensed' | 'third-party';
  section: SectionId;
  domain: string; // id from data/taxonomy.ts
  skill: string; // id from data/taxonomy.ts
  topic?: string; // finer, optional, our own label
  difficulty: Difficulty;
  format: 'multiple_choice' | 'student_produced';
  passage?: string;
  prompt: string;
  figure?: { src: string; alt: string };
  choices?: Choice[]; // present when format is multiple_choice
  answer: Answer;
  explanation: { short: string; steps?: string[] };
  estimatedTimeSec?: number; // absent when the source does not provide one
  tags: string[];
  provenance?: Provenance; // set for imported questions
  reviewFlags?: string[]; // open problems found at import. A question with flags is never practiced
  review?: { reviewedBy: string; reviewedAt: string };
  reviewLog?: { flag: string; kind: string; note: string }[]; // how each import flag was resolved
}

export interface Provenance {
  name: string; sourceId: string; sourceDomain?: string; sourceDifficulty?: string; sourceUrl: string;
  importedAt: string; license: string; licenseNote: string; rawFile?: string; contentHash: string;
}

export interface Attempt {
  id: string;
  questionId: string;
  questionVersion: number;
  response: string | null; // choice id ("B") or typed answer; null = unanswered
  isCorrect: boolean;
  timeSpentSec?: number; // active seconds; recorded by Practice, absent for tests
  at: number;
  source: 'practice' | 'test' | 'review' | 'personalized';
  testResultId?: string;
  sessionId?: string; // set when the attempt belongs to a Practice session
  // Copied from the question when the attempt is made, so stats stay correct if the question is edited later.
  section: SectionId;
  domain: string;
  skill: string;
  difficulty: Difficulty;
  confidence?: 'guess' | 'unsure' | 'sure'; // optional, chosen by the student after answering
  errorType?: ErrorType; // optional, chosen by the student after answering
}

export interface TestDef { id: string; title: string; description: string; minutes: number; questionIds: string[] }
export interface TestResult { id: string; testId: string; title: string; at: number; durationSec: number; answers: Record<string, string | null> }

export interface PracticeFilters { section?: SectionId; domain?: string; skill?: string; difficulty?: Difficulty }
/** Why a personalized session was built. A snapshot of the reasons at creation time, so they stay true as new attempts arrive. */
export interface PlanItem { skill: string; reasons: string[] }
export interface SessionPlan { kind: 'weak-areas'; items: PlanItem[]; notes: string[] }
export interface PracticeSession { id: string; createdAt: number; filters: PracticeFilters; questionIds: string[]; plan?: SessionPlan }

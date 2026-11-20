import { supabase } from './supabase';

export type PracticeSection = 'reading_writing' | 'math';
export type PracticeDifficulty = 'easy' | 'medium' | 'hard';

export interface PracticeDomain {
  id: number;
  section: PracticeSection;
  name: string;
  sortOrder: number;
}

export interface PracticeSkill {
  id: number;
  domainId: number;
  name: string;
  sortOrder: number;
}

export interface RecentPracticeSession {
  id: string;
  status: 'in_progress' | 'completed';
  startedAt: string;
  summary: CompletionSummary | null;
}

export interface PracticeFilters {
  section: PracticeSection | null;
  domainId: number | null;
  skillId: number | null;
  difficulty: PracticeDifficulty | null;
}

export interface PracticeQuestion {
  id: string;
  questionId: string;
  versionNumber: number;
  skillId: number;
  difficulty: PracticeDifficulty;
  passage: string | null;
  stem: string;
}

export interface PracticeChoice {
  id: string;
  questionVersionId: string;
  displayOrder: number;
  content: string;
}

export interface PracticeAttempt {
  id: string;
  sessionQuestionId: string;
  selectedChoiceId: string;
  attemptNumber: number;
  isCorrect: boolean;
  submittedAt: string;
}

export interface PracticeItem {
  id: string;
  questionVersionId: string;
  itemOrder: number;
  revealedAt: string | null;
  question: PracticeQuestion | null;
  choices: PracticeChoice[];
  attempts: PracticeAttempt[];
  review: CompletedPracticeReview | null;
}

export interface CompletedPracticeReview {
  correctChoiceId: string;
  explanation: string;
}

export interface CompletionSummary {
  totalItems: number;
  unavailableItems: number;
  scorableItems: number;
  attemptedItems: number;
  skippedItems: number;
  revealedWithoutAttemptItems: number;
  firstAttemptCorrect: number;
  score: number | null;
  firstAttemptAccuracy: number | null;
}

export interface PracticeSessionSnapshot {
  id: string;
  status: 'in_progress' | 'completed';
  startedAt: string;
  completedAt: string | null;
  config: unknown;
  summary: CompletionSummary | null;
  items: PracticeItem[];
}

export interface CreatedPracticeSession {
  sessionId: string;
  questionCount: number;
}

export interface SubmitAnswerResult {
  result: 'correct' | 'incorrect';
  revealed: true;
  correctChoiceId: string;
  explanation: string;
}

export interface RevealedAnswer {
  correctChoiceId: string;
  explanation: string;
  revealedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function requiredCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseCompletionSummary(value: unknown): CompletionSummary {
  if (
    !isRecord(value) ||
    !requiredCount(value.total_items) ||
    !requiredCount(value.unavailable_items) ||
    !requiredCount(value.scorable_items) ||
    !requiredCount(value.attempted_items) ||
    !requiredCount(value.skipped_items) ||
    !requiredCount(value.revealed_without_attempt_items) ||
    !requiredCount(value.first_attempt_correct) ||
    !(value.score === null || (typeof value.score === 'number' && Number.isFinite(value.score))) ||
    !(
      value.first_attempt_accuracy === null ||
      (typeof value.first_attempt_accuracy === 'number' && Number.isFinite(value.first_attempt_accuracy))
    )
  ) {
    throw new Error('The saved completion summary is invalid.');
  }
  return {
    totalItems: value.total_items,
    unavailableItems: value.unavailable_items,
    scorableItems: value.scorable_items,
    attemptedItems: value.attempted_items,
    skippedItems: value.skipped_items,
    revealedWithoutAttemptItems: value.revealed_without_attempt_items,
    firstAttemptCorrect: value.first_attempt_correct,
    score: value.score,
    firstAttemptAccuracy: value.first_attempt_accuracy,
  };
}

function parseSession(value: unknown): Omit<PracticeSessionSnapshot, 'items'> {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.status !== 'in_progress' && value.status !== 'completed') ||
    typeof value.started_at !== 'string' ||
    !isNullableString(value.completed_at) ||
    !(value.summary === null || isRecord(value.summary))
  ) {
    throw new Error('Session data did not match the expected schema.');
  }
  return {
    id: value.id,
    status: value.status,
    startedAt: value.started_at,
    completedAt: value.completed_at,
    config: value.config,
    summary: value.summary === null ? null : parseCompletionSummary(value.summary),
  };
}

function parseDomains(value: unknown): PracticeDomain[] {
  if (!Array.isArray(value)) throw new Error('Domain data was not a list.');
  return value.map((row): PracticeDomain => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'number' ||
      (row.section !== 'reading_writing' && row.section !== 'math') ||
      typeof row.name !== 'string' ||
      typeof row.sort_order !== 'number'
    ) {
      throw new Error('Domain data did not match the expected schema.');
    }
    return { id: row.id, section: row.section, name: row.name, sortOrder: row.sort_order };
  });
}

function parseSkills(value: unknown): PracticeSkill[] {
  if (!Array.isArray(value)) throw new Error('Skill data was not a list.');
  return value.map((row): PracticeSkill => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'number' ||
      typeof row.domain_id !== 'number' ||
      typeof row.name !== 'string' ||
      typeof row.sort_order !== 'number'
    ) {
      throw new Error('Skill data did not match the expected schema.');
    }
    return { id: row.id, domainId: row.domain_id, name: row.name, sortOrder: row.sort_order };
  });
}

function parseRecentSessions(value: unknown): RecentPracticeSession[] {
  if (!Array.isArray(value)) throw new Error('Recent-session data was not a list.');
  return value.map((row): RecentPracticeSession => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      (row.status !== 'in_progress' && row.status !== 'completed') ||
      typeof row.started_at !== 'string' ||
      !(row.summary === null || isRecord(row.summary))
    ) {
      throw new Error('Recent-session data did not match the expected schema.');
    }
    return {
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      summary: row.summary === null ? null : parseCompletionSummary(row.summary),
    };
  });
}

function parseSessionQuestions(value: unknown): {
  id: string;
  questionVersionId: string;
  itemOrder: number;
  revealedAt: string | null;
}[] {
  if (!Array.isArray(value)) throw new Error('Session items were not a list.');
  return value.map((row) => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      typeof row.question_version_id !== 'string' ||
      !requiredCount(row.item_order) ||
      row.item_order < 1 ||
      !isNullableString(row.revealed_at)
    ) {
      throw new Error('Session-item data did not match the expected schema.');
    }
    return {
      id: row.id,
      questionVersionId: row.question_version_id,
      itemOrder: row.item_order,
      revealedAt: row.revealed_at,
    };
  });
}

function parseQuestions(value: unknown): PracticeQuestion[] {
  if (!Array.isArray(value)) throw new Error('Question data was not a list.');
  return value.map((row): PracticeQuestion => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      typeof row.question_id !== 'string' ||
      typeof row.version_number !== 'number' ||
      typeof row.skill_id !== 'number' ||
      (row.difficulty !== 'easy' && row.difficulty !== 'medium' && row.difficulty !== 'hard') ||
      !isNullableString(row.passage) ||
      typeof row.stem !== 'string' ||
      (row.status !== 'approved' && row.status !== 'archived')
    ) {
      throw new Error('Question data did not match the expected schema.');
    }
    return {
      id: row.id,
      questionId: row.question_id,
      versionNumber: row.version_number,
      skillId: row.skill_id,
      difficulty: row.difficulty,
      passage: row.passage,
      stem: row.stem,
    };
  });
}

function parseChoices(value: unknown): PracticeChoice[] {
  if (!Array.isArray(value)) throw new Error('Answer-choice data was not a list.');
  const choices = value.map((row): PracticeChoice => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      typeof row.question_version_id !== 'string' ||
      typeof row.display_order !== 'number' ||
      row.display_order < 1 ||
      row.display_order > 4 ||
      typeof row.content !== 'string'
    ) {
      throw new Error('Answer-choice data did not match the expected schema.');
    }
    return {
      id: row.id,
      questionVersionId: row.question_version_id,
      displayOrder: row.display_order,
      content: row.content,
    };
  }).sort((left, right) => left.displayOrder - right.displayOrder);
  return choices;
}

function parseAttempts(value: unknown): PracticeAttempt[] {
  if (!Array.isArray(value)) throw new Error('Attempt data was not a list.');
  return value.map((row): PracticeAttempt => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      typeof row.session_question_id !== 'string' ||
      typeof row.selected_choice_id !== 'string' ||
      typeof row.attempt_number !== 'number' ||
      row.attempt_number < 1 ||
      !Number.isSafeInteger(row.attempt_number) ||
      typeof row.is_correct !== 'boolean' ||
      typeof row.submitted_at !== 'string'
    ) {
      throw new Error('Attempt data did not match the expected schema.');
    }
    return {
      id: row.id,
      sessionQuestionId: row.session_question_id,
      selectedChoiceId: row.selected_choice_id,
      attemptNumber: row.attempt_number,
      isCorrect: row.is_correct,
      submittedAt: row.submitted_at,
    };
  }).sort((left, right) => left.attemptNumber - right.attemptNumber);
}

function parseCreatedSession(value: unknown): CreatedPracticeSession {
  if (
    !isRecord(value) ||
    typeof value.session_id !== 'string' ||
    typeof value.question_count !== 'number' ||
    !Number.isInteger(value.question_count) ||
    value.question_count < 1
  ) {
    throw new Error('The server returned an invalid session result.');
  }
  return { sessionId: value.session_id, questionCount: value.question_count };
}

export function parseSubmitAnswer(value: unknown): SubmitAnswerResult {
  if (
    !isRecord(value) ||
    (value.result !== 'correct' && value.result !== 'incorrect') ||
    value.revealed !== true ||
    typeof value.correct_choice_id !== 'string' ||
    typeof value.explanation !== 'string' ||
    value.explanation.trim() === ''
  ) {
    throw new Error('The answer result did not match the expected schema.');
  }
  return {
    result: value.result,
    revealed: value.revealed,
    correctChoiceId: value.correct_choice_id,
    explanation: value.explanation,
  };
}

function parseRevealedAnswer(value: unknown): RevealedAnswer {
  if (
    !isRecord(value) ||
    typeof value.correct_choice_id !== 'string' ||
    typeof value.explanation !== 'string' ||
    typeof value.revealed_at !== 'string'
  ) {
    throw new Error('The revealed answer did not match the expected schema.');
  }
  return {
    correctChoiceId: value.correct_choice_id,
    explanation: value.explanation,
    revealedAt: value.revealed_at,
  };
}

export async function createPracticeSession(
  filters: PracticeFilters,
  questionCount: number,
): Promise<CreatedPracticeSession> {
  const { data, error } = await supabase.rpc('create_session', {
    p_question_count: questionCount,
    p_section: filters.section,
    p_domain_id: filters.domainId,
    p_skill_id: filters.skillId,
    p_difficulty: filters.difficulty,
    p_tag_slug: null,
  });
  if (error) throw error;
  return parseCreatedSession(data);
}

export async function loadPracticeTaxonomy(): Promise<{ domains: PracticeDomain[]; skills: PracticeSkill[] }> {
  const [domainsResult, skillsResult] = await Promise.all([
    supabase.from('domains').select('id,section,name,sort_order').order('sort_order').limit(100),
    supabase.from('skills').select('id,domain_id,name,sort_order').order('sort_order').limit(500),
  ]);
  if (domainsResult.error) throw domainsResult.error;
  if (skillsResult.error) throw skillsResult.error;
  return {
    domains: parseDomains(domainsResult.data),
    skills: parseSkills(skillsResult.data),
  };
}

export async function loadRecentPracticeSessions(): Promise<RecentPracticeSession[]> {
  const { data, error } = await supabase
    .from('practice_sessions')
    .select('id,status,started_at,summary')
    .order('started_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return parseRecentSessions(data);
}

export async function loadPracticeSession(sessionId: string): Promise<PracticeSessionSnapshot> {
  const sessionResult = await supabase
    .from('practice_sessions')
    .select('id,status,started_at,completed_at,config,summary')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionResult.error) throw sessionResult.error;
  if (!sessionResult.data) throw new Error('session_not_found');
  const session = parseSession(sessionResult.data);

  if (session.status === 'completed') {
    const { data, error } = await supabase.rpc('completed_session_review', { p_session_id: sessionId });
    if (error) throw error;
    const items = parseCompletedSessionItems(data);
    if (session.summary && items.length !== session.summary.totalItems) {
      throw new Error('completed_review_incomplete');
    }
    return { ...session, items };
  }

  const [itemsResult, attemptsResult] = await Promise.all([
    supabase
      .from('session_questions')
      .select('id,question_version_id,item_order,revealed_at')
      .eq('session_id', sessionId)
      .order('item_order', { ascending: true }),
    supabase
      .from('question_attempts')
      .select('id,session_question_id,selected_choice_id,attempt_number,is_correct,submitted_at')
      .eq('session_id', sessionId)
      .order('submitted_at', { ascending: true }),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (attemptsResult.error) throw attemptsResult.error;
  const sessionItems = parseSessionQuestions(itemsResult.data);
  const attempts = parseAttempts(attemptsResult.data);
  const versionIds = [...new Set(sessionItems.map((item) => item.questionVersionId))];

  let questions: PracticeQuestion[] = [];
  let choices: PracticeChoice[] = [];
  if (versionIds.length > 0) {
    const questionsResult = await supabase
      .from('question_versions')
      .select('id,question_id,version_number,skill_id,difficulty,passage,stem,status')
      .in('id', versionIds)
      .eq('status', 'approved');
    if (questionsResult.error) throw questionsResult.error;
    questions = parseQuestions(questionsResult.data);

    if (questions.length > 0) {
      const choicesResult = await supabase
        .from('question_choices')
        .select('id,question_version_id,display_order,content')
        .in('question_version_id', questions.map((question) => question.id))
        .order('display_order', { ascending: true });
      if (choicesResult.error) throw choicesResult.error;
      choices = parseChoices(choicesResult.data);
    }
  }

  const questionByVersion = new Map(questions.map((question) => [question.id, question]));
  const choicesByVersion = new Map<string, PracticeChoice[]>();
  for (const choice of choices) {
    const current = choicesByVersion.get(choice.questionVersionId) ?? [];
    current.push(choice);
    choicesByVersion.set(choice.questionVersionId, current);
  }
  const attemptsByItem = new Map<string, PracticeAttempt[]>();
  for (const attempt of attempts) {
    const current = attemptsByItem.get(attempt.sessionQuestionId) ?? [];
    current.push(attempt);
    attemptsByItem.set(attempt.sessionQuestionId, current);
  }

  const items = sessionItems.map((item): PracticeItem => {
    const question = questionByVersion.get(item.questionVersionId) ?? null;
    const itemChoices = question ? choicesByVersion.get(question.id) ?? [] : [];
    if (question && itemChoices.length !== 4) {
      throw new Error('question_choices_incomplete');
    }
    return {
      ...item,
      question,
      choices: itemChoices,
      attempts: attemptsByItem.get(item.id) ?? [],
      review: null,
    };
  });

  return { ...session, items };
}

function parseCompletedSessionItems(value: unknown): PracticeItem[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error('Completed-session review data did not match the expected schema.');
  }

  return value.items.map((row): PracticeItem => {
    if (!isRecord(row) || !isRecord(row.question) || !isRecord(row.review)) {
      throw new Error('Completed-session review item did not match the expected schema.');
    }
    const [item] = parseSessionQuestions([{
      id: row.id,
      question_version_id: row.question_version_id,
      item_order: row.item_order,
      revealed_at: row.revealed_at,
    }]);
    const [question] = parseQuestions([row.question]);
    const choices = parseChoices(row.choices);
    const attempts = parseAttempts(row.attempts);
    const correctChoiceId = row.review.correct_choice_id;
    const explanation = row.review.explanation;

    if (
      question.id !== item.questionVersionId ||
      choices.length !== 4 ||
      choices.some((choice) => choice.questionVersionId !== question.id) ||
      !attempts.every((attempt) =>
        attempt.sessionQuestionId === item.id && choices.some((choice) => choice.id === attempt.selectedChoiceId)) ||
      typeof correctChoiceId !== 'string' ||
      !choices.some((choice) => choice.id === correctChoiceId) ||
      typeof explanation !== 'string' ||
      explanation.trim() === ''
    ) {
      throw new Error('Completed-session review item was incomplete or inconsistent.');
    }

    return {
      ...item,
      question,
      choices,
      attempts,
      review: { correctChoiceId, explanation },
    };
  });
}

export async function submitPracticeAnswer(
  sessionQuestionId: string,
  choiceId: string,
): Promise<SubmitAnswerResult> {
  const { data, error } = await supabase.rpc('submit_answer', {
    p_session_question_id: sessionQuestionId,
    p_choice_id: choiceId,
  });
  if (error) throw error;
  return parseSubmitAnswer(data);
}

export async function revealPracticeAnswer(sessionQuestionId: string): Promise<RevealedAnswer> {
  const { data, error } = await supabase.rpc('reveal_answer', {
    p_session_question_id: sessionQuestionId,
  });
  if (error) throw error;
  return parseRevealedAnswer(data);
}

export async function completePracticeSession(sessionId: string): Promise<CompletionSummary> {
  const { data, error } = await supabase.rpc('complete_session', { p_session_id: sessionId });
  if (error) throw error;
  return parseCompletionSummary(data);
}

export function practiceErrorMessage(reason: unknown, fallback: string): string {
  const message = isRecord(reason) && typeof reason.message === 'string' ? reason.message : '';
  const messages: Record<string, string> = {
    not_authenticated: 'Your learner session is not ready. Please refresh and try again.',
    invalid_parameters: 'Those filters are no longer valid. Update them and try again.',
    no_questions_found: 'No approved questions match these filters. Try a broader selection.',
    session_not_found: 'This session could not be found or is not available to your account.',
    item_not_found: 'This question is not available in the current session.',
    session_not_in_progress: 'This session has already been completed. Its saved results are shown below.',
    session_not_completed: 'Question review is only available after the session is completed.',
    completed_review_incomplete: 'The saved question review is incomplete. Please refresh to try loading it again.',
    already_answered: 'This question has already been answered.',
    already_revealed: 'This question has already been revealed.',
    invalid_choice: 'That answer choice is no longer valid. Refresh the session and try again.',
    item_unavailable: 'This question is no longer approved and cannot be answered.',
    key_missing: 'The answer is unavailable for this question.',
    question_choices_incomplete: 'The question data is incomplete. Please contact an administrator.',
  };
  return messages[message] ?? fallback;
}

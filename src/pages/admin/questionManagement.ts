export const QUESTION_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'archived'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export type Difficulty = 'easy' | 'medium' | 'hard';

export const STATUS_LABELS: Record<QuestionStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  archived: 'Archived',
};

export const STATUS_TONES: Record<QuestionStatus, 'slate' | 'amber' | 'green' | 'red' | 'grape'> = {
  draft: 'slate',
  pending_review: 'amber',
  approved: 'green',
  rejected: 'red',
  archived: 'grape',
};

export interface QuestionVersion {
  id: string;
  questionId: string;
  versionNumber: number;
  skillId: number;
  difficulty: Difficulty;
  passage: string | null;
  stem: string;
  status: QuestionStatus;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  archivedAt: string | null;
  supersededByVersionId: string | null;
}

export interface Domain {
  id: number;
  section: 'reading_writing' | 'math';
  name: string;
  sortOrder: number;
}

export interface Skill {
  id: number;
  domainId: number;
  name: string;
  sortOrder: number;
}

export interface Tag {
  id: number;
  slug: string;
  name: string;
}

export interface OfficialReference {
  id: string;
  title: string;
  url: string;
  resourceType: string;
  provider: string;
  description: string | null;
  lastVerifiedOn: string | null;
}

export interface QuestionChoice {
  id: string;
  displayOrder: number;
  content: string;
}

export interface QuestionSource {
  sourceType: 'ai_generated' | 'human_authored' | 'human_revised';
  aiModel: string | null;
  promptVersion: string | null;
  generationBatchId: string | null;
  specReferenceId: string | null;
  notes: string | null;
}

export interface QuestionReview {
  id: string;
  versionId: string;
  reviewerId: string;
  decision: 'approved' | 'rejected' | 'withdrawn';
  notes: string | null;
  originalityConfirmed: boolean;
  createdAt: string;
}

export interface QuestionIdentity {
  id: string;
  questionType: string;
  createdBy: string | null;
  createdAt: string;
}

export interface AnswerKey {
  correctChoiceId: string;
  correctDisplayOrder: number;
  explanation: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isQuestionStatus(value: unknown): value is QuestionStatus {
  return QUESTION_STATUSES.some((status) => status === value);
}

export function parseQuestionVersions(value: unknown): QuestionVersion[] {
  if (!Array.isArray(value)) throw new Error('Question-version data was not a list.');

  return value.map((row): QuestionVersion => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      typeof row.question_id !== 'string' ||
      typeof row.version_number !== 'number' ||
      typeof row.skill_id !== 'number' ||
      (row.difficulty !== 'easy' && row.difficulty !== 'medium' && row.difficulty !== 'hard') ||
      !isNullableString(row.passage) ||
      typeof row.stem !== 'string' ||
      !isQuestionStatus(row.status) ||
      typeof row.created_at !== 'string' ||
      !isNullableString(row.submitted_at) ||
      !isNullableString(row.approved_at) ||
      !isNullableString(row.rejected_at) ||
      !isNullableString(row.archived_at) ||
      !isNullableString(row.superseded_by_version_id)
    ) {
      throw new Error('Question-version data did not match the expected schema.');
    }

    return {
      id: row.id,
      questionId: row.question_id,
      versionNumber: row.version_number,
      skillId: row.skill_id,
      difficulty: row.difficulty,
      passage: row.passage,
      stem: row.stem,
      status: row.status,
      createdAt: row.created_at,
      submittedAt: row.submitted_at,
      approvedAt: row.approved_at,
      rejectedAt: row.rejected_at,
      archivedAt: row.archived_at,
      supersededByVersionId: row.superseded_by_version_id,
    };
  });
}

export function parseDomains(value: unknown): Domain[] {
  if (!Array.isArray(value)) throw new Error('Domain data was not a list.');
  return value.map((row): Domain => {
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

export function parseSkills(value: unknown): Skill[] {
  if (!Array.isArray(value)) throw new Error('Skill data was not a list.');
  return value.map((row): Skill => {
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

export function parseTags(value: unknown): Tag[] {
  if (!Array.isArray(value)) throw new Error('Tag data was not a list.');
  return value.map((row): Tag => {
    if (!isRecord(row) || typeof row.id !== 'number' || typeof row.slug !== 'string' || typeof row.name !== 'string') {
      throw new Error('Tag data did not match the expected schema.');
    }
    return { id: row.id, slug: row.slug, name: row.name };
  });
}

export function parseOfficialReferences(value: unknown): OfficialReference[] {
  if (!Array.isArray(value)) throw new Error('Reference data was not a list.');
  return value.map((row): OfficialReference => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.url !== 'string' ||
      typeof row.resource_type !== 'string' ||
      typeof row.provider !== 'string' ||
      !isNullableString(row.description) ||
      !isNullableString(row.last_verified_on)
    ) {
      throw new Error('Reference data did not match the expected schema.');
    }
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      resourceType: row.resource_type,
      provider: row.provider,
      description: row.description,
      lastVerifiedOn: row.last_verified_on,
    };
  });
}

export function parseQuestionIdentity(value: unknown): QuestionIdentity {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.question_type !== 'string' ||
    !isNullableString(value.created_by) ||
    typeof value.created_at !== 'string'
  ) {
    throw new Error('Question data did not match the expected schema.');
  }
  return {
    id: value.id,
    questionType: value.question_type,
    createdBy: value.created_by,
    createdAt: value.created_at,
  };
}

export function parseQuestionChoices(value: unknown): QuestionChoice[] {
  if (!Array.isArray(value)) throw new Error('Choice data was not a list.');
  return value.map((row): QuestionChoice => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      typeof row.display_order !== 'number' ||
      typeof row.content !== 'string'
    ) {
      throw new Error('Choice data did not match the expected schema.');
    }
    return { id: row.id, displayOrder: row.display_order, content: row.content };
  }).sort((left, right) => left.displayOrder - right.displayOrder);
}

export function parseQuestionSource(value: unknown): QuestionSource {
  if (
    !isRecord(value) ||
    (value.source_type !== 'ai_generated' &&
      value.source_type !== 'human_authored' &&
      value.source_type !== 'human_revised') ||
    !isNullableString(value.ai_model) ||
    !isNullableString(value.prompt_version) ||
    !isNullableString(value.generation_batch_id) ||
    !isNullableString(value.spec_reference_id) ||
    !isNullableString(value.notes)
  ) {
    throw new Error('Source data did not match the expected schema.');
  }
  return {
    sourceType: value.source_type,
    aiModel: value.ai_model,
    promptVersion: value.prompt_version,
    generationBatchId: value.generation_batch_id,
    specReferenceId: value.spec_reference_id,
    notes: value.notes,
  };
}

export function parseQuestionReviews(value: unknown): QuestionReview[] {
  if (!Array.isArray(value)) throw new Error('Review data was not a list.');
  return value.map((row): QuestionReview => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      typeof row.question_version_id !== 'string' ||
      typeof row.reviewer_id !== 'string' ||
      (row.decision !== 'approved' && row.decision !== 'rejected' && row.decision !== 'withdrawn') ||
      !isNullableString(row.notes) ||
      typeof row.originality_confirmed !== 'boolean' ||
      typeof row.created_at !== 'string'
    ) {
      throw new Error('Review data did not match the expected schema.');
    }
    return {
      id: row.id,
      versionId: row.question_version_id,
      reviewerId: row.reviewer_id,
      decision: row.decision,
      notes: row.notes,
      originalityConfirmed: row.originality_confirmed,
      createdAt: row.created_at,
    };
  });
}

export function parseAnswerKey(value: unknown): AnswerKey {
  if (
    !isRecord(value) ||
    typeof value.correct_choice_id !== 'string' ||
    typeof value.correct_display_order !== 'number' ||
    typeof value.explanation !== 'string'
  ) {
    throw new Error('Answer-key data did not match the expected schema.');
  }
  return {
    correctChoiceId: value.correct_choice_id,
    correctDisplayOrder: value.correct_display_order,
    explanation: value.explanation,
  };
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function questionActionError(reason: unknown, fallback: string): string {
  const message = isRecord(reason) && typeof reason.message === 'string' ? reason.message : '';
  const knownMessages: Record<string, string> = {
    not_authorized: 'You do not have permission to create or submit this question.',
    not_admin: 'You do not have permission to review this question.',
    question_not_found: 'The question could not be found.',
    version_not_found: 'The question version could not be found.',
    tag_not_found: 'A selected tag is no longer available. Refresh and try again.',
    open_version_exists: 'This question already has a draft or pending-review version.',
    invalid_payload: 'Some question details are invalid. Review the required fields and try again.',
    not_draft: 'Only draft versions can be submitted for review.',
    incomplete_draft: 'Add all four choices, a correct answer, an explanation, and source details before submitting.',
    invalid_state: 'This version is no longer in a state that allows this action. Refresh the page.',
    originality_required: 'Confirm that the question content is original before approving.',
    notes_required: 'Enter a review note before rejecting or withdrawing this version.',
  };
  if (knownMessages[message]) return knownMessages[message];
  if (
    (isRecord(reason) && typeof reason.code === 'string' && ['23502', '23514', '22P02'].includes(reason.code)) ||
    /null value|check constraint|invalid input syntax/i.test(message)
  ) {
    return 'Some question details are invalid. Review the required fields and try again.';
  }
  return fallback;
}

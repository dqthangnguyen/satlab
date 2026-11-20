import { domains, skills } from '../data/taxonomy.ts';
import type { Difficulty, Question } from '../types';

export interface QuestionValidationError {
  path: string;
  message: string;
}

export interface QuestionValidationResult {
  valid: boolean;
  errors: QuestionValidationError[];
}

type RecordValue = Record<string, unknown>;

const STATUSES = ['draft', 'reviewed', 'published', 'retired'] as const;
const SOURCES = ['original', 'ai-generated', 'licensed', 'third-party'] as const;
const SECTIONS = ['math', 'reading-writing'] as const;
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'unknown'];
const CHOICE_IDS = ['A', 'B', 'C', 'D'] as const;
const UNMAPPED = 'unmapped';
const domainSections = new Map(domains.map((domain) => [domain.id, domain.section]));
const skillDomains = new Map(skills.map((skill) => [skill.id, skill.domain]));

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isDate = (value: unknown): value is string =>
  nonEmptyString(value) && Number.isFinite(Date.parse(value));

export function formatQuestionValidationErrors(errors: QuestionValidationError[]): string {
  return errors.map(({ path, message }) => `${path}: ${message}`).join('\n');
}

/** Validates the persisted question shape without changing or normalizing the input. */
export function validateQuestion(input: unknown): QuestionValidationResult {
  const errors: QuestionValidationError[] = [];
  const add = (path: string, message: string) => errors.push({ path, message });
  if (!isRecord(input)) {
    return { valid: false, errors: [{ path: '$', message: 'must be an object' }] };
  }

  const textField = (record: RecordValue, key: string, path: string): boolean => {
    if (!nonEmptyString(record[key])) {
      add(path, 'must be a non-empty string');
      return false;
    }
    return true;
  };
  const enumField = <T extends string>(value: unknown, values: readonly T[], path: string): value is T => {
    if (typeof value !== 'string' || !values.includes(value as T)) {
      add(path, `must be one of: ${values.join(', ')}`);
      return false;
    }
    return true;
  };
  const stringArray = (value: unknown, path: string, mustContainItems: boolean): value is string[] => {
    if (!Array.isArray(value) || (mustContainItems && value.length === 0)) {
      add(path, mustContainItems ? 'must be a non-empty array of strings' : 'must be an array of strings');
      return false;
    }
    let valid = true;
    value.forEach((item, index) => {
      if (!nonEmptyString(item)) {
        add(`${path}[${index}]`, 'must be a non-empty string');
        valid = false;
      }
    });
    return valid;
  };

  textField(input, 'id', 'id');
  if (input.version !== undefined && (!Number.isInteger(input.version) || (input.version as number) < 1)) {
    add('version', 'must be a positive integer');
  } else if (input.version === undefined) {
    add('version', 'is required');
  }
  const statusValid = enumField(input.status, STATUSES, 'status');
  const sourceValid = enumField(input.source, SOURCES, 'source');
  const sectionValid = enumField(input.section, SECTIONS, 'section');
  const difficultyValid = enumField(input.difficulty, DIFFICULTIES, 'difficulty');
  const formatValid = enumField(input.format, ['multiple_choice', 'student_produced'] as const, 'format');

  textField(input, 'prompt', 'prompt');
  if (input.passage !== undefined && typeof input.passage !== 'string') {
    add('passage', 'must be a string when provided');
  }
  if (input.topic !== undefined && !nonEmptyString(input.topic)) {
    add('topic', 'must be a non-empty string when provided');
  }
  if (input.domain === UNMAPPED) {
    if (statusValid && input.status !== 'draft') add('domain', 'may be unmapped only while the question is a draft');
  } else if (!nonEmptyString(input.domain)) {
    add('domain', 'must be a known taxonomy id or "unmapped"');
  } else {
    const domainSection = domainSections.get(input.domain);
    if (!domainSection) add('domain', `unknown taxonomy id "${input.domain}"`);
    else if (sectionValid && domainSection !== input.section) add('domain', 'does not belong to the selected section');
  }

  if (input.skill === UNMAPPED) {
    if (statusValid && input.status !== 'draft') add('skill', 'may be unmapped only while the question is a draft');
  } else if (!nonEmptyString(input.skill)) {
    add('skill', 'must be a known taxonomy id or "unmapped"');
  } else {
    const skillDomain = skillDomains.get(input.skill);
    if (!skillDomain) add('skill', `unknown taxonomy id "${input.skill}"`);
    else if (nonEmptyString(input.domain) && skillDomain !== input.domain) add('skill', 'does not belong to the selected domain');
  }

  if (difficultyValid && input.difficulty === 'unknown' && statusValid && input.status === 'published') {
    add('difficulty', 'must be known before a question can be published');
  }
  if (input.estimatedTimeSec !== undefined &&
      (typeof input.estimatedTimeSec !== 'number' || !Number.isFinite(input.estimatedTimeSec) || input.estimatedTimeSec <= 0)) {
    add('estimatedTimeSec', 'must be a positive number when provided');
  }

  if (input.figure !== undefined) {
    if (!isRecord(input.figure)) add('figure', 'must be an object with src and alt strings');
    else {
      textField(input.figure, 'src', 'figure.src');
      if (typeof input.figure.alt !== 'string') add('figure.alt', 'must be a string');
    }
  }

  let validChoices: string[] = [];
  if (input.choices !== undefined && !Array.isArray(input.choices)) {
    add('choices', 'must be an array when provided');
  } else if (Array.isArray(input.choices)) {
    const seen = new Set<string>();
    input.choices.forEach((choice: unknown, index: number) => {
      const path = `choices[${index}]`;
      if (!isRecord(choice)) {
        add(path, 'must be an object');
        return;
      }
      if (!enumField(choice.id, CHOICE_IDS, `${path}.id`)) return;
      if (seen.has(choice.id)) add(`${path}.id`, `duplicate choice id "${choice.id}"`);
      seen.add(choice.id);
      validChoices.push(choice.id);
      textField(choice, 'text', `${path}.text`);
      if (choice.errorTag !== undefined && !nonEmptyString(choice.errorTag)) {
        add(`${path}.errorTag`, 'must be a non-empty string when provided');
      }
    });
  }

  if (formatValid && input.format === 'multiple_choice') {
    if (!Array.isArray(input.choices)) {
      add('choices', 'are required for multiple-choice questions');
    } else if (validChoices.length !== 4 || CHOICE_IDS.some((choiceId) => !validChoices.includes(choiceId))) {
      add('choices', 'must contain exactly one choice for each of A, B, C, and D');
    }
  } else if (formatValid && input.format === 'student_produced' &&
      Array.isArray(input.choices) && input.choices.length > 0) {
    add('choices', 'must be omitted or empty for student-produced questions');
  }

  if (!isRecord(input.answer)) {
    add('answer', 'must be an object');
  } else if (input.answer.kind === 'choice') {
    if (!formatValid || input.format !== 'multiple_choice') {
      add('answer.kind', 'choice answers require a multiple-choice question');
    }
    if (!enumField(input.answer.choiceId, CHOICE_IDS, 'answer.choiceId')) {
      // The enum check adds the specific invalid-choice message.
    } else if (Array.isArray(input.choices) && !validChoices.includes(input.answer.choiceId)) {
      add('answer.choiceId', 'must match one of the question choices');
    }
  } else if (input.answer.kind === 'numeric') {
    if (!formatValid || input.format !== 'student_produced') {
      add('answer.kind', 'numeric answers require a student-produced question');
    }
    stringArray(input.answer.accepted, 'answer.accepted', true);
  } else {
    add('answer.kind', 'must be "choice" or "numeric"');
  }

  if (!isRecord(input.explanation)) {
    add('explanation', 'must be an object');
  } else {
    textField(input.explanation, 'short', 'explanation.short');
    if (input.explanation.steps !== undefined) stringArray(input.explanation.steps, 'explanation.steps', false);
  }
  stringArray(input.tags, 'tags', true);

  if (input.provenance !== undefined) {
    if (!isRecord(input.provenance)) {
      add('provenance', 'must be an object when provided');
    } else {
      const provenance = input.provenance;
      textField(provenance, 'name', 'provenance.name');
      textField(provenance, 'sourceId', 'provenance.sourceId');
      textField(provenance, 'contentHash', 'provenance.contentHash');
      if (sourceValid && (input.source === 'licensed' || input.source === 'third-party')) {
        textField(provenance, 'sourceUrl', 'provenance.sourceUrl');
        textField(provenance, 'license', 'provenance.license');
        textField(provenance, 'licenseNote', 'provenance.licenseNote');
        if (!isDate(provenance.importedAt)) add('provenance.importedAt', 'must be a valid date');
      }
      if (sourceValid && input.source === 'ai-generated') {
        if (!isDate(provenance.generatedAt)) add('provenance.generatedAt', 'must be a valid date');
        textField(provenance, 'generator', 'provenance.generator');
        textField(provenance, 'model', 'provenance.model');
        textField(provenance, 'promptVersion', 'provenance.promptVersion');
        if (provenance.referenceIds !== undefined) stringArray(provenance.referenceIds, 'provenance.referenceIds', false);
      }
      if (provenance.sourceUrl !== undefined && !nonEmptyString(provenance.sourceUrl)) {
        add('provenance.sourceUrl', 'must be a non-empty string when provided');
      }
      if (provenance.importedAt !== undefined && !isDate(provenance.importedAt)) {
        add('provenance.importedAt', 'must be a valid date when provided');
      }
      if (provenance.rawFile !== undefined && !nonEmptyString(provenance.rawFile)) {
        add('provenance.rawFile', 'must be a non-empty string when provided');
      }
    }
  } else if (sourceValid && input.source !== 'original') {
    add('provenance', 'is required for licensed, third-party, and AI-generated questions');
  }

  if (input.reviewFlags !== undefined) stringArray(input.reviewFlags, 'reviewFlags', false);
  if (statusValid && input.status === 'published' && Array.isArray(input.reviewFlags) && input.reviewFlags.length > 0) {
    add('reviewFlags', 'must be resolved before a question can be published');
  }
  if (input.review !== undefined) {
    if (!isRecord(input.review)) add('review', 'must be an object when provided');
    else {
      textField(input.review, 'reviewedBy', 'review.reviewedBy');
      if (!isDate(input.review.reviewedAt)) add('review.reviewedAt', 'must be a valid date');
    }
  }
  if (input.reviewLog !== undefined) {
    if (!Array.isArray(input.reviewLog)) add('reviewLog', 'must be an array when provided');
    else input.reviewLog.forEach((entry: unknown, index: number) => {
      const path = `reviewLog[${index}]`;
      if (!isRecord(entry)) add(path, 'must be an object');
      else {
        textField(entry, 'flag', `${path}.flag`);
        textField(entry, 'kind', `${path}.kind`);
        textField(entry, 'note', `${path}.note`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

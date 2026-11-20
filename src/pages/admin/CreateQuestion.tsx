import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import {
  isRecord,
  parseAnswerKey,
  parseDomains,
  parseOfficialReferences,
  parseQuestionChoices,
  parseQuestionSource,
  parseQuestionVersions,
  parseSkills,
  parseTags,
  questionActionError,
  type Domain,
  type OfficialReference,
  type QuestionVersion,
  type Skill,
  type Tag,
} from './questionManagement';

type SourceType = 'ai_generated' | 'human_authored' | 'human_revised';
type Section = Domain['section'];
type Difficulty = QuestionVersion['difficulty'];
type ChoiceValues = [string, string, string, string];

interface QuestionForm {
  section: Section;
  domainId: string;
  skillId: string;
  difficulty: Difficulty;
  passage: string;
  stem: string;
  choices: ChoiceValues;
  correctChoiceIndex: number;
  explanation: string;
  sourceType: SourceType;
  aiModel: string;
  promptVersion: string;
  batchId: string;
  specReferenceId: string;
  notes: string;
  tagSlugs: string[];
}

const EMPTY_CHOICES: ChoiceValues = ['', '', '', ''];
const VERSION_COLUMNS =
  'id,question_id,version_number,skill_id,difficulty,passage,stem,status,created_at,submitted_at,approved_at,rejected_at,archived_at,superseded_by_version_id';
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const DRAFT_STORAGE_PREFIX = 'satlab:admin:create-question:draft:v1:';
const SECTION_LABELS: Record<Section, string> = {
  reading_writing: 'Reading and Writing',
  math: 'Math',
};
const SOURCE_LABELS: Record<SourceType, string> = {
  ai_generated: 'AI generated',
  human_authored: 'Human authored',
  human_revised: 'Human revised',
};

const INITIAL_FORM: QuestionForm = {
  section: 'reading_writing',
  domainId: '',
  skillId: '',
  difficulty: 'medium',
  passage: '',
  stem: '',
  choices: [...EMPTY_CHOICES],
  correctChoiceIndex: 1,
  explanation: '',
  sourceType: 'human_authored',
  aiModel: '',
  promptVersion: '',
  batchId: '',
  specReferenceId: '',
  notes: '',
  tagSlugs: [],
};

function isSourceType(value: unknown): value is SourceType {
  return value === 'ai_generated' || value === 'human_authored' || value === 'human_revised';
}

function parseQuestionDraft(
  value: unknown,
  fallback: QuestionForm,
  domains: Domain[],
  skills: Skill[],
  tags: Tag[],
  references: OfficialReference[],
): QuestionForm | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.form)) return null;

  const saved = value.form;
  const section = domains.some((domain) => domain.section === saved.section)
    ? saved.section as Section
    : fallback.section;
  const savedDomain = domains.find(
    (domain) => String(domain.id) === saved.domainId && domain.section === section,
  );
  const fallbackDomain = domains.find(
    (domain) => String(domain.id) === fallback.domainId && domain.section === section,
  ) ?? domains.find((domain) => domain.section === section);
  const domainId = String(savedDomain?.id ?? fallbackDomain?.id ?? '');
  const savedSkill = skills.find(
    (skill) => String(skill.id) === saved.skillId && String(skill.domainId) === domainId,
  );
  const fallbackSkill = skills.find(
    (skill) => String(skill.id) === fallback.skillId && String(skill.domainId) === domainId,
  ) ?? skills.find((skill) => String(skill.domainId) === domainId);
  const choices = Array.isArray(saved.choices) &&
      saved.choices.length === 4 &&
      saved.choices.every((choice) => typeof choice === 'string')
    ? saved.choices as ChoiceValues
    : fallback.choices;

  return {
    section,
    domainId,
    skillId: savedSkill ? String(savedSkill.id) : String(fallbackSkill?.id ?? ''),
    difficulty:
      saved.difficulty === 'easy' || saved.difficulty === 'medium' || saved.difficulty === 'hard'
        ? saved.difficulty
        : fallback.difficulty,
    passage: typeof saved.passage === 'string' ? saved.passage : fallback.passage,
    stem: typeof saved.stem === 'string' ? saved.stem : fallback.stem,
    choices,
    correctChoiceIndex:
      typeof saved.correctChoiceIndex === 'number' &&
      Number.isInteger(saved.correctChoiceIndex) &&
      saved.correctChoiceIndex >= 1 &&
      saved.correctChoiceIndex <= 4
        ? saved.correctChoiceIndex
        : fallback.correctChoiceIndex,
    explanation: typeof saved.explanation === 'string' ? saved.explanation : fallback.explanation,
    sourceType: isSourceType(saved.sourceType) ? saved.sourceType : fallback.sourceType,
    aiModel: typeof saved.aiModel === 'string' ? saved.aiModel : fallback.aiModel,
    promptVersion: typeof saved.promptVersion === 'string' ? saved.promptVersion : fallback.promptVersion,
    batchId: typeof saved.batchId === 'string' ? saved.batchId : fallback.batchId,
    specReferenceId:
      typeof saved.specReferenceId === 'string' &&
      references.some((reference) => String(reference.id) === saved.specReferenceId)
        ? saved.specReferenceId
        : fallback.specReferenceId,
    notes: typeof saved.notes === 'string' ? saved.notes : fallback.notes,
    tagSlugs: Array.isArray(saved.tagSlugs)
      ? saved.tagSlugs.filter(
        (slug): slug is string =>
          typeof slug === 'string' && tags.some((tag) => tag.slug === slug),
      )
      : fallback.tagSlugs,
  };
}

export default function CreateQuestion() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const questionId = searchParams.get('questionId');
  const hasExistingQuestion = Boolean(questionId);
  const draftStorageKey = `${DRAFT_STORAGE_PREFIX}${questionId ?? 'new'}`;
  const [form, setForm] = useState<QuestionForm>(INITIAL_FORM);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [references, setReferences] = useState<OfficialReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openVersionStatus, setOpenVersionStatus] = useState<QuestionVersion['status'] | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [draftStorageError, setDraftStorageError] = useState<string | null>(null);
  const baseForm = useRef<QuestionForm>(INITIAL_FORM);
  const skipNextDraftSave = useRef(false);

  useEffect(() => {
    let active = true;
    setDraftReady(false);
    setLoading(true);
    setError(null);

    const loadFormData = async () => {
      try {
        if (questionId && !UUID_PATTERN.test(questionId)) {
          throw new Error('Invalid question ID.');
        }

        const [domainsResult, skillsResult, tagsResult, referencesResult] = await Promise.all([
          supabase.from('domains').select('id,section,name,sort_order').order('sort_order').limit(100),
          supabase.from('skills').select('id,domain_id,name,sort_order').order('sort_order').limit(500),
          supabase.from('tags').select('id,slug,name').order('name').limit(1000),
          supabase
            .from('official_references')
            .select('id,title,url,resource_type,provider,description,last_verified_on')
            .order('title')
            .limit(1000),
        ]);
        if (domainsResult.error) throw domainsResult.error;
        if (skillsResult.error) throw skillsResult.error;
        if (tagsResult.error) throw tagsResult.error;
        if (referencesResult.error) throw referencesResult.error;

        const domainRows = parseDomains(domainsResult.data);
        const skillRows = parseSkills(skillsResult.data);
        const tagRows = parseTags(tagsResult.data);
        const referenceRows = parseOfficialReferences(referencesResult.data);
        if (domainRows.length === 0 || skillRows.length === 0) {
          throw new Error('Question taxonomy is unavailable.');
        }

        let nextForm: QuestionForm = {
          ...INITIAL_FORM,
          section: domainRows[0].section,
          domainId: String(domainRows[0].id),
          skillId: String(skillRows.find((skill) => skill.domainId === domainRows[0].id)?.id ?? ''),
        };
        let blockedStatus: QuestionVersion['status'] | null = null;

        if (questionId) {
          const versionsResult = await supabase
            .from('question_versions')
            .select(VERSION_COLUMNS)
            .eq('question_id', questionId)
            .order('version_number', { ascending: false })
            .limit(1);
          if (versionsResult.error) throw versionsResult.error;
          const [latestVersion] = parseQuestionVersions(versionsResult.data);
          if (!latestVersion) throw new Error('Question version was not found.');

          const [choicesResult, keyResult, sourceResult, tagsResultForQuestion] = await Promise.all([
            supabase
              .from('question_choices')
              .select('id,display_order,content')
              .eq('question_version_id', latestVersion.id)
              .order('display_order'),
            supabase.rpc('get_answer_key', { p_version_id: latestVersion.id }),
            supabase
              .from('question_sources')
              .select('source_type,ai_model,prompt_version,generation_batch_id,spec_reference_id,notes')
              .eq('question_version_id', latestVersion.id)
              .maybeSingle(),
            supabase.from('question_tags').select('tag_id').eq('question_id', questionId),
          ]);
          if (choicesResult.error) throw choicesResult.error;
          if (keyResult.error) throw keyResult.error;
          if (sourceResult.error) throw sourceResult.error;
          if (tagsResultForQuestion.error) throw tagsResultForQuestion.error;

          const choices = parseQuestionChoices(choicesResult.data);
          if (choices.length !== 4) throw new Error('The saved question does not contain four choices.');
          if (!sourceResult.data) throw new Error('Question provenance was not found.');
          const key = parseAnswerKey(keyResult.data);
          const source = parseQuestionSource(sourceResult.data);
          const selectedSkill = skillRows.find((skill) => skill.id === latestVersion.skillId);
          const selectedDomain = selectedSkill
            ? domainRows.find((domain) => domain.id === selectedSkill.domainId)
            : undefined;
          const existingTagIds = Array.isArray(tagsResultForQuestion.data)
            ? tagsResultForQuestion.data.flatMap((row) =>
              isRecord(row) && typeof row.tag_id === 'number' ? [row.tag_id] : [],
            )
            : [];
          blockedStatus =
            latestVersion.status === 'draft' || latestVersion.status === 'pending_review'
              ? latestVersion.status
              : null;

          nextForm = {
            section: selectedDomain?.section ?? nextForm.section,
            domainId: selectedDomain ? String(selectedDomain.id) : nextForm.domainId,
            skillId: String(latestVersion.skillId),
            difficulty: latestVersion.difficulty,
            passage: latestVersion.passage ?? '',
            stem: latestVersion.stem,
            choices: [
              choices[0].content,
              choices[1].content,
              choices[2].content,
              choices[3].content,
            ],
            correctChoiceIndex: key.correctDisplayOrder,
            explanation: key.explanation,
            sourceType: source.sourceType,
            aiModel: source.aiModel ?? '',
            promptVersion: source.promptVersion ?? '',
            batchId: source.generationBatchId ?? '',
            specReferenceId: source.specReferenceId ?? '',
            notes: source.notes ?? '',
            tagSlugs: tagRows
              .filter((tag) => existingTagIds.includes(tag.id))
              .map((tag) => tag.slug),
          };
        }

        const defaultForm = nextForm;
        let restored = false;
        let storageError: string | null = null;
        try {
          const storedDraft = localStorage.getItem(draftStorageKey);
          if (storedDraft !== null) {
            let storedValue: unknown;
            try {
              storedValue = JSON.parse(storedDraft) as unknown;
            } catch {
              localStorage.removeItem(draftStorageKey);
            }
            const parsedForm = parseQuestionDraft(storedValue, defaultForm, domainRows, skillRows, tagRows, referenceRows);
            if (parsedForm) {
              nextForm = parsedForm;
              restored = true;
            } else {
              localStorage.removeItem(draftStorageKey);
            }
          }
        } catch {
          storageError = 'Local draft storage is unavailable. Your edits may not be saved in this browser.';
        }

        if (active) {
          setDomains(domainRows);
          setSkills(skillRows);
          setTags(tagRows);
          setReferences(referenceRows);
          baseForm.current = defaultForm;
          skipNextDraftSave.current = true;
          setForm(nextForm);
          setDraftRestored(restored);
          setDraftSaveStatus(restored ? 'saved' : 'idle');
          setDraftStorageError(storageError);
          setDraftReady(true);
          setOpenVersionStatus(blockedStatus);
        }
      } catch {
        if (active) setError('We could not load the question form. Please refresh and try again.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadFormData();
    return () => {
      active = false;
    };
  }, [draftStorageKey, questionId]);

  useEffect(() => {
    if (!draftReady) return;
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }

    setDraftSaveStatus('saving');
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify({ version: 1, form }));
        setDraftSaveStatus('saved');
        setDraftStorageError(null);
      } catch {
        setDraftSaveStatus('idle');
        setDraftStorageError('Local draft storage is unavailable. Your edits may not be saved in this browser.');
      }
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [draftReady, draftStorageKey, form]);

  const discardLocalDraft = () => {
    try {
      localStorage.removeItem(draftStorageKey);
      skipNextDraftSave.current = true;
      setForm(baseForm.current);
      setDraftRestored(false);
      setDraftSaveStatus('idle');
      setDraftStorageError(null);
    } catch {
      setDraftStorageError('The local draft could not be discarded. Please try again.');
    }
  };

  const availableDomains = useMemo(
    () => domains.filter((domain) => domain.section === form.section),
    [domains, form.section],
  );
  const availableSkills = useMemo(
    () => skills.filter((skill) => skill.domainId === Number(form.domainId)),
    [skills, form.domainId],
  );

  const updateForm = <K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (openVersionStatus) {
      setError(
        openVersionStatus === 'draft'
          ? 'This question already has an open draft. The current SQL RPC does not support editing or replacing that draft.'
          : 'This question already has a version pending review.',
      );
      return;
    }

    if (
      !form.skillId ||
      !form.stem.trim() ||
      !form.explanation.trim() ||
      form.choices.some((choice) => !choice.trim()) ||
      !isSourceType(form.sourceType) ||
      (form.sourceType === 'ai_generated' && !form.aiModel.trim())
    ) {
      setError('Complete the skill, question stem, four answer choices, explanation, and required source details.');
      return;
    }
    if (form.batchId.trim() && !UUID_PATTERN.test(form.batchId.trim())) {
      setError('The generation batch ID must be a valid UUID.');
      return;
    }

    const payload: Record<string, unknown> = {
      skill_id: Number(form.skillId),
      difficulty: form.difficulty,
      passage: form.passage.trim() || null,
      stem: form.stem.trim(),
      choices: form.choices.map((choice) => choice.trim()),
      correct_choice_index: form.correctChoiceIndex,
      explanation: form.explanation.trim(),
      source_type: form.sourceType,
      ai_model: form.aiModel.trim() || null,
      prompt_version: form.promptVersion.trim() || null,
      batch_id: form.batchId.trim() || null,
      spec_reference_id: form.specReferenceId || null,
      notes: form.notes.trim() || null,
    };
    if (questionId) {
      payload.question_id = questionId;
    } else if (form.tagSlugs.length > 0) {
      payload.tag_slugs = form.tagSlugs;
    }

    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('create_draft_version', { p_payload: payload });
      if (rpcError) throw rpcError;
      if (
        !isRecord(data) ||
        typeof data.question_id !== 'string' ||
        typeof data.version_id !== 'string' ||
        typeof data.version_number !== 'number'
      ) {
        throw new Error('The server returned an invalid question result.');
      }
      navigate(`/admin/questions/${data.question_id}?version=${data.version_id}`, {
        replace: true,
        state: {
          draftStorageKey,
          createdVersion: {
            questionId: data.question_id,
            versionId: data.version_id,
            versionNumber: data.version_number,
          },
        },
      });
    } catch (reason: unknown) {
      setError(questionActionError(reason, 'We could not save this draft. Please review the details and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const title = hasExistingQuestion ? 'Create a new version' : 'Create Question';

  if (loading) {
    return <p className="card py-10 text-center text-slate-600" role="status">Loading question form…</p>;
  }

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={
          hasExistingQuestion
            ? 'Create a new immutable draft version for this question.'
            : 'Create a new multiple-choice SAT question draft.'
        }
      />

      <section className="card">
        <p className="mb-6 text-sm text-slate-600">
          Fields marked required are needed by the database RPC. A draft can be submitted only after its four choices,
          answer key, explanation, and source record are saved.
        </p>

        {error && (
          <p className="mb-5 rounded-xl border border-coral-100 bg-coral-100 p-4 text-coral-600" role="alert">
            {error}
          </p>
        )}

        {(draftRestored || draftSaveStatus !== 'idle' || draftStorageError) && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm" role="status">
            <div className="text-slate-600">
              {draftRestored && <span className="mr-3 font-medium text-mint-700">Restored unsaved draft</span>}
              {draftSaveStatus === 'saving' && <span>Saving…</span>}
              {draftSaveStatus === 'saved' && <span>Saved locally</span>}
              {draftStorageError && <span className="text-coral-700">{draftStorageError}</span>}
            </div>
            {draftRestored && (
              <button type="button" className="text-slate-600 underline hover:text-slate-900" onClick={discardLocalDraft}>
                Discard local draft
              </button>
            )}
          </div>
        )}

        {openVersionStatus && (
          <p className="mb-5 rounded-xl border border-sun-300 bg-sun-100 p-4 text-amber-900" role="status">
            {openVersionStatus === 'draft'
              ? 'An existing draft is open. The SQL contract has no draft-update operation and create_draft_version rejects a second open version, so this draft cannot be edited here.'
              : 'A version is already pending review. The SQL contract does not allow creating another version while it is open.'}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset disabled={submitting || Boolean(openVersionStatus)} className="space-y-6 disabled:opacity-80">
            <legend className="sr-only">Question content and source</legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Section <span aria-hidden="true">*</span>
                <select
                  required
                  value={form.section}
                  onChange={(event) => {
                    if (event.target.value === 'reading_writing' || event.target.value === 'math') {
                      const section = event.target.value;
                      const firstDomain = domains.find((domain) => domain.section === section);
                      setForm((current) => ({
                        ...current,
                        section,
                        domainId: firstDomain ? String(firstDomain.id) : '',
                        skillId: '',
                      }));
                    }
                  }}
                  className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                >
                  {[...new Set(domains.map((domain) => domain.section))].map((section) => (
                    <option key={section} value={section}>{SECTION_LABELS[section]}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Domain <span aria-hidden="true">*</span>
                <select
                  required
                  value={form.domainId}
                  onChange={(event) => setForm((current) => ({ ...current, domainId: event.target.value, skillId: '' }))}
                  className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                >
                  {availableDomains.map((domain) => (
                    <option key={domain.id} value={domain.id}>{domain.name}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Skill <span aria-hidden="true">*</span>
                <select
                  required
                  value={form.skillId}
                  onChange={(event) => updateForm('skillId', event.target.value)}
                  className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                >
                  <option value="">Select a skill</option>
                  {availableSkills.map((skill) => (
                    <option key={skill.id} value={skill.id}>{skill.name}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Difficulty <span aria-hidden="true">*</span>
                <select
                  required
                  value={form.difficulty}
                  onChange={(event) => {
                    if (event.target.value === 'easy' || event.target.value === 'medium' || event.target.value === 'hard') {
                      updateForm('difficulty', event.target.value);
                    }
                  }}
                  className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Passage <span className="font-normal text-slate-500">(optional)</span>
              <textarea
                rows={4}
                value={form.passage}
                onChange={(event) => updateForm('passage', event.target.value)}
                className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Question stem <span aria-hidden="true">*</span>
              <textarea
                required
                rows={5}
                value={form.stem}
                onChange={(event) => updateForm('stem', event.target.value)}
                className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
              />
            </label>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800">
                Four answer choices <span aria-hidden="true">*</span>
              </legend>
              {form.choices.map((choice, index) => (
                <div key={index} className="flex items-start gap-3">
                  <label className="flex min-h-[48px] shrink-0 items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="correct-choice"
                      value={index + 1}
                      checked={form.correctChoiceIndex === index + 1}
                      onChange={() => updateForm('correctChoiceIndex', index + 1)}
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span>{String.fromCharCode(65 + index)}</span>
                  </label>
                  <input
                    required
                    aria-label={`Answer choice ${String.fromCharCode(65 + index)}`}
                    value={choice}
                    onChange={(event) => {
                      const choices = [...form.choices] as ChoiceValues;
                      choices[index] = event.target.value;
                      updateForm('choices', choices);
                    }}
                    className="block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                  />
                  {form.correctChoiceIndex === index + 1 && (
                    <span className="self-center text-sm font-semibold text-mint-600">Correct answer</span>
                  )}
                </div>
              ))}
              <p className="text-sm text-slate-500">Select the radio button beside the correct answer.</p>
            </fieldset>

            <label className="block text-sm font-medium text-slate-700">
              Explanation <span aria-hidden="true">*</span>
              <textarea
                required
                rows={4}
                value={form.explanation}
                onChange={(event) => updateForm('explanation', event.target.value)}
                className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
              />
            </label>

            <div className="rounded-xl border border-slate-200 p-4">
              <h2 className="text-lg font-semibold">Source and provenance</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Source type <span aria-hidden="true">*</span>
                  <select
                    required
                    value={form.sourceType}
                    onChange={(event) => {
                      if (isSourceType(event.target.value)) updateForm('sourceType', event.target.value);
                    }}
                    className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                  >
                    {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Official reference <span className="font-normal text-slate-500">(optional)</span>
                  <select
                    value={form.specReferenceId}
                    onChange={(event) => updateForm('specReferenceId', event.target.value)}
                    className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                  >
                    <option value="">None selected</option>
                    {references.map((reference) => (
                      <option key={reference.id} value={reference.id}>
                        {reference.title} — {reference.resourceType}
                      </option>
                    ))}
                  </select>
                </label>

                {form.sourceType === 'ai_generated' && (
                  <label className="block text-sm font-medium text-slate-700">
                    AI model <span aria-hidden="true">*</span>
                    <input
                      required
                      value={form.aiModel}
                      onChange={(event) => updateForm('aiModel', event.target.value)}
                      className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                    />
                  </label>
                )}

                <label className="block text-sm font-medium text-slate-700">
                  Prompt version <span className="font-normal text-slate-500">(optional)</span>
                  <input
                    value={form.promptVersion}
                    onChange={(event) => updateForm('promptVersion', event.target.value)}
                    className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Generation batch ID <span className="font-normal text-slate-500">(optional UUID)</span>
                  <input
                    value={form.batchId}
                    onChange={(event) => updateForm('batchId', event.target.value)}
                    className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                  />
                </label>
              </div>

              <label className="mt-4 block text-sm font-medium text-slate-700">
                Source notes <span className="font-normal text-slate-500">(optional)</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => updateForm('notes', event.target.value)}
                  className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                />
              </label>
            </div>

            <fieldset className="rounded-xl border border-slate-200 p-4" disabled={hasExistingQuestion}>
              <legend className="px-1 text-lg font-semibold">Tags</legend>
              {hasExistingQuestion ? (
                <>
                  <p className="mb-3 text-sm text-slate-600">
                    Tags belong to the question and the existing RPC accepts tags only when creating a new question.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {form.tagSlugs.length > 0
                      ? form.tagSlugs.map((slug) => {
                        const tag = tags.find((item) => item.slug === slug);
                        return <span key={slug} className="rounded-lg bg-slate-100 px-3 py-1 text-sm">{tag?.name ?? slug}</span>;
                      })
                      : <span className="text-sm text-slate-500">No tags assigned.</span>}
                  </div>
                </>
              ) : tags.length === 0 ? (
                <p className="text-sm text-slate-600">No tags are available.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {tags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.tagSlugs.includes(tag.slug)}
                        onChange={(event) => {
                          const tagSlugs = event.target.checked
                            ? [...form.tagSlugs, tag.slug]
                            : form.tagSlugs.filter((slug) => slug !== tag.slug);
                          updateForm('tagSlugs', tagSlugs);
                        }}
                        className="h-4 w-4 accent-brand-600"
                      />
                      {tag.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </fieldset>

          <div className="flex flex-wrap justify-end gap-3">
            <Link
              to={questionId ? `/admin/questions/${questionId}` : '/admin/questions'}
              className="btn-secondary"
            >
              Cancel
            </Link>
            <button type="submit" className="btn-primary" disabled={submitting || Boolean(openVersionStatus)}>
              {submitting ? 'Saving draft…' : 'Create draft'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

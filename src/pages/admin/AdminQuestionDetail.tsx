import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Badge, PageHeader } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import {
  formatDate,
  isRecord,
  parseAnswerKey,
  parseDomains,
  parseOfficialReferences,
  parseQuestionChoices,
  parseQuestionIdentity,
  parseQuestionReviews,
  parseQuestionSource,
  parseQuestionVersions,
  parseSkills,
  parseTags,
  questionActionError,
  STATUS_LABELS,
  STATUS_TONES,
  type AnswerKey,
  type Domain,
  type OfficialReference,
  type QuestionChoice,
  type QuestionIdentity,
  type QuestionReview,
  type QuestionSource,
  type QuestionVersion,
  type Skill,
  type Tag,
} from './questionManagement';

type ReviewDecision = 'approved' | 'rejected' | 'withdrawn';
const VERSION_COLUMNS =
  'id,question_id,version_number,skill_id,difficulty,passage,stem,status,created_at,submitted_at,approved_at,rejected_at,archived_at,superseded_by_version_id';
const CREATE_QUESTION_DRAFT_PREFIX = 'satlab:admin:create-question:draft:v1:';
const SOURCE_LABELS: Record<QuestionSource['sourceType'], string> = {
  ai_generated: 'AI generated',
  human_authored: 'Human authored',
  human_revised: 'Human revised',
};
const DECISION_LABELS: Record<ReviewDecision, string> = {
  approved: 'Approve',
  rejected: 'Reject',
  withdrawn: 'Withdraw',
};

interface DetailData {
  question: QuestionIdentity;
  versions: QuestionVersion[];
  domains: Map<number, Domain>;
  skills: Map<number, Skill>;
  tags: Tag[];
  reviews: QuestionReview[];
  choices: QuestionChoice[];
  answerKey: AnswerKey | null;
  source: QuestionSource;
  reference: OfficialReference | null;
}

function createdVersionMessage(value: unknown, questionId: string): string | null {
  if (!isRecord(value) || !isRecord(value.createdVersion)) return null;
  const result = value.createdVersion;
  if (
    result.questionId !== questionId ||
    typeof result.versionId !== 'string' ||
    typeof result.versionNumber !== 'number'
  ) {
    return null;
  }
  return `Created question ${questionId}, version ${result.versionId} (v${result.versionNumber}).`;
}

function sectionLabel(section: Domain['section']): string {
  return section === 'reading_writing' ? 'Reading and Writing' : 'Math';
}

export default function AdminQuestionDetail() {
  const { questionId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const requestedVersionId = searchParams.get('version');
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [originalityConfirmed, setOriginalityConfirmed] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftCleanupError, setDraftCleanupError] = useState<string | null>(null);
  const draftCleanupAttempted = useRef(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    () => createdVersionMessage(location.state, questionId),
  );

  useEffect(() => {
    if (loading || !data || !successMessage || draftCleanupAttempted.current) return;
    if (!isRecord(location.state) || typeof location.state.draftStorageKey !== 'string') return;
    if (!location.state.draftStorageKey.startsWith(CREATE_QUESTION_DRAFT_PREFIX)) return;

    draftCleanupAttempted.current = true;
    try {
      localStorage.removeItem(location.state.draftStorageKey);
    } catch {
      setDraftCleanupError('The question was created, but its local draft could not be cleared.');
    }
  }, [data, loading, location.state, successMessage]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);

    const loadQuestion = async () => {
      try {
        const [questionResult, versionsResult, domainsResult, skillsResult, questionTagsResult] = await Promise.all([
          supabase
            .from('questions')
            .select('id,question_type,created_by,created_at')
            .eq('id', questionId)
            .maybeSingle(),
          supabase
            .from('question_versions')
            .select(VERSION_COLUMNS)
            .eq('question_id', questionId)
            .order('version_number', { ascending: false }),
          supabase.from('domains').select('id,section,name,sort_order').order('sort_order').limit(100),
          supabase.from('skills').select('id,domain_id,name,sort_order').order('sort_order').limit(500),
          supabase.from('question_tags').select('tag_id').eq('question_id', questionId),
        ]);
        if (questionResult.error) throw questionResult.error;
        if (versionsResult.error) throw versionsResult.error;
        if (domainsResult.error) throw domainsResult.error;
        if (skillsResult.error) throw skillsResult.error;
        if (questionTagsResult.error) throw questionTagsResult.error;
        if (!questionResult.data) throw new Error('Question not found.');

        const question = parseQuestionIdentity(questionResult.data);
        const versions = parseQuestionVersions(versionsResult.data);
        if (versions.length === 0) throw new Error('Question versions were not found.');
        const selectedVersion = versions.find((version) => version.id === requestedVersionId) ?? versions[0];
        const domainRows = parseDomains(domainsResult.data);
        const skillRows = parseSkills(skillsResult.data);
        const tagIds = Array.isArray(questionTagsResult.data)
          ? questionTagsResult.data.flatMap((row) =>
            isRecord(row) && typeof row.tag_id === 'number' ? [row.tag_id] : [],
          )
          : [];

        const [reviewsResult, tagsResult, choicesResult, keyResult, sourceResult] = await Promise.all([
          supabase
            .from('question_reviews')
            .select('id,question_version_id,reviewer_id,decision,notes,originality_confirmed,created_at')
            .in('question_version_id', versions.map((version) => version.id))
            .order('created_at', { ascending: false }),
          tagIds.length > 0
            ? supabase.from('tags').select('id,slug,name').in('id', tagIds).order('name')
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('question_choices')
            .select('id,display_order,content')
            .eq('question_version_id', selectedVersion.id)
            .order('display_order'),
          supabase.rpc('get_answer_key', { p_version_id: selectedVersion.id }),
          supabase
            .from('question_sources')
            .select('source_type,ai_model,prompt_version,generation_batch_id,spec_reference_id,notes')
            .eq('question_version_id', selectedVersion.id)
            .maybeSingle(),
        ]);
        if (reviewsResult.error) throw reviewsResult.error;
        if (tagsResult.error) throw tagsResult.error;
        if (choicesResult.error) throw choicesResult.error;
        if (sourceResult.error) throw sourceResult.error;
        if (!sourceResult.data) throw new Error('Question provenance was not found.');

        let answerKey: AnswerKey | null = null;
        if (!keyResult.error) {
          answerKey = parseAnswerKey(keyResult.data);
        } else if (keyResult.error.message !== 'key_not_found') {
          throw keyResult.error;
        }

        let reference: OfficialReference | null = null;
        const source = parseQuestionSource(sourceResult.data);
        if (source.specReferenceId) {
          const referenceResult = await supabase
            .from('official_references')
            .select('id,title,url,resource_type,provider,description,last_verified_on')
            .eq('id', source.specReferenceId)
            .maybeSingle();
          if (referenceResult.error) throw referenceResult.error;
          if (referenceResult.data) {
            [reference] = parseOfficialReferences([referenceResult.data]);
          }
        }

        const nextData: DetailData = {
          question,
          versions,
          domains: new Map(domainRows.map((domain) => [domain.id, domain])),
          skills: new Map(skillRows.map((skill) => [skill.id, skill])),
          tags: parseTags(tagsResult.data),
          reviews: parseQuestionReviews(reviewsResult.data),
          choices: parseQuestionChoices(choicesResult.data),
          answerKey,
          source,
          reference,
        };
        if (active) {
          setData(nextData);
          if (requestedVersionId !== selectedVersion.id) {
            setSearchParams({ version: selectedVersion.id }, { replace: true });
          }
        }
      } catch {
        if (active) setLoadError('We could not load this question. Please refresh and try again.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadQuestion();
    return () => {
      active = false;
    };
  }, [questionId, requestedVersionId, refreshToken, setSearchParams]);

  const selectedVersion = data?.versions.find((version) => version.id === requestedVersionId) ?? data?.versions[0];
  const selectedSkill = selectedVersion ? data?.skills.get(selectedVersion.skillId) : undefined;
  const selectedDomain = selectedSkill ? data?.domains.get(selectedSkill.domainId) : undefined;
  const hasOpenVersion = data?.versions.some(
    (version) => version.status === 'draft' || version.status === 'pending_review',
  ) ?? false;

  const openReviewDialog = (decision: ReviewDecision) => {
    setReviewDecision(decision);
    setReviewNotes('');
    setOriginalityConfirmed(false);
    setActionError(null);
  };

  const handleSubmitForReview = async () => {
    if (!selectedVersion || actionBusy) return;
    setActionError(null);
    setSuccessMessage(null);
    setActionBusy(true);
    try {
      const { data: result, error: rpcError } = await supabase.rpc('submit_for_review', {
        p_version_id: selectedVersion.id,
      });
      if (rpcError) throw rpcError;
      if (result !== 'pending_review') throw new Error('The server returned an unexpected review status.');
      setSuccessMessage('The draft was submitted for review.');
      setRefreshToken((value) => value + 1);
    } catch (reason: unknown) {
      setActionError(questionActionError(reason, 'We could not submit this draft. Please try again.'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedVersion || !reviewDecision || actionBusy) return;
    if (reviewDecision !== 'approved' && !reviewNotes.trim()) {
      setActionError('Enter a review note before continuing.');
      return;
    }
    if (reviewDecision === 'approved' && !originalityConfirmed) {
      setActionError('Confirm that the question content is original before approving.');
      return;
    }

    setActionError(null);
    setSuccessMessage(null);
    setActionBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc('review_version', {
        p_version_id: selectedVersion.id,
        p_decision: reviewDecision,
        p_notes: reviewNotes.trim() || null,
        p_originality_confirmed: reviewDecision === 'approved' && originalityConfirmed,
      });
      if (rpcError) throw rpcError;
      setSuccessMessage(
        reviewDecision === 'approved'
          ? 'The version was approved.'
          : reviewDecision === 'rejected'
            ? 'The version was rejected.'
            : 'The approved version was withdrawn and archived.',
      );
      setReviewDecision(null);
      setRefreshToken((value) => value + 1);
    } catch (reason: unknown) {
      setActionError(questionActionError(reason, 'We could not complete this review. Please try again.'));
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return <p className="card py-10 text-center text-slate-600" role="status">Loading question details…</p>;
  }
  if (loadError || !data || !selectedVersion) {
    return (
      <section className="card" role="alert">
        <h1 className="text-2xl font-semibold">Question unavailable</h1>
        <p className="mt-2 text-slate-600">{loadError ?? 'We could not load this question.'}</p>
        <Link to="/admin/questions" className="btn-secondary mt-5 inline-flex">Back to Question Bank</Link>
      </section>
    );
  }

  return (
    <div>
      <PageHeader
        title="Question details"
        subtitle="Review the question content, provenance, lifecycle, and version history."
      >
        <Link to="/admin/questions" className="btn-secondary">Question Bank</Link>
      </PageHeader>

      {successMessage && (
        <p className="mb-5 rounded-xl border border-mint-100 bg-mint-100 p-4 text-mint-600" role="status">
          {successMessage}
        </p>
      )}
      {draftCleanupError && (
        <p className="mb-5 rounded-xl border border-sun-300 bg-sun-100 p-4 text-amber-900" role="alert">
          {draftCleanupError}
        </p>
      )}
      {actionError && (
        <p className="mb-5 rounded-xl border border-coral-100 bg-coral-100 p-4 text-coral-600" role="alert">
          {actionError}
        </p>
      )}

      <section className="card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Question metadata</h2>
            <p className="mt-2 break-all font-mono text-sm text-slate-600">{data.question.id}</p>
          </div>
          <Badge tone={STATUS_TONES[selectedVersion.status]}>{STATUS_LABELS[selectedVersion.status]}</Badge>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-sm text-slate-500">Question type</dt><dd className="mt-1 font-medium">{data.question.questionType}</dd></div>
          <div><dt className="text-sm text-slate-500">Created</dt><dd className="mt-1 font-medium">{formatDate(data.question.createdAt)}</dd></div>
          <div><dt className="text-sm text-slate-500">Created by</dt><dd className="mt-1 break-all font-medium">{data.question.createdBy ?? 'Unknown'}</dd></div>
          <div><dt className="text-sm text-slate-500">Version</dt><dd className="mt-1 font-medium">v{selectedVersion.versionNumber}</dd></div>
          <div><dt className="text-sm text-slate-500">Section</dt><dd className="mt-1 font-medium">{selectedDomain ? sectionLabel(selectedDomain.section) : 'Unknown'}</dd></div>
          <div><dt className="text-sm text-slate-500">Domain / skill</dt><dd className="mt-1 font-medium">{selectedDomain?.name ?? 'Unknown'} / {selectedSkill?.name ?? 'Unknown'}</dd></div>
          <div><dt className="text-sm text-slate-500">Difficulty</dt><dd className="mt-1 font-medium capitalize">{selectedVersion.difficulty}</dd></div>
          <div><dt className="text-sm text-slate-500">Last updated</dt><dd className="mt-1 font-medium">{formatDate(selectedVersion.archivedAt ?? selectedVersion.approvedAt ?? selectedVersion.rejectedAt ?? selectedVersion.submittedAt ?? selectedVersion.createdAt)}</dd></div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          {selectedVersion.status === 'draft' && (
            <button type="button" className="btn-primary" onClick={() => void handleSubmitForReview()} disabled={actionBusy}>
              {actionBusy ? 'Submitting…' : 'Submit for Review'}
            </button>
          )}
          {selectedVersion.status === 'pending_review' && (
            <>
              <button type="button" className="btn-primary" onClick={() => openReviewDialog('approved')} disabled={actionBusy}>
                Approve
              </button>
              <button type="button" className="btn-secondary" onClick={() => openReviewDialog('rejected')} disabled={actionBusy}>
                Reject
              </button>
            </>
          )}
          {selectedVersion.status === 'approved' && (
            <button type="button" className="btn-secondary" onClick={() => openReviewDialog('withdrawn')} disabled={actionBusy}>
              Withdraw
            </button>
          )}
          {selectedVersion.status === 'draft' && (
            <p className="self-center text-sm text-slate-600">
              This draft cannot be edited through the current RPC contract. Creating another version is blocked while it remains open.
            </p>
          )}
          {!hasOpenVersion && ['approved', 'rejected', 'archived'].includes(selectedVersion.status) && (
            <Link
              to={`/admin/questions/new?questionId=${encodeURIComponent(data.question.id)}`}
              className="btn-secondary"
            >
              Create new version
            </Link>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <section className="card">
          <h2 className="text-xl font-semibold">Question content</h2>
          {selectedVersion.passage && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-600">Passage</h3>
              <p className="mt-2 whitespace-pre-wrap text-slate-800">{selectedVersion.passage}</p>
            </div>
          )}
          <p className="mt-4 whitespace-pre-wrap text-slate-900">{selectedVersion.stem}</p>

          <ol className="mt-5 space-y-3">
            {data.choices.map((choice) => {
              const isCorrect = data.answerKey?.correctChoiceId === choice.id;
              return (
                <li
                  key={choice.id}
                  className={`rounded-xl border p-4 ${isCorrect ? 'border-mint-100 bg-mint-100' : 'border-slate-200 bg-white'}`}
                >
                  <span className="mr-2 font-semibold">{String.fromCharCode(64 + choice.displayOrder)}.</span>
                  <span className="whitespace-pre-wrap">{choice.content}</span>
                  {isCorrect && <span className="ml-2 text-sm font-semibold text-mint-600">Correct answer</span>}
                </li>
              );
            })}
          </ol>
          {data.choices.length === 0 && <p className="mt-4 text-slate-600">No answer choices are available.</p>}

          {data.answerKey ? (
            <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50 p-4">
              <h3 className="font-semibold text-brand-700">
                Correct answer: {String.fromCharCode(64 + data.answerKey.correctDisplayOrder)}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-slate-700">{data.answerKey.explanation}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">The answer key is unavailable for this version.</p>
          )}
        </section>

        <aside className="space-y-6">
          <section className="card">
            <h2 className="text-xl font-semibold">Source and provenance</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="text-slate-500">Source type</dt><dd className="mt-1 font-medium">{SOURCE_LABELS[data.source.sourceType]}</dd></div>
              {data.source.aiModel && <div><dt className="text-slate-500">AI model</dt><dd className="mt-1 break-all">{data.source.aiModel}</dd></div>}
              {data.source.promptVersion && <div><dt className="text-slate-500">Prompt version</dt><dd className="mt-1">{data.source.promptVersion}</dd></div>}
              {data.source.generationBatchId && <div><dt className="text-slate-500">Generation batch</dt><dd className="mt-1 break-all">{data.source.generationBatchId}</dd></div>}
              {data.source.notes && <div><dt className="text-slate-500">Notes</dt><dd className="mt-1 whitespace-pre-wrap">{data.source.notes}</dd></div>}
            </dl>
            {data.reference && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold">Official reference</h3>
                <a
                  href={data.reference.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block font-medium text-brand-700 underline"
                >
                  {data.reference.title}
                </a>
                <p className="mt-1 text-sm text-slate-600">
                  {data.reference.provider} · {data.reference.resourceType}
                </p>
                {data.reference.description && <p className="mt-2 text-sm text-slate-600">{data.reference.description}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  Last verified: {data.reference.lastVerifiedOn ?? 'Not recorded'}
                </p>
              </div>
            )}
            {data.source.specReferenceId && !data.reference && (
              <p className="mt-4 text-sm text-slate-600">The linked official reference is unavailable.</p>
            )}
          </section>

          <section className="card">
            <h2 className="text-xl font-semibold">Tags</h2>
            {data.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.tags.map((tag) => (
                  <span key={tag.id} className="rounded-lg bg-slate-100 px-3 py-1 text-sm text-slate-700">{tag.name}</span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600">No tags assigned.</p>
            )}
          </section>
        </aside>
      </div>

      <section className="card mt-6">
        <h2 className="text-xl font-semibold">Version history</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.versions.map((version) => (
            <button
              key={version.id}
              type="button"
              onClick={() => setSearchParams({ version: version.id })}
              aria-current={version.id === selectedVersion.id ? 'page' : undefined}
              className={`rounded-xl border-2 px-3 py-2 text-left ${version.id === selectedVersion.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'}`}
            >
              <span className="block font-semibold">v{version.versionNumber}</span>
              <span className="mt-1 block"><Badge tone={STATUS_TONES[version.status]}>{STATUS_LABELS[version.status]}</Badge></span>
              <span className="mt-1 block text-xs text-slate-500">{formatDate(version.createdAt)}</span>
              {version.supersededByVersionId && (
                <span className="mt-1 block text-xs text-slate-500">
                  Superseded by v{data.versions.find((item) => item.id === version.supersededByVersionId)?.versionNumber ?? '—'}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="card mt-6">
        <h2 className="text-xl font-semibold">Review history</h2>
        {data.reviews.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No review decisions have been recorded.</p>
        ) : (
          <ol className="mt-4 divide-y divide-slate-100">
            {data.reviews.map((review) => {
              const reviewedVersion = data.versions.find((version) => version.id === review.versionId);
              return (
                <li key={review.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold capitalize">{review.decision}</span>
                    <span className="text-sm text-slate-500">v{reviewedVersion?.versionNumber ?? '—'} · {formatDate(review.createdAt)}</span>
                    {review.originalityConfirmed && <Badge tone="green">Originality confirmed</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Reviewer {review.reviewerId}</p>
                  {review.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{review.notes}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {reviewDecision && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-dialog-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="review-dialog-title" className="text-2xl font-semibold">
              Confirm {DECISION_LABELS[reviewDecision].toLowerCase()}
            </h2>
            <p className="mt-2 text-slate-600">
              {reviewDecision === 'approved'
                ? 'Approving confirms the question is original. The database may archive the previously approved version.'
                : reviewDecision === 'rejected'
                  ? 'Rejecting this version records the required review note.'
                  : 'Withdrawing archives this approved version and requires a reason.'}
            </p>

            {actionError && (
              <p className="mt-4 rounded-xl border border-coral-100 bg-coral-100 p-3 text-coral-600" role="alert">
                {actionError}
              </p>
            )}

            <form onSubmit={(event) => void handleReview(event)} className="mt-5 space-y-4">
              {reviewDecision === 'approved' ? (
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={originalityConfirmed}
                    onChange={(event) => setOriginalityConfirmed(event.target.checked)}
                    disabled={actionBusy}
                    className="mt-1 h-4 w-4 accent-brand-600"
                    required
                  />
                  <span>I confirm that this question content is original and does not reproduce or paraphrase protected official question text.</span>
                </label>
              ) : (
                <label className="block text-sm font-medium text-slate-700">
                  Review note <span aria-hidden="true">*</span>
                  <textarea
                    required
                    minLength={1}
                    rows={4}
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    disabled={actionBusy}
                    className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                  />
                </label>
              )}

              {reviewDecision === 'approved' && (
                <label className="block text-sm font-medium text-slate-700">
                  Optional review note
                  <textarea
                    rows={3}
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    disabled={actionBusy}
                    className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                  />
                </label>
              )}

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReviewDecision(null)}
                  disabled={actionBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={
                    actionBusy ||
                    (reviewDecision === 'approved' && !originalityConfirmed) ||
                    (reviewDecision !== 'approved' && !reviewNotes.trim())
                  }
                >
                  {actionBusy ? 'Processing…' : DECISION_LABELS[reviewDecision]}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

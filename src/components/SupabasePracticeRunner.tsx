import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from './Dialogs';
import ExamShell from './ExamShell';
import HighlightArea from './HighlightArea';
import RichText from './RichText';
import QuestionReview from './QuestionReview';
import type { QuestionReviewStatus, ReviewAttempt } from './QuestionReview';
import { useAuth } from '../lib/AuthContext';
import { navItems } from '../lib/examNav';
import {
  completePracticeSession,
  loadPracticeSession,
  practiceErrorMessage,
  revealPracticeAnswer,
  submitPracticeAnswer,
  type CompletionSummary,
  type PracticeAttempt,
  type PracticeItem,
  type PracticeSessionSnapshot,
  type SubmitAnswerResult,
} from '../lib/supabasePractice';

interface VisibleAnswer {
  correctChoiceId: string;
  explanation: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function unresolved(item: PracticeItem): boolean {
  return Boolean(item.question) && item.revealedAt === null && item.attempts.length === 0;
}

function choiceLabel(item: PracticeItem, choiceId: string): string {
  const choice = item.choices.find((candidate) => candidate.id === choiceId);
  return choice ? String.fromCharCode(64 + choice.displayOrder) : 'Unavailable choice';
}

function choiceAnswer(item: PracticeItem, choiceId: string): string {
  const choice = item.choices.find((candidate) => candidate.id === choiceId);
  return choice ? `${choiceLabel(item, choiceId)} — ${choice.content}` : 'Unavailable choice';
}

function latestAttempt(item: PracticeItem): PracticeAttempt | undefined {
  return item.attempts[item.attempts.length - 1];
}

function percentage(value: number | null): string {
  return value === null ? 'Not available' : `${(value * 100).toFixed(1)}%`;
}

function SessionResults({ snapshot }: { snapshot: PracticeSessionSnapshot }) {
  const summary = snapshot.summary;
  if (!summary) {
    return (
      <section className="card" role="alert">
        <h1 className="text-2xl font-semibold">Session results unavailable</h1>
        <p className="mt-2 text-slate-600">The database did not return a completion summary for this session.</p>
        <Link to="/practice" className="btn-primary mt-5 inline-flex">Practice again</Link>
      </section>
    );
  }

  const incorrectFirstSubmissions = Math.max(0, summary.attemptedItems - summary.firstAttemptCorrect);
  const unansweredItems = summary.skippedItems + summary.revealedWithoutAttemptItems;
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Practice results</h1>
          <p className="mt-2 text-slate-600">Scores and question counts are from the saved Supabase completion summary.</p>
        </div>
        <Link to="/practice" className="btn-primary">Start another session</Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <div className="card"><p className="text-slate-600">Total questions</p><p className="mt-1 text-3xl font-semibold text-brand-700">{summary.totalItems}</p></div>
        <div className="card"><p className="text-slate-600">Correct on first submission</p><p className="mt-1 text-3xl font-semibold text-brand-700">{summary.firstAttemptCorrect}</p></div>
        <div className="card"><p className="text-slate-600">Incorrect on first submission</p><p className="mt-1 text-3xl font-semibold text-brand-700">{incorrectFirstSubmissions}</p></div>
        <div className="card"><p className="text-slate-600">Unanswered</p><p className="mt-1 text-3xl font-semibold text-brand-700">{unansweredItems}</p></div>
        <div className="card"><p className="text-slate-600">First-submission accuracy</p><p className="mt-1 text-3xl font-semibold text-brand-700">{percentage(summary.firstAttemptAccuracy)}</p></div>
        <div className="card"><p className="text-slate-600">Unavailable questions</p><p className="mt-1 text-3xl font-semibold text-brand-700">{summary.unavailableItems}</p></div>
        <div className="card"><p className="text-slate-600">Database score</p><p className="mt-1 text-3xl font-semibold text-brand-700">{percentage(summary.score)}</p></div>
      </div>

      <p className="mb-6 text-sm text-slate-600">
        Counts and score use the saved completion summary. First-submission accuracy is based on answered questions; the database score uses scorable questions.
      </p>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Question review</h2>
        <ol className="space-y-3">
          {snapshot.items.map((item, index) => {
            const latest = latestAttempt(item);
            const status: QuestionReviewStatus = !item.question
              ? 'Unavailable'
              : latest
                ? latest.isCorrect ? 'Correct' : 'Incorrect'
                : 'Unanswered';
            const review = item.review;
            if (!review) {
              return (
                <li key={item.id}>
                  <article className="card" role="alert">
                    <h3 className="font-semibold">Question {index + 1}</h3>
                    <p className="mt-2 text-slate-600">
                      The completed-session review data is incomplete. No answer key or explanation was inferred.
                    </p>
                  </article>
                </li>
              );
            }
            const correctChoiceId = review.correctChoiceId;
            const correctAnswer = correctChoiceId ? choiceAnswer(item, correctChoiceId) : null;
            const attempts: ReviewAttempt[] = item.attempts.map((attempt) => ({
              number: attempt.attemptNumber,
              answer: choiceAnswer(item, attempt.selectedChoiceId),
              choiceId: attempt.selectedChoiceId,
              isCorrect: attempt.isCorrect,
            }));
            const unavailableMessage = !item.question
              ? 'The question version is no longer available to students.'
              : undefined;
            return (
              <li key={item.id}>
                <QuestionReview
                  number={index + 1}
                  status={status}
                  prompt={item.question ? (
                    <>
                      {item.question.passage && <p className="mb-2 whitespace-pre-wrap font-serif text-slate-800"><RichText text={item.question.passage} /></p>}
                      <RichText text={item.question.stem} />
                    </>
                  ) : <p>Question content is unavailable.</p>}
                  questionContent={item.question ? (
                    <div className="mx-auto max-w-2xl">
                      {item.question.passage && (
                        <div className="mb-6 whitespace-pre-wrap font-serif text-lg leading-8">
                          <RichText text={item.question.passage} />
                        </div>
                      )}
                      <p className="whitespace-pre-wrap text-lg leading-8"><RichText text={item.question.stem} /></p>
                    </div>
                  ) : <p>Question content is unavailable.</p>}
                  choices={item.choices.map((choice) => ({
                    id: choice.id,
                    label: String.fromCharCode(64 + choice.displayOrder),
                    text: choice.content,
                  }))}
                  attempts={attempts}
                  yourAnswer={latest ? choiceAnswer(item, latest.selectedChoiceId) : null}
                  correctAnswer={correctAnswer}
                  correctChoiceId={correctChoiceId}
                  answerUnavailableMessage={unavailableMessage}
                  explanation={review.explanation}
                />
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

export default function SupabasePracticeRunner({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const { user, loading: authLoading, error: authError } = useAuth();
  const [snapshot, setSnapshot] = useState<PracticeSessionSnapshot | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, VisibleAnswer>>({});
  const [lastResults, setLastResults] = useState<Record<string, SubmitAnswerResult>>({});
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [showShortfallNotice, setShowShortfallNotice] = useState(false);
  const snapshotRefreshRevision = useRef(0);

  useEffect(() => {
    let active = true;
    if (authLoading) return () => { active = false; };
    if (authError || !user) {
      setLoading(false);
      setLoadError('We could not verify your learner session. Please refresh and try again.');
      return () => { active = false; };
    }

    setLoading(true);
    setLoadError(null);
    setRestoreError(null);
    const load = async () => {
      try {
        const loaded = await loadPracticeSession(sessionId);
        const restored = await Promise.all(loaded.status === 'in_progress'
          ? loaded.items
            .filter((item) => item.revealedAt !== null || item.attempts.length > 0)
            .map(async (item) => {
              try {
                const answer = await revealPracticeAnswer(item.id);
                return { itemId: item.id, answer, failed: false };
              } catch {
                return { itemId: item.id, answer: null, failed: true };
              }
            })
          : []);
        const answerMap: Record<string, VisibleAnswer> = {};
        for (const result of restored) {
          if (result.answer) {
            answerMap[result.itemId] = {
              correctChoiceId: result.answer.correctChoiceId,
              explanation: result.answer.explanation,
            };
          }
        }
        if (active) {
          setSnapshot(loaded);
          setRevealedAnswers((previous) => ({ ...previous, ...answerMap }));
          if (restored.some((result) => result.failed)) {
            setRestoreError('A previously revealed explanation could not be restored. You can continue the session.');
          }
          const firstUnresolved = loaded.items.find(unresolved);
          setCurrentItemId(firstUnresolved?.id ?? loaded.items[0]?.id ?? null);
        }
      } catch (reason: unknown) {
        if (active) {
          setSnapshot(null);
          setLoadError(practiceErrorMessage(reason, 'We could not load this session. Please refresh and try again.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [authError, authLoading, sessionId, user?.id]);

  const items = snapshot?.items ?? [];
  const requestedCount = snapshot && isRecord(snapshot.config) && typeof snapshot.config.question_count === 'number'
    ? snapshot.config.question_count
    : null;
  const currentIndex = Math.max(0, items.findIndex((item) => item.id === currentItemId));
  const currentItem = items[currentIndex];
  const isItemUnresolved = (item: PracticeItem) =>
    Boolean(item.question) &&
    item.revealedAt === null &&
    item.attempts.length === 0 &&
    !lastResults[item.id]?.revealed &&
    !revealedAnswers[item.id];
  const nav = useMemo(() => {
    if (!snapshot) return [];
    return navItems(
      snapshot.items.map((item) => item.id),
      (itemId) => {
        const item = snapshot.items.find((entry) => entry.id === itemId);
        return Boolean(item && (item.attempts.length > 0 || lastResults[itemId]));
      },
      flags,
    );
  }, [flags, lastResults, snapshot]);

  useEffect(() => {
    if (snapshot?.status !== 'in_progress' || requestedCount === null || requestedCount <= items.length) {
      setShowShortfallNotice(false);
      return;
    }
    setShowShortfallNotice(true);
    const timeout = window.setTimeout(() => setShowShortfallNotice(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [items.length, requestedCount, snapshot?.status]);

  const isLocked = (item: PracticeItem) =>
    !isItemUnresolved(item);

  const refreshSnapshot = async () => {
    const revision = ++snapshotRefreshRevision.current;
    try {
      const refreshed = await loadPracticeSession(sessionId);
      const restored = await Promise.all(refreshed.status === 'in_progress'
        ? refreshed.items
          .filter((item) => item.revealedAt !== null || item.attempts.length > 0)
          .map(async (item) => {
            try {
              const answer = await revealPracticeAnswer(item.id);
              return { itemId: item.id, answer, failed: false };
            } catch {
              return { itemId: item.id, answer: null, failed: true };
            }
          })
        : []);
      if (revision !== snapshotRefreshRevision.current) return;
      const answerMap: Record<string, VisibleAnswer> = {};
      for (const result of restored) {
        if (result.answer) {
          answerMap[result.itemId] = {
            correctChoiceId: result.answer.correctChoiceId,
            explanation: result.answer.explanation,
          };
        }
      }
      setSnapshot(refreshed);
      setRevealedAnswers((previous) => ({ ...previous, ...answerMap }));
      setRestoreError(restored.some((result) => result.failed)
        ? 'A previously revealed explanation could not be restored. You can continue the session.'
        : null);
    } catch (reason: unknown) {
      if (revision === snapshotRefreshRevision.current) {
        setActionError(practiceErrorMessage(reason, 'The current session state could not be refreshed.'));
      }
    }
  };

  const handleSubmit = async () => {
    if (!snapshot || !currentItem?.question || !currentItemId || pendingItemId || completing) return;
    const choiceId = selectedChoices[currentItemId];
    if (!choiceId) {
      setActionError('Select an answer choice before submitting.');
      return;
    }
    if (isLocked(currentItem)) {
      setActionError('This question is already locked.');
      return;
    }

    setActionError(null);
    setPendingItemId(currentItemId);
    try {
      const result = await submitPracticeAnswer(currentItemId, choiceId);
      snapshotRefreshRevision.current += 1;
      setLastResults((previous) => ({ ...previous, [currentItemId]: result }));
      const submittedAt = new Date().toISOString();
      setSnapshot((previous) => previous
        ? {
          ...previous,
          items: previous.items.map((item) => item.id === currentItemId
            ? { ...item, revealedAt: item.revealedAt ?? submittedAt }
            : item),
        }
        : previous);
      setRevealedAnswers((previous) => ({
        ...previous,
        [currentItemId]: {
          correctChoiceId: result.correctChoiceId,
          explanation: result.explanation,
        },
      }));
      await refreshSnapshot();
    } catch (reason: unknown) {
      setActionError(practiceErrorMessage(reason, 'Your answer could not be submitted. Please try again.'));
      if (
        isRecord(reason) &&
        typeof reason.message === 'string' &&
        ['already_answered', 'already_revealed', 'item_unavailable', 'session_not_in_progress'].includes(reason.message)
      ) {
        void refreshSnapshot();
      }
    } finally {
      setPendingItemId(null);
    }
  };

  const handleReveal = async () => {
    if (!currentItemId || !currentItem?.question || pendingItemId || completing) return;
    setActionError(null);
    setPendingItemId(currentItemId);
    try {
      const answer = await revealPracticeAnswer(currentItemId);
      snapshotRefreshRevision.current += 1;
      setRevealedAnswers((previous) => ({
        ...previous,
        [currentItemId]: {
          correctChoiceId: answer.correctChoiceId,
          explanation: answer.explanation,
        },
      }));
      setSelectedChoices((previous) => ({ ...previous, [currentItemId]: '' }));
      setSnapshot((previous) => previous
        ? {
          ...previous,
          items: previous.items.map((item) => item.id === currentItemId
            ? { ...item, revealedAt: item.revealedAt ?? new Date().toISOString() }
            : item),
        }
        : previous);
    } catch (reason: unknown) {
      setActionError(practiceErrorMessage(reason, 'The answer could not be revealed. Please try again.'));
      void refreshSnapshot();
    } finally {
      setPendingItemId(null);
    }
  };

  const handleComplete = async () => {
    if (!snapshot || completing || pendingItemId) return;
    snapshotRefreshRevision.current += 1;
    setActionError(null);
    setCompleting(true);
    try {
      await completePracticeSession(snapshot.id);
      setConfirmFinish(false);
      const completedSnapshot = await loadPracticeSession(snapshot.id);
      setSnapshot(completedSnapshot);
    } catch (reason: unknown) {
      setActionError(practiceErrorMessage(
        reason,
        'The session may be complete, but its saved review could not be loaded. Please refresh to try again.',
      ));
      if (isRecord(reason) && reason.message === 'session_not_in_progress') {
        void refreshSnapshot();
      }
    } finally {
      setCompleting(false);
    }
  };

  if (authLoading || loading) {
    return <p className="card py-10 text-center text-slate-600" role="status" aria-live="polite">Loading practice session…</p>;
  }
  if (loadError || !snapshot) {
    return (
      <section className="card" role="alert">
        <h1 className="text-2xl font-semibold">Practice session unavailable</h1>
        <p className="mt-2 text-slate-600">{loadError ?? 'This session is unavailable.'}</p>
        <Link to="/practice" className="btn-primary mt-5 inline-flex">Back to Practice</Link>
      </section>
    );
  }
  if (snapshot.status === 'completed') {
    return <SessionResults snapshot={snapshot} />;
  }
  if (!currentItem || items.length === 0) {
    return (
      <section className="card">
        <h1 className="text-2xl font-semibold">No questions in this session</h1>
        <p className="mt-2 text-slate-600">This session has no available items. No question data was substituted.</p>
        <button type="button" className="btn-primary mt-5" onClick={() => void handleComplete()} disabled={completing}>
          {completing ? 'Completing…' : 'Complete session'}
        </button>
      </section>
    );
  }

  const lastResult = lastResults[currentItem.id];
  const latest = latestAttempt(currentItem);
  const locked = isLocked(currentItem);
  const canAnswer = Boolean(currentItem.question) && !locked;
  const currentAnswer = revealedAnswers[currentItem.id];
  const unavailableCount = items.filter((item) => !item.question).length;
  const unresolvedCount = items.filter(isItemUnresolved).length;

  const right = (
    <div className="mx-auto max-w-xl">
      {!currentItem.question ? (
        <div className="rounded-xl border border-sun-300 bg-sun-100 p-4 text-amber-900">
          This question version is no longer approved or is unavailable. It will be handled by the database when the session is completed.
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label="Answer choices" className="space-y-2">
            {currentItem.choices.map((choice) => {
              const label = String.fromCharCode(64 + choice.displayOrder);
              const selected = selectedChoices[currentItem.id] === choice.id;
              const submitted = latest?.selectedChoiceId === choice.id ||
                (Boolean(lastResult) && selected);
              const correct = currentAnswer?.correctChoiceId === choice.id;
              const className = correct
                ? 'border-mint-600 bg-mint-100'
                : submitted
                  ? 'border-coral-600 bg-coral-100'
                  : selected
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-slate-300 bg-white hover:border-brand-600/60';
              return (
                <button
                  key={choice.id}
                  type="button"
                  role="radio"
                  aria-checked={selected || submitted}
                  disabled={!canAnswer || pendingItemId !== null}
                  onClick={() => {
                    setActionError(null);
                    setSelectedChoices((previous) => ({ ...previous, [currentItem.id]: choice.id }));
                  }}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left text-base ${className} disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-current text-sm font-semibold">
                    {label}
                  </span>
                  <span className="min-w-0 flex-1 break-words leading-6"><RichText text={choice.content} /></span>
                  {submitted && (
                    <span className={`text-sm font-semibold ${correct ? 'text-mint-600' : 'text-coral-600'}`}>
                      Your answer
                    </span>
                  )}
                  {correct && <span className="text-sm font-semibold text-mint-600">Correct answer</span>}
                </button>
              );
            })}
          </div>

          {lastResult && (
            <div className={`mt-5 rounded-xl border-2 p-4 ${lastResult.result === 'correct' ? 'border-mint-600 bg-mint-100' : 'border-coral-600 bg-coral-100'}`} role="status" aria-live="polite">
              <p className="font-semibold">
                {lastResult.result === 'correct'
                  ? 'Your answer is correct.'
                  : 'Your answer is incorrect. The correct answer and explanation are shown below.'}
              </p>
            </div>
          )}
          {!lastResult && latest && (
            <div className={`mt-5 rounded-xl border-2 p-4 ${latest.isCorrect ? 'border-mint-600 bg-mint-100' : 'border-coral-600 bg-coral-100'}`} role="status">
              <p className="font-semibold">
                {latest.isCorrect
                  ? 'Your answer is correct.'
                  : 'Your answer is incorrect. The correct answer and explanation are shown below.'}
              </p>
            </div>
          )}

          {currentAnswer && (
            <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50 p-4">
              <p className="font-semibold text-brand-700">
                Correct answer: {choiceLabel(currentItem, currentAnswer.correctChoiceId)}
              </p>
              <p className="mt-2 whitespace-pre-wrap leading-6 text-slate-800"><RichText text={currentAnswer.explanation} /></p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {canAnswer && (
              <>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleSubmit()}
                  disabled={!selectedChoices[currentItem.id] || pendingItemId !== null}
                >
                  {pendingItemId === currentItem.id ? 'Submitting…' : 'Submit answer'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleReveal()}
                  disabled={pendingItemId !== null}
                >
                  {pendingItemId === currentItem.id ? 'Please wait…' : 'Reveal answer'}
                </button>
              </>
            )}
            {Boolean(lastResult || latest || currentAnswer) && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => currentIndex < items.length - 1
                  ? setCurrentItemId(items[currentIndex + 1].id)
                  : setConfirmFinish(true)}
                disabled={pendingItemId !== null || completing}
              >
                {currentIndex < items.length - 1 ? 'Next Question' : 'Complete session'}
              </button>
            )}
          </div>
        </>
      )}
      {actionError && (
        <p className="mt-4 rounded-xl border border-coral-100 bg-coral-100 p-3 text-coral-600" role="alert">
          {actionError}
        </p>
      )}
    </div>
  );

  const left = currentItem.question ? (
    <div className="mx-auto max-w-2xl">
      <HighlightArea
        key={`${currentItem.question.id}@${currentItem.question.versionNumber}`}
        id={currentItem.question.id}
        version={currentItem.question.versionNumber}
      >
        {(highlights) => (
          <>
            {currentItem.question?.passage && (
              <div data-field="passage" className="mb-5 whitespace-pre-wrap font-serif text-base leading-7 text-slate-900">
                <RichText text={currentItem.question.passage} ranges={highlights.passage} field="passage" />
              </div>
            )}
            <p
              data-field="prompt"
              className={currentItem.question?.passage
                ? 'whitespace-pre-wrap text-base font-semibold leading-7'
                : 'whitespace-pre-wrap text-lg leading-7'}
            >
              <RichText text={currentItem.question?.stem ?? ''} ranges={highlights.prompt} field="prompt" />
            </p>
          </>
        )}
      </HighlightArea>
    </div>
  ) : (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-xl font-semibold">Question unavailable</h2>
      <p className="mt-2 text-slate-600">This version is not visible under the approved-question policy.</p>
    </div>
  );

  return (
    <>
      <ExamShell
        title="SAT Practice"
        index={currentIndex}
        total={items.length}
        scrollKey={currentItem.id}
        notification={(restoreError || (showShortfallNotice && requestedCount !== null)) ? (
          <div className="flex items-center justify-between gap-3" role="status" aria-live="polite">
            <div className="space-y-1">
              {restoreError && <p>{restoreError}</p>}
              {showShortfallNotice && requestedCount !== null && (
                <p>Only {items.length} approved questions matched; the session contains fewer than the {requestedCount} requested.</p>
              )}
            </div>
            {showShortfallNotice && requestedCount !== null && (
              <button type="button" className="shrink-0 rounded px-2 py-1 font-semibold underline" onClick={() => setShowShortfallNotice(false)}>
                Dismiss
              </button>
            )}
          </div>
        ) : undefined}
        flagged={Boolean(flags[currentItem.id])}
        onFlag={() => setFlags((previous) => ({ ...previous, [currentItem.id]: !previous[currentItem.id] }))}
        onPrev={() => setCurrentItemId(items[currentIndex - 1]?.id ?? currentItem.id)}
        onNext={() => setCurrentItemId(items[currentIndex + 1]?.id ?? currentItem.id)}
        canPrev={currentIndex > 0}
        canNext={currentIndex < items.length - 1}
        items={nav}
        onJump={(index) => setCurrentItemId(items[index]?.id ?? currentItem.id)}
        onFinish={() => setConfirmFinish(true)}
        finishLabel="Complete session"
        onExit={() => navigate('/practice')}
        left={left}
        right={right}
        dialogs={confirmFinish && (
          <ConfirmDialog
            title="Complete this practice session?"
            confirmLabel={completing ? 'Completing…' : 'Complete session'}
            cancelLabel="Keep practicing"
            onConfirm={() => void handleComplete()}
            onCancel={() => {
              if (!completing) setConfirmFinish(false);
            }}
          >
            <p>
              {unresolvedCount > 0
                ? `${unresolvedCount} question${unresolvedCount === 1 ? ' is' : 's are'} still unresolved. The database will calculate skipped and unavailable items when the session is completed.`
                : 'All available questions are locked or resolved.'}
            </p>
            {unavailableCount > 0 && <p>{unavailableCount} question{unavailableCount === 1 ? ' is' : 's are'} currently unavailable.</p>}
            {actionError && <p className="text-coral-600" role="alert">{actionError}</p>}
          </ConfirmDialog>
        )}
      />
    </>
  );
}

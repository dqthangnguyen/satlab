import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import RichText from './RichText';

export type QuestionReviewStatus =
  | 'Correct'
  | 'Incorrect'
  | 'Unanswered'
  | 'Skipped'
  | 'Revealed, not answered'
  | 'Unavailable';

export interface ReviewChoice {
  id: string;
  label: string;
  text: string;
}

export interface ReviewAttempt {
  number: number;
  answer: string;
  choiceId: string | null;
  isCorrect: boolean;
}

interface Props {
  number: number;
  status: QuestionReviewStatus;
  prompt: ReactNode;
  questionContent: ReactNode;
  choices: ReviewChoice[];
  attempts: ReviewAttempt[];
  yourAnswer: string | null;
  correctAnswer: string | null;
  correctChoiceId: string | null;
  answerUnavailableMessage?: string;
  explanation: string | null;
  explanationUnavailableMessage?: string;
}

const statusClass: Record<QuestionReviewStatus, string> = {
  Correct: 'border-mint-600 bg-mint-100 text-mint-600',
  Incorrect: 'border-coral-600 bg-coral-100 text-coral-600',
  Unanswered: 'border-slate-200 bg-slate-100 text-slate-700',
  Skipped: 'border-slate-200 bg-slate-100 text-slate-700',
  'Revealed, not answered': 'border-brand-100 bg-brand-50 text-brand-700',
  Unavailable: 'border-sun-300 bg-sun-100 text-amber-900',
};

function AnswerComparison({
  status,
  yourAnswer,
  correctAnswer,
  answerUnavailableMessage,
}: Pick<Props, 'status' | 'yourAnswer' | 'correctAnswer' | 'answerUnavailableMessage'>) {
  const yourAnswerClass = status === 'Correct'
    ? 'border-mint-600 bg-mint-100'
    : status === 'Incorrect'
      ? 'border-coral-600 bg-coral-100'
      : 'border-slate-200 bg-white';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <section className={`min-w-0 rounded-lg border p-3 ${yourAnswerClass}`}>
        <h4 className="text-sm font-semibold text-slate-700">Your Answer</h4>
        <p className="mt-1 whitespace-pre-wrap break-words text-base text-slate-900">
          <RichText text={yourAnswer ?? 'No answer submitted'} />
        </p>
      </section>
      <section className={`min-w-0 rounded-lg border p-3 ${correctAnswer ? 'border-mint-600 bg-mint-100' : 'border-slate-200 bg-white'}`}>
        <h4 className="text-sm font-semibold text-slate-700">Correct Answer</h4>
        <p className="mt-1 whitespace-pre-wrap break-words text-base text-slate-900">
          <RichText text={correctAnswer ?? 'Unavailable after completion'} />
        </p>
        {!correctAnswer && answerUnavailableMessage && (
          <p className="mt-1 text-sm text-slate-600">{answerUnavailableMessage}</p>
        )}
      </section>
    </div>
  );
}

function QuestionExplanationModal({
  onClose,
  ...review
}: Props & { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const submittedAnswer = review.attempts.reduce<ReviewAttempt | null>(
    (latest, attempt) => !latest || attempt.number > latest.number ? attempt : latest,
    null,
  );

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.scrollTo(0, scrollY);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="question-review-modal-title"
        tabIndex={-1}
        className="flex h-[calc(100dvh-1rem)] max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:h-auto"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="question-review-modal-title" className="text-xl font-semibold text-slate-900">
              Question {review.number}
            </h2>
            <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${statusClass[review.status]}`}>
              {review.status}
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
            aria-label="Close explanation"
            onClick={onClose}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <section>
            <h3 className="mb-2 font-semibold text-slate-900">Question</h3>
            {review.questionContent}
          </section>

          {review.choices.length > 0 && (
            <section>
              <h3 className="mb-2 font-semibold text-slate-900">Answer choices</h3>
              <ul className="space-y-2">
                {review.choices.map((choice) => {
                  const isYourAnswer = submittedAnswer?.choiceId === choice.id;
                  const isCorrect = review.correctChoiceId === choice.id;
                  const rowClass = isCorrect
                    ? 'border-mint-600 bg-mint-100'
                    : isYourAnswer && review.status === 'Incorrect'
                      ? 'border-coral-600 bg-coral-100'
                      : 'border-slate-200 bg-white';
                  return (
                    <li key={choice.id} className={`flex flex-wrap items-start gap-3 rounded-lg border p-3 ${rowClass}`}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current text-sm font-semibold">
                        {choice.label}
                      </span>
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-6">
                        <RichText text={choice.text} />
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {isYourAnswer && (
                          <span className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-slate-700">
                            Your Answer
                          </span>
                        )}
                        {isCorrect && (
                          <span className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-mint-600">
                            Correct Answer
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 font-semibold text-slate-900">Explanation</h3>
            {review.explanation ? (
              <p className="whitespace-pre-wrap leading-7 text-slate-700"><RichText text={review.explanation} /></p>
            ) : (
              <p className="text-sm text-slate-600">
                {review.explanationUnavailableMessage ?? 'The explanation is unavailable for this completed question.'}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function QuestionReview({
  number,
  status,
  prompt,
  questionContent,
  choices,
  attempts,
  yourAnswer,
  correctAnswer,
  correctChoiceId,
  answerUnavailableMessage,
  explanation,
  explanationUnavailableMessage,
}: Props) {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const closeExplanation = useCallback(() => setExplanationOpen(false), []);

  return (
    <article className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Question {number}</h3>
        <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${statusClass[status]}`}>
          {status}
        </span>
      </div>

      <div className="mt-3 whitespace-pre-wrap text-base leading-7 text-slate-900">{prompt}</div>
      <div className="mt-4">
        <AnswerComparison
          status={status}
          yourAnswer={yourAnswer}
          correctAnswer={correctAnswer}
          answerUnavailableMessage={answerUnavailableMessage}
        />
      </div>

      <button
        type="button"
        className="mt-3 text-sm font-semibold text-brand-700 underline"
        aria-haspopup="dialog"
        onClick={() => setExplanationOpen(true)}
      >
        Show Explanation
      </button>

      {explanationOpen && (
        <QuestionExplanationModal
          number={number}
          status={status}
          prompt={prompt}
          questionContent={questionContent}
          choices={choices}
          attempts={attempts}
          yourAnswer={yourAnswer}
          correctAnswer={correctAnswer}
          correctChoiceId={correctChoiceId}
          answerUnavailableMessage={answerUnavailableMessage}
          explanation={explanation}
          explanationUnavailableMessage={explanationUnavailableMessage}
          onClose={closeExplanation}
        />
      )}
    </article>
  );
}

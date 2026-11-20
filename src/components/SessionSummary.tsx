import { Link } from 'react-router-dom';
import { BarList, ErrorList } from './Breakdowns';
import { PageHeader, Stat } from './ui';
import FeedbackCard from './FeedbackCard';
import { summarize } from '../lib/stats';
import { describeSession } from '../lib/practice';
import { getQuestion } from '../lib/questionBank';
import { correctLabel, responseLabel } from '../lib/questionUtils';
import RichText from './RichText';
import { QuestionContent } from './QuestionParts';
import QuestionReview from './QuestionReview';
import type { QuestionReviewStatus, ReviewAttempt } from './QuestionReview';
import type { Attempt, PracticeSession } from '../types';

export default function SessionSummary({ session, attempts, unanswered = 0 }: { session: PracticeSession; attempts: Attempt[]; unanswered?: number }) {
  const s = summarize(attempts);
  const questionReviews = session.questionIds.map((questionId) => {
    const q = getQuestion(questionId);
    const submitted = attempts
      .filter((attempt): attempt is Attempt & { response: string } =>
        attempt.questionId === questionId && typeof attempt.response === 'string' && attempt.response.trim() !== '')
      .sort((left, right) => left.at - right.at);
    const latest = submitted[submitted.length - 1];
    const answerText = (response: string) => {
      if (q?.answer.kind === 'choice') {
        const choice = q.choices?.find((item) => item.id === response);
        return choice ? `${response} — ${choice.text}` : responseLabel(q, response);
      }
      return q ? responseLabel(q, response) : response;
    };
    const correctChoiceId = q?.answer.kind === 'choice' ? q.answer.choiceId : null;
    const correctAnswer = q
      ? correctChoiceId
        ? `${correctChoiceId} — ${q.choices?.find((item) => item.id === correctChoiceId)?.text ?? correctLabel(q)}`
        : correctLabel(q)
      : null;
    const reviewAttempts: ReviewAttempt[] = submitted.map((attempt, index) => ({
      number: index + 1,
      answer: answerText(attempt.response),
      choiceId: q?.answer.kind === 'choice' ? attempt.response : null,
      isCorrect: attempt.isCorrect,
    }));
    const explanation = q
      ? [q.explanation.short, ...(q.explanation.steps ?? [])].filter((part) => part.trim() !== '').join('\n\n')
      : '';
    const status: QuestionReviewStatus = !q
      ? 'Unavailable'
      : !latest
        ? 'Unanswered'
        : latest.isCorrect ? 'Correct' : 'Incorrect';

    return {
      questionId,
      q,
      status,
      attempts: reviewAttempts,
      yourAnswer: latest ? answerText(latest.response) : null,
      correctAnswer,
      correctChoiceId,
      explanation: explanation || null,
    };
  });

  return (
    <div>
      <PageHeader title="Practice summary" subtitle={`${describeSession(session)}${unanswered > 0 ? `. ${unanswered} question${unanswered === 1 ? ' was' : 's were'} not answered and not counted.` : ''}`}>
        <div className="flex gap-3"><Link to="/mistakes" className="btn-secondary">Review mistakes</Link><Link to="/practice" className="btn-primary">Practice again</Link></div>
      </PageHeader>
      <FeedbackCard correct={s.correct} total={s.total} />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Total questions" value={session.questionIds.length} />
        <Stat label="Answered questions" value={s.total} />
        <Stat label="Correct" value={`${s.correct} / ${s.total}`} />
        <Stat label="Incorrect" value={s.total - s.correct} />
        <Stat label="Accuracy" value={`${s.acc}%`} />
      </div>
      <h2 className="mb-3 text-xl font-semibold">Question review</h2>
      <ul className="mb-8 space-y-3">
        {questionReviews.map((review, index) => (
          <li key={review.questionId}>
            <QuestionReview
              number={index + 1}
              status={review.status}
              prompt={review.q ? (
                <>
                  {review.q.passage && <p className="mb-2 whitespace-pre-wrap font-serif text-slate-800"><RichText text={review.q.passage} /></p>}
                  <RichText text={review.q.prompt} />
                </>
              ) : <p>Question content is unavailable in this browser.</p>}
              questionContent={review.q ? <QuestionContent q={review.q} /> : <p>Question content is unavailable in this browser.</p>}
              choices={review.q?.choices?.map((choice) => ({ id: choice.id, label: choice.id, text: choice.text })) ?? []}
              attempts={review.attempts}
              yourAnswer={review.yourAnswer}
              correctAnswer={review.correctAnswer}
              correctChoiceId={review.correctChoiceId}
              answerUnavailableMessage={!review.q ? 'The question data is no longer available in this browser.' : undefined}
              explanation={review.explanation}
              explanationUnavailableMessage={!review.q ? 'The question data is no longer available in this browser.' : undefined}
            />
          </li>
        ))}
      </ul>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card"><h2 className="mb-4 text-xl font-semibold">By domain</h2><BarList items={s.domains} /></section>
        <section className="card">
          <h2 className="mb-4 text-xl font-semibold">By error type</h2>
          {s.errors.length ? <ErrorList items={s.errors} /> : <p className="text-sm text-slate-600">{s.correct === s.total ? 'No mistakes in this session.' : 'No error types were recorded for the mistakes.'}</p>}
        </section>
      </div>
    </div>
  );
}

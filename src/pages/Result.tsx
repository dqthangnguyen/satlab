import { Link, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { fmtTime, pct, scoreResult } from '../lib/stats';
import { getQuestion } from '../lib/questionBank';
import { correctLabel, isCorrect, responseLabel } from '../lib/questionUtils';
import { sectionLabel } from '../data/taxonomy';
import RichText from '../components/RichText';
import { QuestionContent } from '../components/QuestionParts';
import QuestionReview from '../components/QuestionReview';
import type { QuestionReviewStatus } from '../components/QuestionReview';
import FeedbackCard from '../components/FeedbackCard';
import { Empty, PageHeader, Stat } from '../components/ui';

export default function Result() {
  const { id } = useParams();
  const { results } = useStore();
  const r = results.find((x) => x.id === id);
  if (!r) return <Empty title="Result not found" text="This result is not stored in this browser." to="/tests" cta="Go to tests" />;
  const sc = scoreResult(r);
  const rows = Object.entries(r.answers).map(([id, sel]) => ({ id, q: getQuestion(id), sel }));
  const knownRows = rows.filter((row): row is typeof row & { q: NonNullable<typeof row.q> } => row.q !== undefined);
  const sections = (['reading-writing', 'math'] as const).map((s) => {
    const x = knownRows.filter((w) => w.q.section === s);
    return { s, total: x.length, c: x.filter((w) => isCorrect(w.q, w.sel)).length };
  }).filter((x) => x.total);

  const answerText = (q: NonNullable<(typeof rows)[number]['q']>, response: string | null) => {
    if (response === null || response.trim() === '') return null;
    if (q.answer.kind === 'choice') {
      const choice = q.choices?.find((item) => item.id === response);
      return choice ? `${response} — ${choice.text}` : responseLabel(q, response);
    }
    return responseLabel(q, response);
  };

  const correctAnswerText = (q: NonNullable<(typeof rows)[number]['q']>) => {
    if (q.answer.kind === 'choice') {
      const correctChoiceId = q.answer.choiceId;
      const choice = q.choices?.find((item) => item.id === correctChoiceId);
      return choice ? `${correctChoiceId} — ${choice.text}` : correctLabel(q);
    }
    return correctLabel(q);
  };

  return (
    <div>
      <PageHeader title="Test result" subtitle={r.title}>
        <div className="flex gap-3"><Link to={`/tests/${r.testId}`} className="btn-secondary">Try again</Link><Link to="/mistakes" className="btn-primary">Review mistakes</Link></div>
      </PageHeader>
      <FeedbackCard correct={sc.correct} total={sc.total} />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Score" value={`${sc.pct}%`} hint={`${sc.correct} of ${sc.total} correct`} />
        <Stat label="Total time" value={fmtTime(r.durationSec)} />
        <Stat label="Average per question" value={sc.total ? fmtTime(Math.round(r.durationSec / sc.total)) : '-'} />
        {sections.map((s) => <Stat key={s.s} label={sectionLabel(s.s)} value={`${pct(s.c, s.total)}%`} hint={`${s.c} of ${s.total} correct`} />).slice(0, 1)}
      </div>
      <h2 className="mb-3 text-xl font-semibold">Question review</h2>
      <ul className="space-y-3">
        {rows.map(({ id, q, sel }, n) => {
          const hasAnswer = sel !== null && sel.trim() !== '';
          const status: QuestionReviewStatus = !q
            ? 'Unavailable'
            : !hasAnswer
              ? 'Unanswered'
              : isCorrect(q, sel) ? 'Correct' : 'Incorrect';
          const correctChoiceId = q?.answer.kind === 'choice' ? q.answer.choiceId : null;
          const userAnswer = q && hasAnswer ? answerText(q, sel) : null;
          const correctAnswer = q ? correctAnswerText(q) : null;
          const attempts = q && hasAnswer
            ? [{
                number: 1,
                answer: userAnswer ?? '',
                choiceId: q.answer.kind === 'choice' ? sel : null,
                isCorrect: isCorrect(q, sel),
              }]
            : [];
          const explanation = q
            ? [q.explanation.short, ...(q.explanation.steps ?? [])].filter((part) => part.trim() !== '').join('\n\n')
            : null;

          return (
            <li key={id}>
              <QuestionReview
                number={n + 1}
                status={status}
                prompt={q ? (
                  <>
                    {q.passage && <p className="mb-2 whitespace-pre-wrap font-serif text-slate-800"><RichText text={q.passage} /></p>}
                    <RichText text={q.prompt} />
                  </>
                ) : <p>Question content is unavailable in this browser.</p>}
                questionContent={q ? <QuestionContent q={q} /> : <p>Question content is unavailable in this browser.</p>}
                choices={q?.choices?.map((choice) => ({ id: choice.id, label: choice.id, text: choice.text })) ?? []}
                attempts={attempts}
                yourAnswer={userAnswer}
                correctAnswer={correctAnswer}
                correctChoiceId={correctChoiceId}
                answerUnavailableMessage={!q ? 'The question data is no longer available in this browser.' : undefined}
                explanation={explanation || null}
                explanationUnavailableMessage={!q ? 'The question data is no longer available in this browser.' : undefined}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

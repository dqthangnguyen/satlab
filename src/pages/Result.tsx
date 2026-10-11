import { Link, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { fmtTime, pct, scoreResult } from '../lib/stats';
import { getQuestion } from '../lib/questionBank';
import { correctLabel, isCorrect, responseLabel } from '../lib/questionUtils';
import { sectionLabel } from '../data/taxonomy';
import RichText from '../components/RichText';
import FeedbackCard from '../components/FeedbackCard';
import { Badge, Empty, PageHeader, Stat } from '../components/ui';

export default function Result() {
  const { id } = useParams();
  const { results } = useStore();
  const r = results.find((x) => x.id === id);
  if (!r) return <Empty title="Result not found" text="This result is not stored in this browser." to="/tests" cta="Go to tests" />;
  const sc = scoreResult(r);
  const rows = Object.entries(r.answers).map(([qid, sel]) => ({ q: getQuestion(qid)!, sel })).filter((x) => x.q);
  const sections = (['reading-writing', 'math'] as const).map((s) => {
    const x = rows.filter((w) => w.q.section === s);
    return { s, total: x.length, c: x.filter((w) => isCorrect(w.q, w.sel)).length };
  }).filter((x) => x.total);
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
      <h2 className="mb-3 text-xl font-semibold">Review</h2>
      <ul className="space-y-3">
        {rows.map(({ q, sel }, n) => (
          <li key={q.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-lg font-medium">{n + 1}. <RichText text={q.prompt} /></p>
              <Badge tone={isCorrect(q, sel) ? 'green' : 'red'}>{sel === null ? 'Unanswered' : isCorrect(q, sel) ? 'Correct' : 'Incorrect'}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-600">Your answer: <RichText text={responseLabel(q, sel)} />. Correct answer: <RichText text={correctLabel(q)} />.</p>
            <details className="mt-2"><summary className="cursor-pointer text-sm font-medium text-brand-700">Show explanation</summary><p className="mt-2 text-sm leading-6 text-slate-700"><RichText text={q.explanation.short} /></p></details>
          </li>
        ))}
      </ul>
    </div>
  );
}

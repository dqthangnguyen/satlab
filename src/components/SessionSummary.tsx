import { Link } from 'react-router-dom';
import { BarList, ErrorList } from './Breakdowns';
import { PageHeader, Stat } from './ui';
import FeedbackCard from './FeedbackCard';
import { fmtTime, summarize } from '../lib/stats';
import { describeSession } from '../lib/practice';
import type { Attempt, PracticeSession } from '../types';

export default function SessionSummary({ session, attempts, unanswered = 0 }: { session: PracticeSession; attempts: Attempt[]; unanswered?: number }) {
  const s = summarize(attempts);
  return (
    <div>
      <PageHeader title="Practice summary" subtitle={`${describeSession(session)}${unanswered > 0 ? `. ${unanswered} question${unanswered === 1 ? ' was' : 's were'} not answered and not counted.` : ''}`}>
        <div className="flex gap-3"><Link to="/mistakes" className="btn-secondary">Review mistakes</Link><Link to="/practice" className="btn-primary">Practice again</Link></div>
      </PageHeader>
      <FeedbackCard correct={s.correct} total={s.total} />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Correct" value={`${s.correct} / ${s.total}`} />
        <Stat label="Accuracy" value={`${s.acc}%`} />
        <Stat label="Total time" value={s.time.count ? fmtTime(s.time.totalSec) : 'Not recorded'} />
        <Stat label="Average per question" value={s.time.avgSec === null ? 'Not recorded' : fmtTime(s.time.avgSec)} />
      </div>
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

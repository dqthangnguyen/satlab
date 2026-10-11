import { Link } from 'react-router-dom';
import { tests } from '../data/tests';
import { useStore } from '../lib/store';
import { scoreResult } from '../lib/stats';
import { Badge, PageHeader } from '../components/ui';

export default function Tests() {
  const { results } = useStore();
  return (
    <div>
      <PageHeader title="Tests" subtitle="Timed sets. Review every answer when you finish." />
      <div className="grid gap-4 md:grid-cols-3">
        {tests.map((t) => {
          const prev = [...results].reverse().find((r) => r.testId === t.id);
          return (
            <div key={t.id} className="card flex flex-col">
              <h2 className="font-sans text-base font-semibold">{t.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{t.description}</p>
              <div className="mt-4 flex flex-wrap gap-2"><Badge>{t.questionIds.length} questions</Badge><Badge>{t.minutes} minutes</Badge>{prev && <Badge tone="brand">Last: {scoreResult(prev).pct}%</Badge>}</div>
              <Link to={`/tests/${t.id}`} className="btn-primary mt-5">{prev ? 'Try again' : 'Start'}</Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

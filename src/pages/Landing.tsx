import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { buildProfile } from '../lib/learnerProfile';
import { latest } from '../lib/stats';
import { recentAccuracy, uniqueQuestions } from '../lib/metrics';

const Icon = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const cards = [
  ['Practice', 'Pick a skill and work at your own pace.', '/practice', 'Start practice', 'border-t-brand-600', 'bg-brand-50 text-brand-700', 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  ['Timed tests', 'Mini tests with a clock and full review.', '/tests', 'Take a test', 'border-t-sun-300', 'bg-sun-100 text-amber-900', 'M12 6v6l4 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'],
  ['Mistakes', 'Every missed question in one place.', '/mistakes', 'Review mistakes', 'border-t-coral-600', 'bg-coral-100 text-coral-600', 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5'],
  ['Progress', 'See which skills need attention.', '/dashboard', 'View progress', 'border-t-mint-600', 'bg-mint-100 text-mint-600', 'M3 3v18h18M7 15l4-4 3 3 5-6'],
];

function ContinueLearning() {
  const { attempts, sessions } = useStore();
  const profile = useMemo(() => buildProfile(attempts), [attempts]);
  if (attempts.length === 0)
    return (
      <section className="card mb-6 flex flex-wrap items-center justify-between gap-4 border-l-[6px] border-l-sun-300">
        <div><h2 className="text-xl font-semibold">New here?</h2><p className="mt-1 text-base text-slate-600">Answer a few questions and SATLab will start showing what to work on.</p></div>
        <Link to="/practice" className="btn-primary">Start your first practice session</Link>
      </section>
    );
  const recent = recentAccuracy(attempts, 10);
  const top = profile.weakSkills[0];
  const mistakes = [...latest(attempts).values()].filter((a) => !a.isCorrect).length;
  const open = [...sessions].reverse().find((s) => attempts.filter((a) => a.sessionId === s.id).length < s.questionIds.length);
  return (
    <section className="card mb-6">
      <h2 className="text-xl font-semibold">Continue learning</h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-3">
        <div><dt className="text-sm text-slate-500">Questions answered</dt><dd className="text-2xl font-semibold text-brand-700">{uniqueQuestions(attempts)}<span className="ml-2 text-sm font-normal text-slate-500">different</span></dd></div>
        <div><dt className="text-sm text-slate-500">Recent accuracy</dt><dd className="text-2xl font-semibold text-brand-700">{recent.pct}%<span className="ml-2 text-sm font-normal text-slate-500">last {recent.count} answers</span></dd></div>
        <div><dt className="text-sm text-slate-500">Skill to practice next</dt><dd className="text-lg font-semibold">{top ? top.label : <span className="text-base font-normal text-slate-600">Not enough data yet</span>}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-3">
        {open ? <Link to={`/practice/session/${open.id}`} className="btn-primary">Continue session</Link> : <Link to="/practice" className="btn-primary">Start practice</Link>}
        {mistakes > 0 && <Link to="/mistakes" className="btn-secondary">Review mistakes ({mistakes})</Link>}
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div>
      <section className="pb-6 pt-2 sm:pb-8 sm:pt-6">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Practice smarter for the SAT.</h1>
        <p className="mt-4 max-w-xl text-xl leading-8 text-slate-600">Solve questions, learn from mistakes, and see what to work on next.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/practice" className="btn-primary px-6">Start practice</Link>
          <Link to="/tests" className="btn-secondary px-6">Take a test</Link>
        </div>
      </section>
      <ContinueLearning />
      <section className="grid gap-4 sm:grid-cols-2">
        {cards.map(([t, d, to, cta, border, tint, icon]) => (
          <Link key={t} to={to} className={`card flex h-full gap-4 border-t-[6px] ${border} transition-shadow hover:shadow-md`}>
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon d={icon} /></span>
            <span className="flex min-w-0 flex-col">
              <span className="font-sans text-xl font-semibold">{t}</span>
              <span className="mt-1 text-base text-slate-600">{d}</span>
              <span className="mt-auto pt-3 font-semibold text-brand-700">{cta}</span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}

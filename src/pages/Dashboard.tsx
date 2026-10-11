import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { byDifficulty, byDomain, bySkill, errorCounts, pct, scoreResult } from '../lib/stats';
import { fmtDuration, mean, timeStats, uniqueQuestions } from '../lib/metrics';
import { RULES, buildProfile } from '../lib/learnerProfile';
import { domainLabel } from '../data/taxonomy';
import { BarList } from '../components/Breakdowns';
import RecommendedNext from '../components/RecommendedNext';
import { Empty, PageHeader, Stat } from '../components/ui';

export default function Dashboard() {
  const { attempts, results, reset } = useStore();
  const profile = useMemo(() => buildProfile(attempts), [attempts]);
  if (!attempts.length) return <Empty title="No data yet" text="Answer a practice question or take a test to see your progress here." to="/practice" cta="Start practice" />;
  const correct = attempts.filter((a) => a.isCorrect).length;
  const scores = results.map(scoreResult).filter((s) => s.total > 0); // a result without questions has no score
  const avgTest = mean(scores.map((s) => s.pct));
  const time = timeStats(attempts);
  const ratio = profile.pacing.paceRatio;
  const errs = errorCounts(attempts);
  const errTotal = errs.reduce((s, e) => s + e.count, 0);
  const top = profile.weakSkills.slice(0, 3);
  const thin = profile.insufficient;
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your progress at a glance.">
        <button className="btn-secondary" onClick={() => window.confirm('Delete all saved answers, tests, practice sessions and notes? This cannot be undone. Your highlights are kept.') && reset()}>Reset data</button>
      </PageHeader>
      <RecommendedNext />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Questions answered" value={attempts.length} hint={`${uniqueQuestions(attempts)} different questions. Retries and tests count.`} />
        <Stat label="Accuracy" value={`${pct(correct, attempts.length)}%`} hint={`${correct} of ${attempts.length} answers correct`} />
        <Stat label="Tests taken" value={results.length} hint={scores.length ? `Latest: ${scores[scores.length - 1].pct}% correct` : 'None scored yet'} />
        <Stat label="Average test score" value={avgTest === null ? 'None' : `${avgTest}%`} hint="Average of each test's % correct" />
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Stat compact label="Average time per question" value={time.avgSec === null ? 'Not available' : fmtDuration(time.avgSec)}
          hint={time.count ? `Practice answers only (${time.count} timed${time.ignored ? `, ${time.ignored} invalid ignored` : ''})${ratio !== null ? `. About ${ratio.toFixed(1)}x the expected time${profile.pacing.pace === 'fast' ? ', faster than expected' : ''}.` : ''}` : 'Recorded in practice sessions, not in tests'} />
        <Stat compact label="Most common error type" value={errs[0] ? errs[0].label : 'Not recorded'}
          hint={errs[0] ? (errTotal < 5 ? `Based on only ${errTotal} recorded mistake${errTotal === 1 ? '' : 's'}. A hint, not a pattern.` : `${errs[0].count} of ${errTotal} mistakes with a reason`) : 'Pick a reason after a wrong answer in practice'} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 text-xl font-semibold">Top skills to practice</h2>
          {top.length ? (
            <ul className="divide-y divide-slate-100">
              {top.map((s) => (
                <li key={s.skill} className="py-3 text-base">
                  <div className="flex justify-between gap-3"><span className="font-semibold">{s.label}</span><span className="shrink-0 text-slate-600">{s.accuracy}% · {s.attempts} attempts</span></div>
                  <p className="text-sm text-slate-500">{domainLabel(s.domain)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-base text-slate-600">None yet. A skill is listed after at least {RULES.minAttempts} answers with accuracy below {RULES.weakBelow}%.</p>}
        </section>
        <section className="card">
          <h2 className="mb-4 text-xl font-semibold">Top error patterns</h2>
          {profile.errorPatterns.length ? (
            <ul className="divide-y divide-slate-100">
              {profile.errorPatterns.slice(0, 3).map((p) => (
                <li key={p.type} className="py-2 text-base">
                  <div className="flex justify-between"><span>{p.label}</span><span className="text-slate-600">{p.count}</span></div>
                  {p.topSkill && <p className="text-sm text-slate-500">Most often in {p.topSkill}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="text-base text-slate-600">No reasons recorded yet.</p>}
        </section>
        <section className="card"><h2 className="mb-4 text-xl font-semibold">Accuracy by domain</h2><BarList items={byDomain(attempts)} /></section>
        <section className="card"><h2 className="mb-4 text-xl font-semibold">Accuracy by skill</h2><BarList items={bySkill(attempts)} /></section>
        <section className="card"><h2 className="mb-4 text-xl font-semibold">Accuracy by difficulty</h2><BarList items={byDifficulty(attempts)} /></section>
        <section className="card">
          <h2 className="mb-4 text-xl font-semibold">Accuracy by confidence</h2>
          {profile.byConfidence.length ? <BarList items={profile.byConfidence} /> : <p className="text-base text-slate-600">No confidence ratings recorded yet.</p>}
        </section>
        <section className="card">
          <h2 className="mb-4 text-xl font-semibold">Skills with not enough data</h2>
          {thin.length ? (
            <>
              <ul className="divide-y divide-slate-100">
                {thin.slice(0, 8).map((s) => <li key={s.skill} className="flex justify-between py-2 text-base"><span>{s.label}</span><span className="text-slate-600">{s.attempts === 0 ? 'Not practiced yet' : `${s.attempts} of ${RULES.minAttempts} answers`}</span></li>)}
              </ul>
              {thin.length > 8 && <p className="mt-2 text-sm text-slate-500">and {thin.length - 8} more</p>}
            </>
          ) : <p className="text-base text-slate-600">Every skill has enough answers to be analyzed.</p>}
        </section>
        <section className="card">
          <h2 className="mb-4 text-xl font-semibold">Recent tests</h2>
          {results.length === 0 ? <p className="text-base text-slate-600">No tests taken yet. <Link to="/tests" className="text-brand-700 underline">Take a test</Link>.</p> : (
            <ul className="divide-y divide-slate-100">
              {[...results].reverse().slice(0, 5).map((r) => {
                const sc = scoreResult(r);
                return <li key={r.id}><Link to={`/results/${r.id}`} className="flex justify-between gap-3 py-3 text-base hover:text-brand-700"><span>{r.title}</span><span className="shrink-0 text-slate-600">{sc.total ? `${sc.pct}%` : 'n/a'} · {new Date(r.at).toLocaleDateString()}</span></Link></li>;
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

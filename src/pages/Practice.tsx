import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { queryQuestions } from '../lib/questionBank';
import { COUNT_OPTIONS, buildQueue, describeSession } from '../lib/practice';
import WeakAreasCard from '../components/WeakAreasCard';
import { domainLabel, sections, skillLabel } from '../data/taxonomy';
import { pct } from '../lib/stats';
import { useStore } from '../lib/store';
import { Badge, PageHeader, Select } from '../components/ui';
import type { Difficulty, PracticeFilters, PracticeSession, SectionId } from '../types';

const uniq = (xs: string[]) => [...new Set(xs)];
const none = (v: string) => (v === 'All' ? undefined : v);

export default function Practice() {
  const { sessions, attempts, startSession } = useStore();
  const nav = useNavigate();
  const [section, setSection] = useState('All');
  const [domain, setDomain] = useState('All');
  const [skill, setSkill] = useState('All');
  const [diff, setDiff] = useState('All');
  const [count, setCount] = useState(10);

  // Dropdowns only offer options that have published questions.
  const domainOpts = uniq(queryQuestions({ section: none(section) as SectionId | undefined }).map((q) => q.domain));
  const skillOpts = uniq(queryQuestions({ section: none(section) as SectionId | undefined, domain: none(domain) }).map((q) => q.skill));
  const filters: PracticeFilters = { section: none(section) as SectionId | undefined, domain: none(domain), skill: none(skill), difficulty: none(diff) as Difficulty | undefined };
  const available = queryQuestions(filters).length;
  const size = Math.min(count, available);

  const start = () => {
    const ids = buildQueue(filters, count);
    if (!ids.length) return;
    const s: PracticeSession = { id: `s${Date.now()}`, createdAt: Date.now(), filters, questionIds: ids };
    startSession(s);
    nav(`/practice/session/${s.id}`);
  };

  return (
    <div>
      <PageHeader title="Practice" subtitle="Pick a focus and start." />
      <WeakAreasCard />
      <h2 className="mb-3 text-xl font-semibold">Custom practice</h2>
      <div className="card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select label="Section" value={section} onChange={(v) => { setSection(v); setDomain('All'); setSkill('All'); }} options={['All', ...sections.map((s) => ({ value: s.id, label: s.label }))]} />
          <Select label="Domain" value={domain} onChange={(v) => { setDomain(v); setSkill('All'); }} options={['All', ...domainOpts.map((d) => ({ value: d, label: domainLabel(d) }))]} />
          <Select label="Skill" value={skill} onChange={setSkill} options={['All', ...skillOpts.map((s) => ({ value: s, label: skillLabel(s) }))]} />
          <Select label="Difficulty" value={diff} onChange={setDiff} options={['All', { value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
          <Select label="Questions" value={String(count)} onChange={(v) => setCount(Number(v))} options={COUNT_OPTIONS.map(String)} />
        </div>
        <p className={`mt-4 text-base ${available < count ? 'rounded-xl border border-amber-200 bg-sun-100 p-3 text-amber-900' : 'text-slate-600'}`}>
          {available === 0 ? 'No published questions match these filters.' : available < count ? `Only ${available} matching question${available === 1 ? ' is' : 's are'} available, so this session will have ${size} (you chose ${count}). Nothing is repeated.` : `${available} questions match. This session will have ${size}.`}
        </p>
        <button className="btn-primary mt-4" disabled={available === 0} onClick={start}>Start practice</button>
      </div>

      {sessions.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold">Recent sessions</h2>
          <ul className="space-y-2">
            {[...sessions].reverse().slice(0, 5).map((s) => {
              const mine = attempts.filter((a) => a.sessionId === s.id);
              const finished = mine.length >= s.questionIds.length;
              return (
                <li key={s.id}>
                  <Link to={`/practice/session/${s.id}`} className="card flex flex-wrap items-center justify-between gap-3 py-4 hover:border-slate-400">
                    <div>
                      <p className="text-[15px] font-medium">{describeSession(s)}</p>
                      <p className="mt-1 text-xs text-slate-500">{new Date(s.createdAt).toLocaleString()} · {s.questionIds.length} questions</p>
                    </div>
                    {finished ? <Badge tone="brand">{pct(mine.filter((a) => a.isCorrect).length, mine.length)}% correct</Badge> : <Badge tone="amber">{mine.length} of {s.questionIds.length} answered. Continue</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

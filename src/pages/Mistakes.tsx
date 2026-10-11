import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { latest } from '../lib/stats';
import { getQuestion } from '../lib/questionBank';
import { correctLabel, responseLabel } from '../lib/questionUtils';
import { domainLabel, sectionLabel, skillLabel } from '../data/taxonomy';
import { confidenceLabel, errorOptions, errorTypeLabel } from '../lib/labels';
import { Badge, Empty, PageHeader, Select } from '../components/ui';
import RichText from '../components/RichText';

export default function Mistakes() {
  const { attempts, notes, setNote } = useStore();
  const [section, setSection] = useState('All');
  const [skill, setSkill] = useState('All');
  const [errType, setErrType] = useState('All');
  const all = [...latest(attempts).values()].filter((a) => !a.isCorrect).reverse()
    .map((a) => ({ a, q: getQuestion(a.questionId)! })).filter((x) => x.q);
  const skillOpts = [...new Set(all.map((x) => x.q.skill))].map((s) => ({ value: s, label: skillLabel(s) }));
  const wrong = all.filter(({ a, q }) =>
    (section === 'All' || sectionLabel(q.section) === section) && (skill === 'All' || q.skill === skill) && (errType === 'All' || (a.errorType ?? 'none') === errType));
  return (
    <div>
      <PageHeader title="Mistakes" subtitle="Missed questions. Answer one correctly and it leaves this list." />
      {all.length === 0 ? <Empty title="No mistakes to review" text="Missed questions appear here automatically after you practice or take a test." to="/practice" cta="Go to practice" /> : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select label="Section" value={section} onChange={setSection} options={['All', 'Reading & Writing', 'Math']} />
            <Select label="Skill" value={skill} onChange={setSkill} options={['All', ...skillOpts]} />
            <Select label="Error type" value={errType} onChange={setErrType} options={['All', ...errorOptions, { value: 'none', label: 'Not recorded' }]} />
          </div>
          {wrong.length === 0 ? <p className="text-sm text-slate-600">No mistakes match these filters.</p> : (
            <ul className="space-y-4">
              {wrong.map(({ a, q }) => (
                <li key={q.id} className="card">
                  <div className="mb-2 flex flex-wrap gap-2"><Badge tone="brand">{sectionLabel(q.section)}</Badge><Badge>{domainLabel(q.domain)}</Badge><Badge>{skillLabel(q.skill)}</Badge></div>
                  {q.passage && <p className="mb-2 font-serif text-[16px] leading-7 text-slate-700"><RichText text={q.passage} /></p>}
                  <p className="text-lg font-medium"><RichText text={q.prompt} /></p>
                  <p className="mt-2 text-sm text-slate-600">Your answer: <RichText text={responseLabel(q, a.response)} />. Correct answer: <RichText text={correctLabel(q)} />.</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Error type: {a.errorType ? errorTypeLabel(a.errorType) : 'Not recorded'} · Time: {a.timeSpentSec !== undefined ? `${a.timeSpentSec}s` : 'Not recorded'} · Confidence: {a.confidence ? confidenceLabel(a.confidence) : 'Not recorded'}
                  </p>
                  <details className="mt-2"><summary className="cursor-pointer text-sm font-medium text-brand-700">Show explanation</summary><p className="mt-2 text-sm leading-6 text-slate-700"><RichText text={q.explanation.short} /></p></details>
                  <label className="mt-4 block text-xs font-medium text-slate-600">Your note
                    <textarea value={notes[q.id] ?? ''} onChange={(e) => setNote(q.id, e.target.value)} rows={2} placeholder="What went wrong, and what will you do differently?" className="mt-1 block w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900" />
                  </label>
                  <div className="mt-4 flex gap-3"><Link to={`/practice/${q.id}`} className="btn-primary">Try again</Link><Link to={`/coach?question=${q.id}`} className="btn-secondary">Ask Coach</Link></div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

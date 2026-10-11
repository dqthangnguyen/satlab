import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { RULES, STATUS_LABEL, STATUS_TONE, buildProfile, shortReason } from '../lib/learnerProfile';
import { planWeakAreas } from '../lib/personalizedPractice';
import { useStartPlan } from '../lib/useStartPlan';
import { domainLabel, sectionLabel } from '../data/taxonomy';
import { Badge } from './ui';

/** The one thing to do next, from real data. With too little data it says so instead of guessing. */
export default function RecommendedNext() {
  const { attempts } = useStore();
  const start = useStartPlan();
  const [msg, setMsg] = useState('');
  const profile = useMemo(() => buildProfile(attempts), [attempts]);
  const top = profile.weakSkills[0];
  if (!top) {
    const p = planWeakAreas(profile, attempts, 10);
    return (
      <section className="card mb-8 border-l-[6px] border-l-sun-300">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recommended next step</p>
        <h2 className="mt-1 text-2xl font-semibold">Keep practicing</h2>
        <p className="mt-2 max-w-2xl text-base leading-7 text-slate-700">{p.ok ? '' : p.reason}</p>
        <Link to="/practice" className="btn-primary mt-4">Start practice</Link>
      </section>
    );
  }
  const go = (skill?: string) => {
    const p = planWeakAreas(profile, attempts, 10, undefined, Date.now(), skill);
    if (p.ok) start(p); else setMsg(p.reason);
  };
  return (
    <section className="card mb-8 border-l-[6px] border-l-coral-600">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recommended next step</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold">{top.label}</h2>
        <Badge tone={STATUS_TONE[top.status]}>{STATUS_LABEL[top.status]}</Badge>
      </div>
      <p className="text-sm text-slate-500">{sectionLabel(top.section)} · {domainLabel(top.domain)}</p>
      <p className="mt-3 text-base"><strong className="text-xl text-brand-700">{top.accuracy}%</strong> accuracy over {top.attempts} attempts. {shortReason(top)}. Skills under {RULES.weakBelow}% are flagged.</p>
      {top.attempts < 2 * RULES.minAttempts && <p className="mt-1 text-sm text-slate-600">This is based on only {top.attempts} answers, so treat it as a suggestion.</p>}
      {msg && <p className="mt-3 rounded-xl border border-amber-200 bg-sun-100 p-3 text-base text-amber-900">{msg}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="btn-primary" onClick={() => go(top.skill)}>Practice this skill</button>
        {profile.weakSkills.length > 1 && <button className="btn-secondary" onClick={() => go()}>Practice all weak areas</button>}
      </div>
    </section>
  );
}

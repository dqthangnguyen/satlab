import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { STATUS_LABEL, STATUS_TONE, buildProfile, explainSkill, shortReason } from '../lib/learnerProfile';
import type { SkillProfile } from '../lib/learnerProfile';
import { WEAK_COUNT_OPTIONS, planWeakAreas } from '../lib/personalizedPractice';
import { useStartPlan } from '../lib/useStartPlan';
import { domainLabel, sectionLabel, sections } from '../data/taxonomy';
import { Badge, Select } from './ui';
import type { SectionId } from '../types';

export default function WeakAreasCard() {
  const { attempts } = useStore();
  const start = useStartPlan();
  const [section, setSection] = useState('All');
  const [count, setCount] = useState(10);
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});
  const sec = section === 'All' ? undefined : (section as SectionId);
  const profile = useMemo(() => buildProfile(attempts), [attempts]);
  // One plan per set of inputs, so what is shown is exactly what starts.
  const plan = useMemo(() => planWeakAreas(profile, attempts, count, sec), [profile, attempts, count, sec]);
  const weak = profile.weakSkills.filter((s) => !sec || s.section === sec);
  const practiceSkill = (s: SkillProfile) => {
    const p = planWeakAreas(profile, attempts, count, sec, Date.now(), s.skill);
    if (p.ok) start(p, sec); else setRowMsg((m) => ({ ...m, [s.skill]: p.reason }));
  };
  const size = plan.ok ? plan.questionIds.length : 0;
  return (
    <section className="card mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Personalized practice</h2>
          <p className="mt-1 text-lg text-slate-600">{weak.length > 0 ? `${weak.length} skill${weak.length === 1 ? ' needs' : 's need'} attention` : 'No skills need attention yet'}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Section" value={section} onChange={setSection} options={['All', ...sections.map((s) => ({ value: s.id, label: s.label }))]} />
          <Select label="Questions" value={String(count)} onChange={(v) => setCount(Number(v))} options={WEAK_COUNT_OPTIONS.map(String)} />
        </div>
      </div>

      {!plan.ok && <p className="mt-4 rounded-xl border border-amber-200 bg-sun-100 p-3 text-base leading-7 text-amber-900">{plan.reason}</p>}
      {plan.ok && plan.available < count && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-sun-100 p-3 text-base leading-7 text-amber-900">Only {plan.available} matching question{plan.available === 1 ? ' is' : 's are'} available, so this session will have {size} (you chose {count}). Nothing is repeated, and only reviewed, published questions are used.</p>
      )}

      {weak.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-200">
          {weak.map((s) => {
            const reasons = (plan.ok ? plan.plan.items.find((i) => i.skill === s.skill)?.reasons : undefined) ?? explainSkill(s);
            return (
              <li key={s.skill} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{s.label}</p>
                    <p className="text-sm text-slate-500">{sectionLabel(s.section)} · {domainLabel(s.domain)}</p>
                  </div>
                  <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-base">
                  <span><strong className="text-xl text-brand-700">{s.accuracy}%</strong> accuracy</span>
                  <span>{s.attempts} attempts</span>
                  <span className="text-slate-600">{shortReason(s)}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-2">
                  <button className="btn-secondary" onClick={() => practiceSkill(s)}>Practice this skill</button>
                  <details className="py-2 text-base">
                    <summary className="cursor-pointer font-semibold text-brand-700">Why this skill?</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 leading-7 text-slate-700">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </details>
                </div>
                {rowMsg[s.skill] && <p className="mt-1 text-sm text-amber-900">{rowMsg[s.skill]}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button className="btn-primary" disabled={!plan.ok} onClick={() => plan.ok && start(plan, sec)}>Practice weak areas</button>
        {plan.ok && <span className="text-base text-slate-600">{size} question{size === 1 ? '' : 's'} ready</span>}
      </div>
      <p className="mt-3 text-sm text-slate-500">Based only on your saved answers. A skill needs at least 3 answers before it can be called weak. This is not a prediction of your SAT score.</p>
    </section>
  );
}

import { skillLabel } from '../data/taxonomy';
import type { SessionPlan } from '../types';

export default function WhyPractice({ plan, hideTitle = false }: { plan: SessionPlan; hideTitle?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      {!hideTitle && <h3 className="text-sm font-semibold">Why this practice?</h3>}
      {plan.items.map((it) => (
        <div key={it.skill} className="mt-3 first:mt-0">
          <p className="text-sm font-medium">{skillLabel(it.skill)}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">{it.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      ))}
      {plan.notes.map((n, i) => <p key={i} className="mt-3 text-sm leading-6 text-slate-700">{n}</p>)}
      <p className="mt-3 text-xs text-slate-500">Based only on the answers saved in this browser. It is not a prediction of your SAT score.</p>
    </div>
  );
}

import type { Breakdown, ErrorCount } from '../lib/stats';

export function BarList({ items }: { items: Breakdown[] }) {
  return (
    <ul className="space-y-4">
      {items.map((t) => (
        <li key={t.key}>
          <div className="mb-1 flex justify-between gap-3 text-sm"><span>{t.label}</span><span className="shrink-0 text-slate-600">{t.acc}% ({t.correct}/{t.total})</span></div>
          <div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${t.acc < 50 ? 'bg-rose-500' : t.acc < 80 ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${t.acc}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
export function ErrorList({ items }: { items: ErrorCount[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((e) => <li key={e.type} className="flex justify-between py-2 text-sm"><span>{e.label}</span><span className="text-slate-600">{e.count}</span></li>)}
    </ul>
  );
}

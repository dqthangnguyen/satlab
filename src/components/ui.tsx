import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Difficulty } from '../types';

const tones = {
  slate: 'bg-slate-100 text-slate-700', green: 'bg-mint-100 text-mint-600', red: 'bg-coral-100 text-coral-600',
  amber: 'bg-sun-100 text-amber-900', brand: 'bg-brand-50 text-brand-700', grape: 'bg-grape-100 text-grape-600',
};
export const Badge = ({ children, tone = 'slate' }: { children: ReactNode; tone?: keyof typeof tones }) => (
  <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-medium ${tones[tone]}`}>{children}</span>
);
export const difficultyTone = (d: Difficulty) => (d === 'hard' ? 'red' : d === 'medium' ? 'amber' : d === 'easy' ? 'green' : 'slate') as keyof typeof tones;

export const PageHeader = ({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) => (
  <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-xl text-lg text-slate-600">{subtitle}</p>}
    </div>
    {children}
  </div>
);
export const Stat = ({ label, value, hint, compact }: { label: string; value: string | number; hint?: string; compact?: boolean }) => (
  <div className="card">
    <p className="text-base text-slate-600">{label}</p>
    <p className={`mt-1 font-semibold tracking-tight text-brand-700 ${compact ? 'text-2xl' : 'text-4xl'}`}>{value}</p>
    {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
  </div>
);
export const Empty = ({ title, text, to, cta }: { title: string; text: string; to: string; cta: string }) => (
  <div className="card py-12 text-center">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sun-100 text-amber-900" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" /><path d="M8 7h6" /></svg>
    </div>
    <h2 className="text-xl font-semibold">{title}</h2>
    <p className="mx-auto mt-2 max-w-md text-base text-slate-600">{text}</p>
    <Link to={to} className="btn-primary mt-6">{cta}</Link>
  </div>
);
export const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[] }) => (
  <label className="block text-sm font-medium text-slate-700">
    {label}
    <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900">
      {options.map((o) => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
);
export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value?: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`min-h-[44px] rounded-xl border-2 px-4 py-2 text-base ${value === o.value ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{o.label}</button>
      ))}
    </div>
  );
}

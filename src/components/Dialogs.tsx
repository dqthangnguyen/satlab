import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { NavItem } from '../lib/examNav';

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    (ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current)?.focus();
    return () => prev?.focus?.();
  }, []);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !ref.current) return;
    const f = [...ref.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={onKey} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel }: { title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <div className="mt-3 space-y-2 text-base leading-7 text-slate-700">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button className="btn-secondary" onClick={onCancel}>{cancelLabel}</button>
        <button className="btn-primary" data-autofocus onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Dialog>
  );
}

export function NavigatorDialog({ items, current, onJump, onFinish, finishLabel, onClose }: { items: NavItem[]; current: number; onJump: (i: number) => void; onFinish: () => void; finishLabel: string; onClose: () => void }) {
  const open = items.filter((x) => !x.answered).length;
  return (
    <Dialog title="Questions" onClose={onClose}>
      <p className="mt-1 text-base text-slate-600">{open === 0 ? 'All questions are answered.' : `${open} not answered yet.`}</p>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {items.map((it, n) => (
          <button key={n} data-autofocus={n === current ? '' : undefined} aria-current={n === current ? 'true' : undefined}
            aria-label={`Question ${n + 1}, ${it.answered ? 'answered' : 'not answered'}${it.flagged ? ', flagged' : ''}`}
            onClick={() => { onJump(n); onClose(); }}
            className={`relative h-12 rounded-xl border-2 text-base font-semibold ${it.answered ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-800'} ${n === current ? 'ring-4 ring-brand-600/30' : ''}`}>
            {n + 1}
            {it.flagged && <span aria-hidden="true" className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-sun-300" />}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-600">Filled: answered. Outlined: not answered. Yellow dot: flagged.</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button className="btn-secondary" onClick={onClose}>Close</button>
        <button className="btn-primary" onClick={() => { onClose(); onFinish(); }}>{finishLabel}</button>
      </div>
    </Dialog>
  );
}

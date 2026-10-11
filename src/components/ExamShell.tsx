import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, NavigatorDialog } from './Dialogs';
import type { NavItem } from '../lib/examNav';

export interface ExamShellProps {
  title: string; index: number; total: number; scrollKey: string;
  timer?: ReactNode; flagged: boolean; onFlag: () => void;
  onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean;
  items: NavItem[]; onJump: (i: number) => void;
  onFinish: () => void; finishLabel?: string; onExit: () => void;
  info?: { label: string; content: ReactNode };
  left: ReactNode; right: ReactNode; dialogs?: ReactNode;
}
const tool = 'inline-flex h-10 items-center rounded-lg border-2 border-slate-300 bg-white px-3 text-base font-semibold text-slate-800 hover:bg-slate-50';

/**
 * Exam-style workspace. A full-screen layer on top of the site: toolbar, two independently scrolling panels, bottom bar.
 * Below 900px wide the panels become two tabs (both stay mounted, so nothing is lost when switching).
 */
export default function ExamShell(p: ExamShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [tab, setTab] = useState<'q' | 'a'>('q');
  const left = useRef<HTMLElement>(null), right = useRef<HTMLElement>(null);
  const saved = useRef(new Map<string, [number, number]>());

  useEffect(() => { // keep keyboard focus and screen readers inside the workspace
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    return () => root?.removeAttribute('inert');
  }, []);
  // Scroll positions are remembered per question as the user scrolls. (Reading them when leaving is too late:
  // by then the next question has rendered and the browser has already reset the scroll.)
  const remember = (side: 0 | 1, top: number) => { const cur = saved.current.get(p.scrollKey) ?? [0, 0]; saved.current.set(p.scrollKey, side === 0 ? [top, cur[1]] : [cur[0], top]); };
  useEffect(() => {
    const [a, b] = saved.current.get(p.scrollKey) ?? [0, 0];
    if (left.current) left.current.scrollTop = a;
    if (right.current) right.current.scrollTop = b;
    setTab('q');
  }, [p.scrollKey]);

  const last = !p.canNext;
  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-white text-slate-900" role="region" aria-label="Question workspace">
      <header className="flex items-center gap-3 border-b-2 border-slate-200 px-3 py-2 sm:px-5">
        <span className="hidden font-serif text-xl font-semibold text-brand-700 sm:block">SATLab</span>
        <p className="flex min-w-0 flex-1 items-baseline gap-1 text-base font-semibold" aria-live="polite"><span className="truncate">{p.title}</span><span className="shrink-0 text-slate-500"><span className="sm:hidden"> · {p.index + 1}/{p.total}</span><span className="hidden sm:inline"> · Question {p.index + 1} of {p.total}</span></span></p>
        {p.timer}
        {p.info && <button className={tool} onClick={() => setInfoOpen(true)}>{p.info.label}</button>}
        <button className={`${tool} ${p.flagged ? 'border-sun-300 bg-sun-100' : ''}`} aria-pressed={p.flagged} onClick={p.onFlag}>{p.flagged ? 'Flagged' : 'Flag'}</button>
        <button className={tool} onClick={p.onExit}>Exit</button>
      </header>

      <div className="flex border-b border-slate-200 min-[900px]:hidden" role="group" aria-label="Show">
        {([['q', 'Question'], ['a', 'Answers']] as const).map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)} className={`h-12 flex-1 border-b-4 text-base font-semibold ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600'}`}>{label}</button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] min-[900px]:grid-cols-2 min-[900px]:divide-x-2 min-[900px]:divide-slate-200">
        <section ref={left} tabIndex={0} onScroll={(e) => remember(0, e.currentTarget.scrollTop)} aria-label="Question" className={`${tab === 'q' ? 'block' : 'hidden'} min-h-0 overflow-y-auto overscroll-contain px-5 py-6 min-[900px]:block min-[900px]:px-8`}>{p.left}</section>
        <section ref={right} tabIndex={0} onScroll={(e) => remember(1, e.currentTarget.scrollTop)} aria-label="Answers" className={`${tab === 'a' ? 'block' : 'hidden'} min-h-0 overflow-y-auto overscroll-contain bg-slate-50 px-5 py-6 min-[900px]:block min-[900px]:px-8`}>{p.right}</section>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t-2 border-slate-200 bg-white px-3 py-2.5 sm:px-5">
        <button className="btn-secondary whitespace-nowrap px-3 sm:px-5" aria-haspopup="dialog" onClick={() => setNavOpen(true)}><span className="sm:hidden">{p.index + 1} of {p.total}</span><span className="hidden sm:inline">Question {p.index + 1} of {p.total}</span></button>
        <div className="flex gap-2 sm:gap-3">
          <button className="btn-secondary px-3 sm:px-5" disabled={!p.canPrev} onClick={p.onPrev}>Previous</button>
          {last ? <button className="btn-primary px-4 sm:px-5" onClick={p.onFinish}>{p.finishLabel ?? 'Finish'}</button> : <button className="btn-primary px-4 sm:px-5" onClick={p.onNext}>Next</button>}
        </div>
      </footer>

      {navOpen && <NavigatorDialog items={p.items} current={p.index} onJump={p.onJump} onFinish={p.onFinish} finishLabel={p.finishLabel ?? 'Finish'} onClose={() => setNavOpen(false)} />}
      {infoOpen && p.info && <Dialog title={p.info.label} onClose={() => setInfoOpen(false)}><div className="mt-3">{p.info.content}</div><div className="mt-5 text-right"><button className="btn-primary" data-autofocus onClick={() => setInfoOpen(false)}>Close</button></div></Dialog>}
      {p.dialogs}
    </div>,
    document.body,
  );
}

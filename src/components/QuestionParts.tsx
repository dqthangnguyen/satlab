import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { Question } from '../types';
import RichText from './RichText';
import HighlightArea from './HighlightArea';
import { correctKey, isCorrect } from '../lib/questionUtils';

/** Left panel: passage, question stem and figure. Highlighting lives here. */
export function QuestionContent({ q }: { q: Question }) {
  return (
    <div className="mx-auto max-w-2xl">
      <HighlightArea key={`${q.id}@${q.version}`} id={q.id} version={q.version}>
        {(hl) => (
          <>
            {q.passage && <div data-field="passage" className="mb-6 font-serif text-[1.15rem] leading-8 text-slate-900"><RichText text={q.passage} ranges={hl.passage} field="passage" /></div>}
            <p data-field="prompt" className={q.passage ? 'text-[1.15rem] font-semibold leading-8' : 'text-[1.3rem] leading-9'}><RichText text={q.prompt} ranges={hl.prompt} field="prompt" /></p>
          </>
        )}
      </HighlightArea>
      {q.figure && <img src={q.figure.src} alt={q.figure.alt} className="mt-5 max-h-96 max-w-full rounded-lg border border-slate-200 object-contain" />}
    </div>
  );
}

/** Right panel: multiple-choice rows (arrow keys and A-D select) or a typed-answer box for student-produced questions. */
export function AnswerChoices({ q, selected, onSelect, revealed }: { q: Question; selected: string | null; onSelect: (v: string) => void; revealed: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const choices = q.choices ?? [];
  if (q.format === 'student_produced' || choices.length === 0) {
    return (
      <label className="block">
        <span className="mb-2 block text-lg font-semibold">Your answer</span>
        <input value={selected ?? ''} disabled={revealed} onChange={(e) => onSelect(e.target.value)} inputMode="decimal" autoComplete="off" spellCheck={false}
          className="min-h-[56px] w-full max-w-xs rounded-xl border-2 border-slate-300 px-4 text-xl disabled:bg-slate-50" />
        <span className="mt-1 block text-sm text-slate-600">Enter a number or a fraction.</span>
      </label>
    );
  }
  const cur = Math.max(0, choices.findIndex((c) => c.id === selected));
  const move = (idx: number) => { const n = (idx + choices.length) % choices.length; onSelect(choices[n].id); refs.current[n]?.focus(); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (revealed || e.ctrlKey || e.metaKey || e.altKey) return;
    const focused = refs.current.findIndex((b) => b === document.activeElement);
    const at = focused >= 0 ? focused : cur;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(at + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(at - 1); }
    else { const i = choices.findIndex((c) => c.id.toLowerCase() === e.key.toLowerCase()); if (i >= 0) { e.preventDefault(); move(i); } }
  };
  return (
    <div role="radiogroup" aria-label="Answer choices" onKeyDown={onKey} className="space-y-3">
      {choices.map((c, n) => {
        const isSel = selected === c.id;
        const style = revealed && isCorrect(q, c.id) ? 'border-mint-600 bg-mint-100' : revealed && isSel ? 'border-coral-600 bg-coral-100' : isSel ? 'border-brand-600 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-600/60';
        return (
          <button key={c.id} ref={(el) => { refs.current[n] = el; }} role="radio" aria-checked={isSel} tabIndex={n === cur ? 0 : -1} disabled={revealed} onClick={() => onSelect(c.id)}
            className={`flex min-h-[3.5rem] w-full items-center gap-4 rounded-xl border-2 px-4 py-3 text-left text-[1.1rem] ${style}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-base font-semibold ${isSel ? 'border-brand-600 bg-brand-600 text-white' : 'border-current'}`}>{c.id}</span>
            <span className="min-w-0 break-words leading-7"><RichText text={c.text} /></span>
          </button>
        );
      })}
    </div>
  );
}

export function Verdict({ q, selected }: { q: Question; selected: string | null }) {
  const ok = isCorrect(q, selected);
  return (
    <div className={`rounded-xl border-2 p-4 ${ok ? 'border-mint-600 bg-mint-100' : 'border-coral-600 bg-coral-100'}`}>
      <p className="text-lg font-semibold">{ok ? 'Correct' : `Not quite. The answer is ${correctKey(q)}.`}</p>
      {q.explanation?.short && <p className="mt-2 text-base leading-7 text-slate-800"><RichText text={q.explanation.short} /></p>}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ExamShell from './ExamShell';
import { ConfirmDialog } from './Dialogs';
import { AnswerChoices, QuestionContent, Verdict } from './QuestionParts';
import { Chips } from './ui';
import { useStore } from '../lib/store';
import { createAttempt } from '../lib/questionUtils';
import { confidenceOptions, errorOptions } from '../lib/labels';
import { canNext, canPrev, clampIndex, countUnanswered, firstUnanswered, navItems } from '../lib/examNav';
import { loadSessionUi, saveSessionUi } from '../lib/sessionUi';
import type { SessionUi, StorageLike } from '../lib/sessionUi';
import { useQuestionTimer } from '../lib/useQuestionTimer';
import { sectionLabel } from '../data/taxonomy';
import type { Attempt, Question } from '../types';

const memory: StorageLike = { getItem: () => null, setItem: () => {} };
const storage = (): StorageLike => { try { return window.localStorage; } catch { return memory; } };

interface Props {
  questions: Question[]; source: Attempt['source']; sessionId?: string; title: string;
  onExit: () => void; onFinish: () => void; finishLabel?: string; info?: { label: string; content: ReactNode };
}

/**
 * Practice in the exam layout. Answers are recorded in the main store when checked (as before), so they survive any navigation.
 * Selected-but-unchecked answers, flags and position are kept per session, and are recorded when the session is finished.
 */
export default function PracticeWorkspace({ questions, source, sessionId, title, onExit, onFinish, finishLabel = 'Finish', info }: Props) {
  const { attempts, addAttempts, updateAttempt } = useStore();
  const ids = useMemo(() => questions.map((q) => q.id), [questions]);
  const mine = sessionId ? attempts.filter((a) => a.sessionId === sessionId) : [];
  const [local, setLocal] = useState<Record<string, string>>({}); // single-question mode: attempt id by question id
  const attemptOf = (qid: string) => (sessionId ? mine.find((a) => a.questionId === qid) : attempts.find((a) => a.id === local[qid]));
  const [ui, setUi] = useState<SessionUi>(() => {
    const saved = sessionId ? loadSessionUi(storage(), sessionId) : null;
    return saved ?? { cursor: firstUnanswered(ids, new Set(mine.map((a) => a.questionId))), drafts: {}, flags: {}, skipped: {} };
  });
  useEffect(() => { if (sessionId) saveSessionUi(storage(), sessionId, ui); }, [ui, sessionId]);
  const [confirm, setConfirm] = useState<'finish' | 'exit' | null>(null);

  const i = clampIndex(ui.cursor, ids.length);
  const q = questions[i];
  const attempt = attemptOf(q.id);
  const answered = !!attempt;
  const sel = answered ? attempt.response : ui.drafts[q.id] ?? null;
  const timer = useQuestionTimer(q.id, !answered);

  const setDraft = (v: string) => setUi((u) => ({ ...u, drafts: { ...u.drafts, [q.id]: v } }));
  const go = (n: number) => setUi((u) => ({ ...u, cursor: clampIndex(n, ids.length) }));
  const hasDraft = (qid: string) => !!ui.drafts[qid]?.trim();

  const check = (qid = q.id): void => {
    const question = questions.find((x) => x.id === qid);
    const resp = ui.drafts[qid]?.trim();
    if (!question || !resp || attemptOf(qid)) return;
    // Whole seconds, minimum 1 (the clock resolution). Time keeps adding up across visits to this question.
    const a = createAttempt(question, resp, source, { timeSpentSec: Math.max(1, Math.round(timer.elapsedMs(qid) / 1000)), sessionId });
    addAttempts([a]);
    if (!sessionId) setLocal((l) => ({ ...l, [qid]: a.id }));
  };
  const finish = () => { questions.forEach((x) => check(x.id)); setConfirm(null); onFinish(); };

  const unanswered = countUnanswered(navItems(ids, (id) => !!attemptOf(id) || hasDraft(id), ui.flags));
  const pending = questions.filter((x) => !attemptOf(x.id) && hasDraft(x.id)).length;

  const right = (
    <div className="mx-auto max-w-xl">
      <AnswerChoices q={q} selected={sel} onSelect={setDraft} revealed={answered} />
      {!answered && <button className="btn-primary mt-6" disabled={!hasDraft(q.id)} onClick={() => check()}>Check</button>}
      {attempt && (
        <div className="mt-6 space-y-5">
          <Verdict q={q} selected={attempt.response} />
          <div className="card space-y-5 p-5">
            <div><p className="mb-2 text-base font-semibold">How confident were you?</p><Chips options={confidenceOptions} value={attempt.confidence} onChange={(v) => updateAttempt(attempt.id, { confidence: v })} /></div>
            {!attempt.isCorrect && !ui.skipped[q.id] && (
              <div>
                <p className="mb-2 text-base font-semibold">Why did you miss this question?</p>
                <Chips options={errorOptions} value={attempt.errorType} onChange={(v) => updateAttempt(attempt.id, { errorType: v })} />
                {!attempt.errorType && <button className="mt-3 text-base text-slate-600 underline" onClick={() => setUi((u) => ({ ...u, skipped: { ...u.skipped, [q.id]: true } }))}>Skip</button>}
              </div>
            )}
          </div>
          {!attempt.isCorrect && <Link to={`/coach?question=${q.id}`} className="btn-secondary">Ask Coach</Link>}
        </div>
      )}
    </div>
  );

  return (
    <ExamShell
      title={`${sectionLabel(q.section)} · ${title}`} index={i} total={ids.length} scrollKey={q.id}
      flagged={!!ui.flags[q.id]} onFlag={() => setUi((u) => ({ ...u, flags: { ...u.flags, [q.id]: !u.flags[q.id] } }))}
      onPrev={() => go(i - 1)} onNext={() => go(i + 1)} canPrev={canPrev(i)} canNext={canNext(i, ids.length)}
      items={navItems(ids, (id) => !!attemptOf(id) || hasDraft(id), ui.flags)} onJump={go}
      onFinish={() => setConfirm('finish')} finishLabel={finishLabel} onExit={onExit} info={info}
      left={<QuestionContent q={q} />} right={right}
      dialogs={confirm === 'finish' && (
        <ConfirmDialog title={`${finishLabel}?`} confirmLabel={finishLabel} cancelLabel="Keep going" onConfirm={finish} onCancel={() => setConfirm(null)}>
          {unanswered > 0 ? <p>{unanswered} question{unanswered === 1 ? ' has' : 's have'} no answer and will not be counted.</p> : <p>You answered every question.</p>}
          {pending > 0 && <p>{pending} selected answer{pending === 1 ? '' : 's'} you did not check will be recorded.</p>}
        </ConfirmDialog>
      )}
    />
  );
}

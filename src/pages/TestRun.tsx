import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { tests } from '../data/tests';
import { useStore } from '../lib/store';
import { getQuestion } from '../lib/questionBank';
import { createAttempt } from '../lib/questionUtils';
import { canNext, canPrev, clampIndex, countUnanswered, navItems } from '../lib/examNav';
import { sectionLabel } from '../data/taxonomy';
import ExamShell from '../components/ExamShell';
import { ConfirmDialog } from '../components/Dialogs';
import { AnswerChoices, QuestionContent } from '../components/QuestionParts';
import TestTimer, { formatTestTime } from '../components/TestTimer';
import { Empty } from '../components/ui';
import type { Question, TestDef } from '../types';

export default function TestRun() {
  const { id } = useParams();
  const t = tests.find((x) => x.id === id);
  if (!t) return <Empty title="Test not found" text="This test does not exist." to="/tests" cta="Back to tests" />;
  return <Runner key={t.id} t={t} />;
}

function Runner({ t }: { t: TestDef }) {
  const { addAttempts, addResult } = useStore();
  const nav = useNavigate();
  const qs = t.questionIds.map(getQuestion).filter(Boolean) as Question[];
  const [started, setStarted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<Record<string, string | null>>(() => Object.fromEntries(qs.map((q) => [q.id, null])));
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<'submit' | 'exit' | null>(null);
  const submitted = useRef(false);
  const totalDurationSec = t.minutes * 60;
  const left = deadlineAt === null
    ? totalDurationSec
    : Math.max(0, Math.ceil((deadlineAt - now) / 1000));

  useEffect(() => {
    if (!started || deadlineAt === null) return;
    const syncTime = () => setNow(Date.now());
    const interval = window.setInterval(syncTime, 250);
    document.addEventListener('visibilitychange', syncTime);
    window.addEventListener('focus', syncTime);
    syncTime();
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', syncTime);
      window.removeEventListener('focus', syncTime);
    };
  }, [deadlineAt, started]);

  const submit = () => {
    if (submitted.current) return;
    submitted.current = true;
    const at = Date.now();
    const rid = `r${at}`;
    const durationSec = startedAt === null
      ? 0
      : Math.min(totalDurationSec, Math.max(0, Math.floor((at - startedAt) / 1000)));
    addAttempts(qs.map((q) => createAttempt(q, ans[q.id], 'test', { at, testResultId: rid })));
    addResult({ id: rid, testId: t.id, title: t.title, at, durationSec, answers: ans });
    nav(`/results/${rid}`, { replace: true });
  };
  useEffect(() => { if (started && left <= 0) submit(); }, [left, started]);

  if (!started)
    return (
      <div className="card mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="mt-2 text-lg text-slate-600">{t.questionIds.length} questions in {t.minutes} minutes. Move freely between questions and flag any you want to revisit. The test submits automatically when time runs out.</p>
        <button
          className="btn-primary mt-6"
          onClick={() => {
            const start = Date.now();
            setStartedAt(start);
            setDeadlineAt(start + totalDurationSec * 1000);
            setNow(start);
            setStarted(true);
          }}
        >
          Begin
        </button>
      </div>
    );

  const idx = clampIndex(i, qs.length), q = qs[idx];
  const has = (id: string) => !!ans[id]?.trim();
  const items = navItems(qs.map((x) => x.id), has, flags);
  const open = countUnanswered(items);
  return (
    <ExamShell
      title={`${sectionLabel(q.section)} · ${t.title}`} index={idx} total={qs.length} scrollKey={q.id} testTimer={<TestTimer seconds={left} />}
      flagged={!!flags[q.id]} onFlag={() => setFlags({ ...flags, [q.id]: !flags[q.id] })}
      onPrev={() => setI(idx - 1)} onNext={() => setI(idx + 1)} canPrev={canPrev(idx)} canNext={canNext(idx, qs.length)}
      items={items} onJump={setI} onFinish={() => setConfirm('submit')} finishLabel="Submit" onExit={() => setConfirm('exit')}
      left={<QuestionContent q={q} />}
      right={<div className="mx-auto max-w-xl"><AnswerChoices q={q} selected={ans[q.id]} onSelect={(c) => setAns({ ...ans, [q.id]: c })} revealed={false} /></div>}
      dialogs={<>
        {confirm === 'submit' && (
          <ConfirmDialog title="Submit test?" confirmLabel="Submit" cancelLabel="Keep working" onConfirm={submit} onCancel={() => setConfirm(null)}>
            <p>{open > 0 ? `${open} question${open === 1 ? ' is' : 's are'} not answered.` : 'You answered every question.'}</p>
            <p>{left > 0 ? `${formatTestTime(left)} left.` : 'Time is up.'} You cannot change answers after submitting.</p>
          </ConfirmDialog>
        )}
        {confirm === 'exit' && (
          <ConfirmDialog title="Leave this test?" confirmLabel="Leave test" cancelLabel="Stay" onConfirm={() => nav('/tests', { replace: true })} onCancel={() => setConfirm(null)}>
            <p>Your answers for this test will be lost. Practice sessions are saved, but tests are not.</p>
          </ConfirmDialog>
        )}
      </>}
    />
  );
}

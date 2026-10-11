import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { getQuestion } from '../lib/questionBank';
import { describeSession } from '../lib/practice';
import PracticeWorkspace from '../components/PracticeWorkspace';
import SessionSummary from '../components/SessionSummary';
import WhyPractice from '../components/WhyPractice';
import { Empty } from '../components/ui';
import type { PracticeSession, Question } from '../types';

export default function PracticeSessionPage() {
  const { sid } = useParams();
  const { sessions } = useStore();
  const session = sessions.find((s) => s.id === sid);
  if (!session) return <Empty title="Session not found" text="This practice session is not stored in this browser." to="/practice" cta="Back to practice" />;
  return <Runner key={session.id} session={session} />;
}

function Runner({ session }: { session: PracticeSession }) {
  const { attempts } = useStore();
  const nav = useNavigate();
  const questions = useMemo(() => session.questionIds.map(getQuestion).filter((q): q is Question => !!q), [session]);
  const mine = attempts.filter((a) => a.sessionId === session.id);
  // A session whose questions are all answered opens on its summary. Otherwise it opens in the workspace.
  const [finished, setFinished] = useState(() => questions.length > 0 && questions.every((q) => mine.some((a) => a.questionId === q.id)));
  if (!questions.length) return <Empty title="Questions unavailable" text="These questions are no longer in the question bank." to="/practice" cta="Back to practice" />;
  if (finished) return <SessionSummary session={session} attempts={mine} unanswered={Math.max(0, session.questionIds.length - mine.length)} />;
  return (
    <PracticeWorkspace questions={questions} source="practice" sessionId={session.id} title={describeSession(session)}
      onExit={() => nav('/practice')} onFinish={() => setFinished(true)} finishLabel="Finish session"
      info={session.plan ? { label: 'Why this practice?', content: <WhyPractice plan={session.plan} hideTitle /> } : undefined} />
  );
}

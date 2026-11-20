import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Empty } from '../components/ui';
import PracticeWorkspace from '../components/PracticeWorkspace';
import SessionSummary from '../components/SessionSummary';
import WhyPractice from '../components/WhyPractice';
import SupabasePracticeRunner from '../components/SupabasePracticeRunner';
import { useStore } from '../lib/store';
import { getQuestion } from '../lib/questionBank';
import { describeSession } from '../lib/practice';
import type { PracticeSession, Question } from '../types';

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export default function PracticeSessionPage() {
  const { sid = '' } = useParams();
  if (UUID_PATTERN.test(sid)) return <SupabasePracticeRunner key={sid} sessionId={sid} />;
  return <LegacyPracticeSessionPage sessionId={sid} />;
}

function LegacyPracticeSessionPage({ sessionId }: { sessionId: string }) {
  const { sessions } = useStore();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    return (
      <Empty
        title="Session not found"
        text="This session is not available in your account."
        to="/practice"
        cta="Back to practice"
      />
    );
  }
  return <LegacyPracticeRunner key={session.id} session={session} />;
}

function LegacyPracticeRunner({ session }: { session: PracticeSession }) {
  const { attempts } = useStore();
  const navigate = useNavigate();
  const questions = useMemo(
    () => session.questionIds.map(getQuestion).filter((question): question is Question => Boolean(question)),
    [session],
  );
  const mine = attempts.filter((attempt) => attempt.sessionId === session.id);
  const [finished, setFinished] = useState(
    () => questions.length > 0 && questions.every((question) => mine.some((attempt) => attempt.questionId === question.id)),
  );

  if (!questions.length) {
    return (
      <Empty
        title="Questions unavailable"
        text="The saved local session does not have its original question content."
        to="/practice"
        cta="Back to practice"
      />
    );
  }
  if (finished) {
    return (
      <SessionSummary
        session={session}
        attempts={mine}
        unanswered={Math.max(0, session.questionIds.length - mine.length)}
      />
    );
  }
  return (
    <PracticeWorkspace
      questions={questions}
      source="practice"
      sessionId={session.id}
      title={describeSession(session)}
      onExit={() => navigate('/practice')}
      onFinish={() => setFinished(true)}
      finishLabel="Finish session"
      info={session.plan ? { label: 'Why this practice?', content: <WhyPractice plan={session.plan} hideTitle /> } : undefined}
    />
  );
}

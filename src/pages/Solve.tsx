import { useNavigate, useParams } from 'react-router-dom';
import { getQuestion } from '../lib/questionBank';
import PracticeWorkspace from '../components/PracticeWorkspace';
import { Empty } from '../components/ui';

/** Single-question mode, used to retry a mistake. Queue-based practice lives in PracticeSession.tsx. */
export default function Solve() {
  const { id } = useParams();
  const nav = useNavigate();
  const q = getQuestion(id ?? '');
  if (!q) return <Empty title="Question not found" text="This question does not exist." to="/practice" cta="Back to practice" />;
  return <PracticeWorkspace key={q.id} questions={[q]} source="review" title="Retry" onExit={() => nav('/mistakes')} onFinish={() => nav('/mistakes')} finishLabel="Done" />;
}

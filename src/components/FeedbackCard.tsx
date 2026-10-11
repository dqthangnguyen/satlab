import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { buildProfile } from '../lib/learnerProfile';
import { planWeakAreas } from '../lib/personalizedPractice';
import { buildFeedback } from '../lib/feedback';

const border = { excellent: 'border-l-mint-600', good: 'border-l-brand-600', mixed: 'border-l-sun-300', low: 'border-l-grape-600' };

export default function FeedbackCard({ correct, total }: { correct: number; total: number }) {
  const { attempts } = useStore();
  const f = useMemo(() => {
    const profile = buildProfile(attempts);
    return buildFeedback({ correct, total, weakAreasReady: planWeakAreas(profile, attempts, 10).ok, enoughData: profile.skills.some((s) => s.status !== 'insufficient') });
  }, [attempts, correct, total]);
  return (
    <section className={`card mb-8 border-l-[6px] ${border[f.tone]}`}>
      <h2 className="text-2xl font-semibold leading-snug">{f.headline}</h2>
      {f.notes.map((n, i) => <p key={i} className="mt-2 text-base text-slate-600">{n}</p>)}
      <div className="mt-5 flex flex-wrap gap-3">
        <Link to={f.primary.to} className="btn-primary">{f.primary.label}</Link>
        {f.secondary && <Link to={f.secondary.to} className="btn-secondary">{f.secondary.label}</Link>}
      </div>
    </section>
  );
}

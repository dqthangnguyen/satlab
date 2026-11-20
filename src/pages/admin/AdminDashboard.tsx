import { useEffect, useState } from 'react';
import { PageHeader, Stat } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import QuestionBank from './QuestionBank';

interface AdminStats {
  totalQuestions: number;
  approvedVersions: number;
  draftVersions: number;
  pendingVersions: number;
  rejectedVersions: number;
}

function readCount(
  result: { count: number | null; error: { message: string } | null },
  label: string,
): number {
  if (result.error) throw result.error;
  if (result.count === null) throw new Error(`Could not load the ${label} count.`);
  return result.count;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (
    typeof reason === 'object' &&
    reason !== null &&
    'message' in reason &&
    typeof reason.message === 'string'
  ) {
    return reason.message;
  }
  return 'Unable to load question-bank statistics.';
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;

    const loadStats = async () => {
      setStatsLoading(true);
      setStatsError(null);

      try {
        const results = await Promise.all([
          supabase.from('questions').select('id', { count: 'exact', head: true }),
          supabase.from('question_versions').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
          supabase.from('question_versions').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
          supabase.from('question_versions').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
          supabase.from('question_versions').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
        ]);
        const [totalQuestions, approvedVersions, draftVersions, pendingVersions, rejectedVersions] =
          results.map((result, index) =>
            readCount(result, ['questions', 'approved versions', 'draft versions', 'pending versions', 'rejected versions'][index]),
          );

        if (active) {
          setStats({
            totalQuestions,
            approvedVersions,
            draftVersions,
            pendingVersions,
            rejectedVersions,
          });
        }
      } catch (reason: unknown) {
        if (active) setStatsError(errorMessage(reason));
      } finally {
        if (active) setStatsLoading(false);
      }
    };

    void loadStats();
    return () => {
      active = false;
    };
  }, [refreshToken]);

  const cards = [
    { label: 'Total questions', value: stats?.totalQuestions },
    { label: 'Approved versions', value: stats?.approvedVersions },
    { label: 'Draft versions', value: stats?.draftVersions },
    { label: 'Pending review', value: stats?.pendingVersions },
    { label: 'Rejected versions', value: stats?.rejectedVersions },
  ];

  return (
    <div>
      <PageHeader title="Admin Dashboard" subtitle="Manage and monitor the SATLab question bank.">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setRefreshToken((value) => value + 1)}
          disabled={statsLoading}
        >
          {statsLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </PageHeader>

      {statsError && (
        <p className="mb-4 rounded-xl border border-coral-200 bg-coral-50 p-4 text-coral-700" role="alert">
          Could not load statistics: {statsError}
        </p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <Stat
            key={card.label}
            compact
            label={card.label}
            value={statsLoading ? '…' : card.value ?? '—'}
          />
        ))}
      </div>

      <QuestionBank refreshToken={refreshToken} />
    </div>
  );
}

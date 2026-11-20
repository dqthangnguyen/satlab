import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, Select } from '../components/ui';
import { useAuth } from '../lib/AuthContext';
import {
  createPracticeSession,
  loadPracticeTaxonomy,
  loadRecentPracticeSessions,
  practiceErrorMessage,
  type PracticeDifficulty,
  type PracticeDomain,
  type PracticeSection,
  type PracticeSkill,
  type RecentPracticeSession,
} from '../lib/supabasePractice';

const SECTION_LABELS: Record<PracticeSection, string> = {
  reading_writing: 'Reading and Writing',
  math: 'Math',
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function sessionStatusLabel(session: RecentPracticeSession): string {
  return session.status === 'in_progress' ? 'In progress' : 'Completed';
}

export default function Practice() {
  const navigate = useNavigate();
  const { user, loading: authLoading, error: authError } = useAuth();
  const [domains, setDomains] = useState<PracticeDomain[]>([]);
  const [skills, setSkills] = useState<PracticeSkill[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentPracticeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [section, setSection] = useState('all');
  const [domainId, setDomainId] = useState('all');
  const [skillId, setSkillId] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [questionCount, setQuestionCount] = useState(10);

  useEffect(() => {
    let active = true;
    if (authLoading) return () => { active = false; };
    if (authError || !user) {
      setLoading(false);
      setLoadError('We could not verify your learner session. Please refresh and try again.');
      return () => { active = false; };
    }

    setLoading(true);
    setLoadError(null);
    setRecentError(null);
    const loadPageData = async () => {
      try {
        const taxonomy = await loadPracticeTaxonomy();
        if (active) {
          setDomains(taxonomy.domains);
          setSkills(taxonomy.skills);
        }
      } catch {
        if (active) setLoadError('We could not load the SAT taxonomy. Please refresh and try again.');
      }

      try {
        const sessions = await loadRecentPracticeSessions();
        if (active) setRecentSessions(sessions);
      } catch {
        if (active) setRecentError('Recent sessions could not be loaded.');
      }

      if (active) setLoading(false);
    };

    void loadPageData();
    return () => {
      active = false;
    };
  }, [authError, authLoading, user?.id]);

  const availableDomains = useMemo(
    () => domains.filter((domain) => section === 'all' || domain.section === section),
    [domains, section],
  );
  const availableSkills = useMemo(() => {
    const filteredDomains = availableDomains.map((domain) => domain.id);
    return skills.filter((skill) =>
      (domainId === 'all' || skill.domainId === Number(domainId)) &&
      filteredDomains.includes(skill.domainId),
    );
  }, [availableDomains, domainId, skills]);

  const handleStart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 50) {
      setFormError('Choose between 1 and 50 questions.');
      return;
    }
    const selectedSection: PracticeSection | null =
      section === 'all' ? null : section === 'reading_writing' || section === 'math' ? section : null;
    const selectedDifficulty: PracticeDifficulty | null =
      difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard' ? difficulty : null;
    const selectedDomain = domainId === 'all' ? null : Number(domainId);
    const selectedSkill = skillId === 'all' ? null : Number(skillId);
    if (
      (section !== 'all' && !selectedSection) ||
      (difficulty !== 'all' && !selectedDifficulty) ||
      (selectedDomain !== null && !availableDomains.some((domain) => domain.id === selectedDomain)) ||
      (selectedSkill !== null && !availableSkills.some((skill) => skill.id === selectedSkill))
    ) {
      setFormError('The selected filters are invalid. Please choose them again.');
      return;
    }

    setCreating(true);
    try {
      const session = await createPracticeSession(
        {
          section: selectedSection,
          domainId: selectedDomain,
          skillId: selectedSkill,
          difficulty: selectedDifficulty,
        },
        questionCount,
      );
      navigate(`/practice/session/${session.sessionId}`);
    } catch (reason: unknown) {
      setFormError(practiceErrorMessage(reason, 'We could not start a practice session. Please try again.'));
    } finally {
      setCreating(false);
    }
  };

  const sectionOptions = [
    { value: 'all', label: 'All sections' },
    ...[...new Set(domains.map((domain) => domain.section))].map((value) => ({
      value,
      label: SECTION_LABELS[value],
    })),
  ];
  const domainOptions = [
    { value: 'all', label: 'All domains' },
    ...availableDomains.map((domain) => ({ value: String(domain.id), label: domain.name })),
  ];
  const skillOptions = [
    { value: 'all', label: 'All skills' },
    ...availableSkills.map((skill) => ({ value: String(skill.id), label: skill.name })),
  ];

  return (
    <div>
      <PageHeader title="Practice" subtitle="Build a session from approved SATLab questions." />

      {loadError && (
        <p className="mb-5 rounded-xl border border-coral-100 bg-coral-100 p-4 text-coral-600" role="alert">
          {loadError}
        </p>
      )}
      {formError && (
        <p className="mb-5 rounded-xl border border-coral-100 bg-coral-100 p-4 text-coral-600" role="alert">
          {formError}
        </p>
      )}

      <section className="card">
        <h2 className="text-2xl font-semibold">Custom practice</h2>
        <p className="mt-2 text-slate-600">
          Questions are selected by Supabase from currently approved versions. No local question data is used for this session.
        </p>

        <form onSubmit={(event) => void handleStart(event)} className="mt-6">
          <fieldset disabled={loading || creating || Boolean(loadError)} className="space-y-5">
            <legend className="sr-only">Practice session settings</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="Section"
                value={section}
                onChange={(value) => {
                  setSection(value);
                  setDomainId('all');
                  setSkillId('all');
                }}
                options={sectionOptions}
              />
              <Select
                label="Domain"
                value={domainId}
                onChange={(value) => {
                  setDomainId(value);
                  setSkillId('all');
                }}
                options={domainOptions}
              />
              <Select label="Skill" value={skillId} onChange={setSkillId} options={skillOptions} />
              <Select
                label="Difficulty"
                value={difficulty}
                onChange={(value) => setDifficulty(value)}
                options={[{ value: 'all', label: 'All' }, { value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]}
              />
              <label className="block text-sm font-medium text-slate-700">
                Number of questions
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  required
                  value={questionCount}
                  onChange={(event) => setQuestionCount(event.target.valueAsNumber)}
                  className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
                />
              </label>
            </div>
          </fieldset>

          <button type="submit" className="btn-primary mt-5" disabled={loading || creating || Boolean(loadError)}>
            {loading ? 'Loading practice options…' : creating ? 'Creating session…' : 'Start practice'}
          </button>
        </form>

        {loading && (
          <p className="mt-4 text-sm text-slate-600" role="status" aria-live="polite">
            Loading domains, skills, and recent sessions…
          </p>
        )}
        {!loading && domains.length === 0 && !loadError && (
          <p className="mt-4 text-sm text-slate-600">No section or domain options are available.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xl font-semibold">Recent Supabase sessions</h2>
        {recentError && (
          <p className="mb-3 rounded-xl border border-coral-100 bg-coral-100 p-3 text-sm text-coral-600" role="alert">
            {recentError}
          </p>
        )}
        {recentSessions.length === 0 && !loading ? (
          <p className="card text-slate-600">No Supabase practice sessions yet.</p>
        ) : (
          <ul className="space-y-2">
            {recentSessions.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/practice/session/${session.id}`}
                  className="card flex flex-wrap items-center justify-between gap-3 py-4 hover:border-slate-400"
                >
                  <div>
                    <p className="font-medium">Practice session · {sessionStatusLabel(session)}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(session.startedAt)}</p>
                  </div>
                  {session.status === 'completed' && session.summary ? (
                    <span className="text-sm font-semibold text-brand-700">
                      {session.summary.score === null ? 'No score' : `${(session.summary.score * 100).toFixed(1)}%`}
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-amber-900">Continue session</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

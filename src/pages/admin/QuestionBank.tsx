import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Badge, PageHeader } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import {
  formatDate,
  parseDomains,
  parseQuestionVersions,
  parseSkills,
  QUESTION_STATUSES,
  STATUS_LABELS,
  STATUS_TONES,
  type Domain,
  type QuestionStatus,
  type QuestionVersion,
  type Skill,
} from './questionManagement';

const STATUS_FILTERS = ['all', ...QUESTION_STATUSES] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const MAX_SCAN = 1000;
const MAX_RESULTS = 100;
const PAGE_SIZE = 20;
const QUESTION_ID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const VERSION_COLUMNS =
  'id,question_id,version_number,skill_id,difficulty,passage,stem,status,created_at,submitted_at,approved_at,rejected_at,archived_at,superseded_by_version_id';

interface QuestionRow {
  questionId: string;
  version: QuestionVersion;
}

function isQuestionStatus(value: string): value is QuestionStatus {
  return QUESTION_STATUSES.some((status) => status === value);
}

function latestVersions(versions: QuestionVersion[]): QuestionRow[] {
  const latest = new Map<string, QuestionVersion>();
  for (const version of versions) {
    const current = latest.get(version.questionId);
    if (
      !current ||
      version.versionNumber > current.versionNumber ||
      (version.versionNumber === current.versionNumber &&
        Date.parse(version.createdAt) > Date.parse(current.createdAt))
    ) {
      latest.set(version.questionId, version);
    }
  }
  return [...latest.values()]
    .map((version) => ({ questionId: version.questionId, version }))
    .sort((left, right) => Date.parse(right.version.createdAt) - Date.parse(left.version.createdAt));
}

function getLastUpdated(version: QuestionVersion): string {
  return [
    version.createdAt,
    version.submittedAt,
    version.approvedAt,
    version.rejectedAt,
    version.archivedAt,
  ].reduce<string>((latest, candidate) => {
    if (candidate && Date.parse(candidate) > Date.parse(latest)) return candidate;
    return latest;
  }, version.createdAt);
}

function sectionLabel(section: Domain['section']): string {
  return section === 'reading_writing' ? 'Reading and Writing' : 'Math';
}

export default function QuestionBank({ refreshToken = 0 }: { refreshToken?: number }) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const { pathname } = useLocation();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [refreshCount, setRefreshCount] = useState(0);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [domains, setDomains] = useState<Map<number, Domain>>(new Map());
  const [skills, setSkills] = useState<Map<number, Skill>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPage(0);
    setLoading(true);
    setError(null);

    const loadQuestionBank = async () => {
      try {
        let versionRows: QuestionVersion[];
        const escapedSearch = search.replace(/[\\%_]/g, '\\$&');

        if (search && !QUESTION_ID_PATTERN.test(search)) {
          const matches = await supabase
            .from('question_versions')
            .select('question_id')
            .ilike('stem', `%${escapedSearch}%`)
            .limit(MAX_SCAN);
          if (matches.error) throw matches.error;
          const questionIds = [...new Set(
            (matches.data ?? []).flatMap((row) =>
              typeof row.question_id === 'string' ? [row.question_id] : [],
            ),
          )].slice(0, MAX_SCAN);

          if (questionIds.length === 0) {
            versionRows = [];
          } else {
            const result = await supabase
              .from('question_versions')
              .select(VERSION_COLUMNS)
              .in('question_id', questionIds)
              .order('created_at', { ascending: false })
              .order('version_number', { ascending: false })
              .limit(MAX_SCAN);
            if (result.error) throw result.error;
            versionRows = parseQuestionVersions(result.data);
          }
        } else {
          let query = supabase
            .from('question_versions')
            .select(VERSION_COLUMNS)
            .order('created_at', { ascending: false })
            .order('version_number', { ascending: false })
            .limit(MAX_SCAN);
          if (search) query = query.eq('question_id', search);
          const result = await query;
          if (result.error) throw result.error;
          versionRows = parseQuestionVersions(result.data);
        }

        const [domainsResult, skillsResult] = await Promise.all([
          supabase.from('domains').select('id,section,name,sort_order').order('sort_order').limit(100),
          supabase.from('skills').select('id,domain_id,name,sort_order').order('sort_order').limit(500),
        ]);
        if (domainsResult.error) throw domainsResult.error;
        if (skillsResult.error) throw skillsResult.error;

        if (active) {
          setQuestions(latestVersions(versionRows));
          setDomains(new Map(parseDomains(domainsResult.data).map((domain) => [domain.id, domain])));
          setSkills(new Map(parseSkills(skillsResult.data).map((skill) => [skill.id, skill])));
        }
      } catch {
        if (active) setError('We could not load the question bank. Please refresh and try again.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadQuestionBank();
    return () => {
      active = false;
    };
  }, [refreshToken, refreshCount, search]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  const filteredQuestions = questions
    .filter(({ version }) => status === 'all' || version.status === status)
    .slice(0, MAX_RESULTS);
  const visibleQuestions = filteredQuestions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.ceil(filteredQuestions.length / PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Question Bank" subtitle="Search and manage SATLab question versions.">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setRefreshCount((count) => count + 1)}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link to="/admin/questions/new" className="btn-primary">Create Question</Link>
          {pathname === '/admin' && (
            <Link to="/admin/questions" className="btn-secondary">Open Question Bank</Link>
          )}
        </div>
      </PageHeader>

      <section className="card">
        <div className="mb-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <form onSubmit={handleSearch} className="flex items-end gap-2">
            <label className="block min-w-0 flex-1 text-sm font-medium text-slate-700">
              Search by question ID or stem
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Full UUID or stem text"
                className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
              />
            </label>
            <button type="submit" className="btn-secondary" disabled={loading}>Search</button>
          </form>

          <label className="block text-sm font-medium text-slate-700">
            Status
            <select
              value={status}
              onChange={(event) => {
                if (event.target.value === 'all' || isQuestionStatus(event.target.value)) {
                  setPage(0);
                  setStatus(event.target.value);
                }
              }}
              className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
            >
              <option value="all">All statuses</option>
              {QUESTION_STATUSES.map((filter) => (
                <option key={filter} value={filter}>{STATUS_LABELS[filter]}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          Showing up to {MAX_RESULTS} questions from the most recent {MAX_SCAN} matching versions.
        </p>

        {loading ? (
          <p className="py-8 text-center text-slate-600" role="status" aria-live="polite">
            Loading questions…
          </p>
        ) : error ? (
          <p className="rounded-xl border border-coral-100 bg-coral-100 p-4 text-coral-600" role="alert">
            {error}
          </p>
        ) : filteredQuestions.length === 0 ? (
          <p className="py-8 text-center text-slate-600">
            {search || status !== 'all' ? 'No questions match these filters.' : 'No questions found.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th scope="col" className="px-3 py-3 font-semibold">Question</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Section / domain / skill</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Difficulty</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Current version</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Last updated</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleQuestions.map(({ questionId, version }) => {
                    const skill = skills.get(version.skillId);
                    const domain = skill ? domains.get(skill.domainId) : undefined;
                    return (
                      <tr key={questionId} className="border-b border-slate-100 align-top">
                        <td className="max-w-[360px] px-3 py-3">
                          <code className="text-xs text-slate-500" title={questionId}>
                            {questionId.slice(0, 8)}…
                          </code>
                          <p className="mt-1 truncate text-slate-800" title={version.stem}>{version.stem}</p>
                        </td>
                        <td className="px-3 py-3">
                          <span>{domain ? sectionLabel(domain.section) : 'Unknown section'}</span>
                          <span className="block text-slate-600">{domain?.name ?? 'Unknown domain'}</span>
                          <span className="block text-slate-500">{skill?.name ?? 'Unknown skill'}</span>
                        </td>
                        <td className="px-3 py-3 capitalize">{version.difficulty}</td>
                        <td className="px-3 py-3">v{version.versionNumber}</td>
                        <td className="px-3 py-3">
                          <Badge tone={STATUS_TONES[version.status]}>{STATUS_LABELS[version.status]}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">{formatDate(getLastUpdated(version))}</td>
                        <td className="px-3 py-3">
                          <Link
                            to={`/admin/questions/${questionId}`}
                            className="font-semibold text-brand-700 underline"
                            aria-label={`Open question ${questionId}`}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">Page {page + 1} of {pageCount}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                    disabled={page === 0}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                    disabled={page >= pageCount - 1}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { useAuth } from '../../lib/AuthContext';
import { signInAdmin } from '../../lib/auth';

type LoginPhase = 'idle' | 'submitting' | 'verifying';

const NON_ADMIN_ERROR = 'This account does not have admin privileges.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function loginErrorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message === NON_ADMIN_ERROR) {
    return 'This account does not have administrator access. Use an authorized Admin account.';
  }

  const code = isRecord(reason) && typeof reason.code === 'string' ? reason.code : '';
  const message = reason instanceof Error ? reason.message : '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'The email or password is incorrect. Please try again.';
  }

  return 'We could not sign you in. Please check your connection and try again.';
}

export default function AdminLogin() {
  const { user, loading: authLoading, isAdmin, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<LoginPhase>('idle');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const busy = phase !== 'idle';

  useEffect(() => {
    if (
      phase !== 'verifying' ||
      !pendingUserId ||
      user?.id !== pendingUserId ||
      authLoading ||
      isAdmin
    ) {
      return;
    }

    setPhase('idle');
    setPendingUserId(null);
    setFormError(
      authError
        ? 'We could not verify administrator access. Please try again.'
        : 'This account does not have administrator access.',
    );
  }, [authError, authLoading, isAdmin, pendingUserId, phase, user?.id]);

  if (!authLoading && isAdmin) return <Navigate to="/admin" replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setPendingUserId(null);
    setPhase('submitting');

    try {
      const signedInUser = await signInAdmin(email.trim(), password);
      setPendingUserId(signedInUser.id);
      setPhase('verifying');
    } catch (reason: unknown) {
      setFormError(loginErrorMessage(reason));
      setPhase('idle');
    } finally {
      setPassword('');
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Admin sign in"
        subtitle="Sign in with an existing SATLab administrator account."
      />

      <section className="card mx-auto max-w-md">
        <h2 className="text-2xl font-semibold">Administrator access</h2>
        <p className="mt-2 text-slate-600">
          Your administrator access is verified securely before opening the dashboard.
        </p>

        {authLoading && (
          <p className="mt-4 text-sm text-slate-600" role="status" aria-live="polite">
            Checking your current session…
          </p>
        )}
        {phase === 'verifying' && (
          <p className="mt-4 text-sm text-slate-600" role="status" aria-live="polite">
            Verifying administrator access…
          </p>
        )}
        {(formError || authError) && (
          <p className="mt-4 rounded-xl border border-coral-200 bg-coral-50 p-3 text-coral-700" role="alert">
            {formError ?? 'We could not verify your current session. Please try again.'}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy || authLoading}
              className="mt-1 block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password
            <span className="relative mt-1 block">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy || authLoading}
                className="block min-h-[48px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 pr-20 text-base text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                disabled={busy || authLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-brand-700 hover:text-brand-900 disabled:opacity-50"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={busy || authLoading}
          >
            {phase === 'submitting'
              ? 'Signing in…'
              : phase === 'verifying'
                ? 'Verifying access…'
                : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          <Link to="/" className="font-semibold text-brand-700 underline">
            Return to SATLab
          </Link>
        </p>
      </section>
    </div>
  );
}

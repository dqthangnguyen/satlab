import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';

export default function AdminRoute() {
  const { loading, error, isAdmin } = useAuth();

  if (error) {
    return (
      <section className="card" role="alert">
        <h1 className="text-2xl font-semibold">Authentication error</h1>
        <p className="mt-2 text-slate-600">
          We could not verify your administrator access. Please refresh the page or try signing in again.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="card" role="status" aria-live="polite">
        <h1 className="text-2xl font-semibold">Checking administrator access</h1>
        <p className="mt-2 text-slate-600">Verifying your authenticated session…</p>
      </section>
    );
  }

  if (!isAdmin) return <Navigate to="/admin/login" replace />;

  return <Outlet />;
}

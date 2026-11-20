import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import { useAuth } from '../lib/AuthContext';
import { signOut } from '../lib/auth';

const links: [string, string][] = [['Home', '/'], ['Practice', '/practice'], ['Tests', '/tests'], ['Mistakes', '/mistakes'], ['Dashboard', '/dashboard'], ['Coach', '/coach']];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { loading, isAdmin } = useAuth();
  const showAdminControls = !loading && isAdmin;
  const visibleLinks: [string, string][] = showAdminControls ? [...links, ['Admin', '/admin']] : links;
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);
  const nav = (c: boolean) => `rounded-xl px-3.5 py-2.5 text-base font-semibold ${c ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900'}`;

  const handleSignOut = async () => {
    setLogoutError(null);
    setSigningOut(true);
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch {
      setLogoutError('Could not sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  const logoutButton = (className: string) => (
    <button
      type="button"
      className={className}
      onClick={() => void handleSignOut()}
      disabled={signingOut}
    >
      {signingOut ? 'Đang đăng xuất…' : 'Log out'}
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-serif text-lg font-bold text-white" aria-hidden="true">S</span>
            <span className="font-serif text-2xl font-semibold text-brand-700">SATLab</span>
          </Link>
          <div className="flex items-center gap-2">
            <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
              {visibleLinks.map(([l, to]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => nav(isActive)}>{l}</NavLink>)}
            </nav>
            {showAdminControls && logoutButton('btn-secondary hidden md:inline-flex')}
            {signingOut && !showAdminControls && (
              <span className="hidden text-sm text-slate-600 md:inline" role="status" aria-live="polite">
                Đang đăng xuất…
              </span>
            )}
            <button className="btn-secondary md:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col border-t border-slate-200 bg-white px-4 py-2 md:hidden" aria-label="Main">
            {visibleLinks.map(([l, to]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => nav(isActive)}>{l}</NavLink>)}
            {showAdminControls && logoutButton('btn-secondary mt-2 w-full')}
            {signingOut && !showAdminControls && (
              <p className="px-3 py-2 text-sm text-slate-600" role="status" aria-live="polite">
                Đang đăng xuất…
              </p>
            )}
          </nav>
        )}
        {logoutError && (
          <p className="mx-auto max-w-6xl px-4 pb-2 text-sm text-coral-700 sm:px-6" role="alert">
            {logoutError}
          </p>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6"><ErrorBoundary key={pathname}><Outlet /></ErrorBoundary></main>
      <footer className="border-t border-slate-200 bg-white/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-slate-600 sm:px-6">
          <p><span className="font-semibold text-slate-800">SATLab</span> · Founded by Dinh Quyet Thang Nguyen (Ray) · Vietnam</p>
          <p className="flex gap-4"><Link to="/about" className="underline">About</Link></p>        
        </div>
      </footer>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';

const links: [string, string][] = [['Home', '/'], ['Practice', '/practice'], ['Tests', '/tests'], ['Mistakes', '/mistakes'], ['Dashboard', '/dashboard'], ['Coach', '/coach']];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);
  const nav = (c: boolean) => `rounded-xl px-3.5 py-2.5 text-base font-semibold ${c ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900'}`;
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-serif text-lg font-bold text-white" aria-hidden="true">S</span>
            <span className="font-serif text-2xl font-semibold text-brand-700">SATLab</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map(([l, to]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => nav(isActive)}>{l}</NavLink>)}
          </nav>
          <button className="btn-secondary md:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button>
        </div>
        {open && (
          <nav className="flex flex-col border-t border-slate-200 bg-white px-4 py-2 md:hidden" aria-label="Main">
            {links.map(([l, to]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => nav(isActive)}>{l}</NavLink>)}
          </nav>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6"><ErrorBoundary key={pathname}><Outlet /></ErrorBoundary></main>
      <footer className="border-t border-slate-200 bg-white/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-slate-600 sm:px-6">
          <p><span className="font-semibold text-slate-800">SATLab</span> · Founded by Dinh Quyet Thang Nguyen (Ray) · Vietnam</p>
          <p className="flex gap-4"><Link to="/about" className="underline">About</Link></p>        
        </div>
      </footer>
    </div>
  );
}

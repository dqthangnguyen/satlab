// Minimal stand-in for react-router-dom so the real pages and Layout can render in a plain page. Hash based.
import { createElement as h } from 'react';
let outlet = null;
export const setOutlet = (n) => { outlet = n; };
export const Outlet = () => outlet;
export const Link = ({ to, children, ...r }) => h('a', { href: '#' + to, ...r }, children);
export const NavLink = ({ to, end, className, children, ...r }) => {
  const here = location.hash.slice(1) || '/';
  const isActive = end ? here === to : here.startsWith(to);
  return h('a', { href: '#' + to, className: typeof className === 'function' ? className({ isActive }) : className, ...r }, children);
};
export const useNavigate = () => (to) => { window.__nav = to; };
export const useLocation = () => ({ pathname: location.hash.slice(1) || '/' });
export const useParams = () => ({ id: new URLSearchParams(location.search).get('id') ?? undefined });
export const useSearchParams = () => [new URLSearchParams(), () => {}];

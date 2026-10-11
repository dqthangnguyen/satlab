import { createRoot } from 'react-dom/client';
import { StoreProvider } from '../../src/lib/store';
import Layout from '../../src/components/Layout';
import Landing from '../../src/pages/Landing';
import Practice from '../../src/pages/Practice';
import Dashboard from '../../src/pages/Dashboard';
import TestRun from '../../src/pages/TestRun';
import { setOutlet } from './pages-router.js';

const pages: Record<string, () => JSX.Element> = { landing: Landing, practice: Practice, dashboard: Dashboard, testrun: TestRun };
const P = pages[new URLSearchParams(location.search).get('page') ?? 'landing'];
setOutlet(<P />);
createRoot(document.getElementById('root')!).render(<StoreProvider><Layout /></StoreProvider>);

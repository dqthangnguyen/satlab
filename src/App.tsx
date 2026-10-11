import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './lib/store';
import Layout from './components/Layout';
import { Empty } from './components/ui';
import Landing from './pages/Landing';
import Practice from './pages/Practice';
import Solve from './pages/Solve';
import PracticeSessionPage from './pages/PracticeSession';
import Tests from './pages/Tests';
import TestRun from './pages/TestRun';
import Result from './pages/Result';
import Dashboard from './pages/Dashboard';
import Mistakes from './pages/Mistakes';
import Coach from './pages/Coach';
import About from './pages/About';

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Landing />} />
            <Route path="practice" element={<Practice />} />
            <Route path="practice/session/:sid" element={<PracticeSessionPage />} />
            <Route path="practice/:id" element={<Solve />} />
            <Route path="tests" element={<Tests />} />
            <Route path="tests/:id" element={<TestRun />} />
            <Route path="results/:id" element={<Result />} />
            <Route path="mistakes" element={<Mistakes />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="coach" element={<Coach />} />
            <Route path="about" element={<About />} />
            <Route path="*" element={<Empty title="Page not found" text="This page does not exist." to="/" cta="Go home" />} />
          </Route>
        </Routes>
      </StoreProvider>
    </BrowserRouter>
  );
}

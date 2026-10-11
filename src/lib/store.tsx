import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Attempt, PracticeSession, TestResult } from '../types';

interface State { attempts: Attempt[]; results: TestResult[]; notes: Record<string, string>; sessions: PracticeSession[] }
interface Ctx extends State {
  addAttempts: (a: Attempt[]) => void;
  addResult: (r: TestResult) => void;
  startSession: (s: PracticeSession) => void;
  updateAttempt: (id: string, patch: Partial<Attempt>) => void;
  setNote: (questionId: string, text: string) => void;
  reset: () => void;
}
const KEY = 'satlab:v2';
const empty: State = { attempts: [], results: [], notes: {}, sessions: [] };
const load = (): State => {
  try { const raw = localStorage.getItem(KEY); return raw ? { ...empty, ...JSON.parse(raw) } : empty; } catch { return empty; }
};
const StoreContext = createContext<Ctx>(null!);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }, [s]);
  const value = useMemo<Ctx>(() => ({
    ...s,
    addAttempts: (a) => setS((p) => ({ ...p, attempts: [...p.attempts, ...a] })),
    addResult: (r) => setS((p) => ({ ...p, results: [...p.results, r] })),
    startSession: (s) => setS((p) => ({ ...p, sessions: [...p.sessions, s] })),
    updateAttempt: (id, patch) => setS((p) => ({ ...p, attempts: p.attempts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
    setNote: (id, t) => setS((p) => ({ ...p, notes: { ...p.notes, [id]: t } })),
    reset: () => setS(empty),
  }), [s]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export const useStore = () => useContext(StoreContext);

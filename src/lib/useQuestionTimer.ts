import { useEffect, useRef } from 'react';

/**
 * Active time per question. It keeps the total across visits, pauses while the tab is hidden or `running` is false,
 * and nothing is stored anywhere until the caller records an answer.
 */
export function useQuestionTimer(current: string, running: boolean) {
  const acc = useRef(new Map<string, number>());
  const live = useRef<{ id: string; since: number | null }>({ id: current, since: null });
  const runRef = useRef(running);
  runRef.current = running;
  const flush = () => {
    const l = live.current;
    if (l.since !== null) { acc.current.set(l.id, (acc.current.get(l.id) ?? 0) + Date.now() - l.since); l.since = null; }
  };
  useEffect(() => {
    live.current = { id: current, since: running && !document.hidden ? Date.now() : null };
    return flush;
  }, [current, running]);
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) flush();
      else if (runRef.current && live.current.since === null) live.current.since = Date.now();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return {
    elapsedMs: (id: string) => (acc.current.get(id) ?? 0) + (live.current.id === id && live.current.since !== null ? Date.now() - live.current.since : 0),
  };
}

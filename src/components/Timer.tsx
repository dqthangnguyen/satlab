import { fmtTime } from '../lib/stats';
export default function Timer({ seconds }: { seconds: number }) {
  return <span role="timer" className={`font-mono text-lg tabular-nums ${seconds < 60 ? 'text-rose-600' : 'text-slate-900'}`}>{fmtTime(Math.max(seconds, 0))}</span>;
}

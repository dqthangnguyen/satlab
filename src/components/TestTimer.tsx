export function formatTestTime(seconds: number): string {
  const remaining = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':');
}

export default function TestTimer({ seconds }: { seconds: number }) {
  const time = formatTestTime(seconds);
  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={`Test time remaining ${time}`}
      className={`shrink-0 rounded-lg border px-2 py-1 text-center font-mono text-xl font-semibold tracking-wider tabular-nums sm:px-3 sm:py-2 sm:text-2xl ${
        seconds < 60
          ? 'border-rose-300 bg-rose-50 text-rose-700'
          : 'border-slate-300 bg-slate-100 text-slate-900'
      }`}
    >
      {time}
    </span>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { topicStats } from '../lib/stats';
import { getQuestion } from '../lib/questionBank';
import { domainLabel } from '../data/taxonomy';
import { coachReply } from '../lib/coach';
import { PageHeader } from '../components/ui';

interface Msg { role: 'coach' | 'user'; text: string }
const prompts = ['What are my weak areas?', 'Make me a study plan', 'How should I manage time?'];

export default function Coach() {
  const { attempts } = useStore();
  const [params] = useSearchParams();
  const weak = topicStats(attempts).slice(0, 3);
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    const q = getQuestion(params.get('question') ?? '');
    const hi: Msg = { role: 'coach', text: 'Hi. I can summarize your weak areas, build a study plan or give pacing advice.' };
    return q ? [hi, { role: 'coach', text: `Let us review this ${domainLabel(q.domain)} question. ${q.explanation.short} Try a similar question in Practice to confirm the idea has stuck.` }] : [hi];
  });
  const [input, setInput] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs]);
  const send = (text: string) => {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: 'user', text }, { role: 'coach', text: coachReply(text, attempts) }]);
    setInput('');
  };
  return (
    <div>
      <PageHeader title="AI Coach" subtitle="Guidance based on your saved results. Replies are rule-based for now and ready to be swapped for a real model." />
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="card h-fit">
          <h2 className="text-lg font-semibold">Focus areas</h2>
          {weak.length === 0 ? <p className="mt-2 text-sm text-slate-600">Answer some questions to see your weakest topics.</p> : (
            <ul className="mt-3 space-y-3">{weak.map((w) => <li key={w.topic} className="text-sm"><p className="font-medium">{w.topic}</p><p className="text-slate-600">{w.acc}% accuracy over {w.total} attempts</p></li>)}</ul>
          )}
        </aside>
        <section className="card flex flex-col">
          <div className="max-h-[420px] min-h-[260px] space-y-3 overflow-y-auto" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-xl px-4 py-3 text-[15px] leading-6 ${m.role === 'user' ? 'ml-auto bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'}`}>{m.text}</div>
            ))}
            <div ref={end} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">{prompts.map((p) => <button key={p} className="btn-secondary px-3 py-1.5 text-xs" onClick={() => send(p)}>{p}</button>)}</div>
          <div className="mt-3 flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(input)} placeholder="Ask about your progress" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Message" />
            <button className="btn-primary" onClick={() => send(input)}>Send</button>
          </div>
        </section>
      </div>
    </div>
  );
}

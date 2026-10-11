import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import PracticeWorkspace from '../../src/components/PracticeWorkspace';
import { StoreProvider } from '../../src/lib/store';

const long = Array.from({ length: 45 }, (_, k) => `Sentence ${k + 1} of a deliberately long reading passage that must scroll inside its own panel. `).join('') + 'Say go now, then go again.';
const longChoice = (t: string) => `${t} ` + 'This choice is very long on purpose so the answer panel has to scroll as well. '.repeat(8);
const base = { version: 1, status: 'published', source: 'original', difficulty: 'easy', tags: [] };
const svg = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><rect width="300" height="80" fill="#eef5fb"/><text x="10" y="45">number line</text></svg>');
const questions: any[] = [
  { ...base, id: 'E1', section: 'reading-writing', domain: 'craft-and-structure', skill: 'words-in-context', format: 'multiple_choice', passage: long, prompt: 'Which choice best states the main idea?', choices: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: longChoice(`Choice ${id}.`) })), answer: { kind: 'choice', choiceId: 'B' }, explanation: { short: 'Because $a+b$ matters.' } },
  { ...base, id: 'E2', section: 'math', domain: 'algebra', skill: 'linear-equations-one-variable', format: 'multiple_choice', prompt: 'If $3x + 7 = 25$, what is the value of $x$? Use the figure.', figure: { src: svg, alt: 'A number line from 0 to 10' }, choices: ['$x = 4$', '$x = 6$', '$x = 8$', '$x = 18$'].map((text, k) => ({ id: 'ABCD'[k], text })), answer: { kind: 'choice', choiceId: 'B' }, explanation: { short: 'Subtract 7, then divide by 3.' } },
  { ...base, id: 'E3', section: 'math', domain: 'algebra', skill: 'linear-equations-one-variable', format: 'student_produced', prompt: 'What is $3 + 4$?', answer: { kind: 'numeric', accepted: ['7'] }, explanation: { short: 'Add them.' } },
];
function App() {
  const [done, setDone] = useState(false);
  return <StoreProvider>{done ? <div id="done">finished</div> : <PracticeWorkspace questions={questions} source="practice" sessionId="S1" title="Practice" onExit={() => { (window as any).__exit = true; }} onFinish={() => setDone(true)} finishLabel="Finish session" />}</StoreProvider>;
}
createRoot(document.getElementById('root')!).render(<App />);

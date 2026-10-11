import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { AnswerChoices, QuestionContent } from '../../src/components/QuestionParts';
const PASSAGE = 'In _The Color Purple_ the author wrote about $x^2 + 3$ twice. The cost is \\$60 and x<sup>2</sup> grows. Say go now, then go again.';
(window as any).PASSAGE = PASSAGE;
const q: any = { id: 'T1', version: 1, status: 'published', source: 'original', section: 'reading-writing', domain: 'craft-and-structure', skill: 'words-in-context', difficulty: 'easy', format: 'multiple_choice', passage: PASSAGE, prompt: 'Which choice best states the main idea?', choices: [{ id: 'A', text: 'First choice' }, { id: 'B', text: 'Second choice $a_1$' }, { id: 'C', text: 'Third' }, { id: 'D', text: 'Fourth' }], answer: { kind: 'choice', choiceId: 'A' }, explanation: { short: 'Because $a+b$.' }, tags: [] };
function App() { const [sel, setSel] = useState<string | null>(null); return <><QuestionContent q={q} /><AnswerChoices q={q} selected={sel} onSelect={setSel} revealed={false} /><div id="sel">{sel}</div></>; }
createRoot(document.getElementById('root')!).render(<App />);

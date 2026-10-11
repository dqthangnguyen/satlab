import type { TestDef } from '../types';
export const tests: TestDef[] = [
  { id: 'rw-mini', title: 'Reading and Writing mini test', description: 'Six questions on word choice, evidence and grammar.', minutes: 8, questionIds: ['RW0001', 'RW0002', 'RW0003', 'RW0004', 'RW0005', 'RW0006'] },
  { id: 'math-mini', title: 'Math mini test', description: 'Six questions on algebra, functions and geometry.', minutes: 10, questionIds: ['M0001', 'M0002', 'M0003', 'M0004', 'M0005', 'M0006'] },
  { id: 'mixed', title: 'Mixed mini test', description: 'All twelve questions across both sections.', minutes: 18, questionIds: ['M0001', 'RW0001', 'M0002', 'RW0002', 'M0003', 'RW0003', 'M0004', 'RW0004', 'M0005', 'RW0005', 'M0006', 'RW0006'] },
];

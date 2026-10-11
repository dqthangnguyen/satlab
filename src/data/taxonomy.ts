import type { Difficulty, SectionId } from '../types';
import { UNMAPPED } from '../lib/questionIndex';

// verified: true  = name confirmed against College Board pages.
// verified: false = written from memory. Check against the official Digital SAT test specification before relying on it.
// Only skills used by current questions plus confirmed ones are listed. Add more once they are checked.

export interface SectionInfo { id: SectionId; label: string }
export interface Domain { id: string; section: SectionId; label: string; verified: boolean }
export interface Skill { id: string; domain: string; label: string; verified: boolean }

export const sections: SectionInfo[] = [
  { id: 'reading-writing', label: 'Reading & Writing' },
  { id: 'math', label: 'Math' },
];

export const domains: Domain[] = [
  { id: 'craft-and-structure', section: 'reading-writing', label: 'Craft and Structure', verified: true },
  { id: 'information-and-ideas', section: 'reading-writing', label: 'Information and Ideas', verified: true },
  { id: 'standard-english-conventions', section: 'reading-writing', label: 'Standard English Conventions', verified: true },
  { id: 'expression-of-ideas', section: 'reading-writing', label: 'Expression of Ideas', verified: true },
  { id: 'algebra', section: 'math', label: 'Algebra', verified: false },
  { id: 'advanced-math', section: 'math', label: 'Advanced Math', verified: false },
  { id: 'problem-solving-data-analysis', section: 'math', label: 'Problem-Solving and Data Analysis', verified: false },
  { id: 'geometry-trigonometry', section: 'math', label: 'Geometry and Trigonometry', verified: false },
];

export const skills: Skill[] = [
  { id: 'words-in-context', domain: 'craft-and-structure', label: 'Words in Context', verified: true },
  { id: 'text-structure-purpose', domain: 'craft-and-structure', label: 'Text Structure and Purpose', verified: true },
  { id: 'cross-text-connections', domain: 'craft-and-structure', label: 'Cross-Text Connections', verified: true },
  { id: 'central-ideas-details', domain: 'information-and-ideas', label: 'Central Ideas and Details', verified: true },
  { id: 'command-of-evidence', domain: 'information-and-ideas', label: 'Command of Evidence', verified: true },
  { id: 'inferences', domain: 'information-and-ideas', label: 'Inferences', verified: false },
  { id: 'boundaries', domain: 'standard-english-conventions', label: 'Boundaries', verified: true },
  { id: 'form-structure-sense', domain: 'standard-english-conventions', label: 'Form, Structure, and Sense', verified: true },
  { id: 'transitions', domain: 'expression-of-ideas', label: 'Transitions', verified: false },
  { id: 'linear-equations-one-variable', domain: 'algebra', label: 'Linear equations in one variable', verified: false },
  { id: 'linear-functions', domain: 'algebra', label: 'Linear functions', verified: false },
  { id: 'nonlinear-functions', domain: 'advanced-math', label: 'Nonlinear functions', verified: false },
  { id: 'nonlinear-equations', domain: 'advanced-math', label: 'Nonlinear equations in one variable and systems of equations in two variables', verified: false },
  { id: 'percentages', domain: 'problem-solving-data-analysis', label: 'Percentages', verified: false },
  { id: 'right-triangles-trigonometry', domain: 'geometry-trigonometry', label: 'Right triangles and trigonometry', verified: false },
];

const index = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x] as const));
const sectionIndex = index(sections);
const domainIndex = index(domains);
const skillIndex = index(skills);

// Labels fall back to the raw id so unknown ids never crash the UI.
export const sectionLabel = (id: string) => sectionIndex.get(id)?.label ?? id;
export const domainLabel = (id: string) => (id === UNMAPPED ? 'Unmapped (needs review)' : domainIndex.get(id)?.label ?? id);
export const skillLabel = (id: string) => (id === UNMAPPED ? 'Unmapped (needs review)' : skillIndex.get(id)?.label ?? id);
export const difficultyLabel = (d: Difficulty) => ({ easy: 'Easy', medium: 'Medium', hard: 'Hard', unknown: 'Unknown' })[d];
export const domainsOf = (section: SectionId) => domains.filter((d) => d.section === section);
export const skillsOf = (domainId: string) => skills.filter((s) => s.domain === domainId);

// Pure conversion and validation of OpenSAT records into SATLab questions. No network, no file access.
import { createHash } from 'node:crypto';

export const UNMAPPED = 'unmapped';
export const SOURCE = {
  name: 'OpenSAT',
  repo: 'https://github.com/Anas099X/OpenSAT',
  api: 'https://pinesat.duckdns.org/api/questions',
  license: 'OpenSAT LICENSE.md (custom terms)',
  licenseNote: 'Read 2026-10-09. It says the database may be used commercially and restricts use of the project name and commercial use of the code. It does not say where the questions come from or grant rights to third-party content. The origin of each question is unverified.',
};
export const SECTIONS = { math: 'math', english: 'reading-writing' }; // CLI name -> SATLab section id
const DOMAINS = new Map([
  ['algebra', ['math', 'algebra']], ['advanced math', ['math', 'advanced-math']],
  ['problem-solving and data analysis', ['math', 'problem-solving-data-analysis']], ['geometry and trigonometry', ['math', 'geometry-trigonometry']],
  ['craft and structure', ['reading-writing', 'craft-and-structure']], ['information and ideas', ['reading-writing', 'information-and-ideas']],
  ['standard english conventions', ['reading-writing', 'standard-english-conventions']], ['expression of ideas', ['reading-writing', 'expression-of-ideas']],
]);
const LETTERS = ['A', 'B', 'C', 'D'];
const isNullish = (v) => v === null || v === undefined || (typeof v === 'string' && ['', 'null', 'none', 'undefined'].includes(v.trim().toLowerCase()));
const clean = (v) => (isNullish(v) ? undefined : typeof v === 'string' ? v.trim() : v); // only trims outer whitespace, never rewrites wording
const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

const FIGURE = /\bin the (figure|graph|table|diagram)\b|\b(figure|graph|table|diagram|chart) (above|below|shown)\b/i;
const MARKUP = /\$|\\\(|\\\[|\\frac|\\sqrt|\\pi|\\begin|<\/?sup>|<\/?sub>|(^|\s)\*[^*\s][^*]*\*(\s|[.,;:)?]|$)/;
const HEDGE = /closest|designed with an error|inconsistent|none of the (answer )?choices|given as a choice|doesn['’]t match|does not match/i;

export function convertRecord(raw, ctx) {
  if (!raw || typeof raw !== 'object') return { ok: false, sourceId: null, reasons: ['record-not-object'] };
  const reasons = [];
  const sourceId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null;
  if (!sourceId) reasons.push('missing-id');
  const q = raw.question && typeof raw.question === 'object' ? raw.question : null;
  if (!q) return { ok: false, sourceId, reasons: [...reasons, 'missing-question-object'] };
  const prompt = clean(q.question);
  if (typeof prompt !== 'string') reasons.push('missing-question-text');
  const choices = [];
  const rc = q.choices && typeof q.choices === 'object' ? q.choices : null;
  if (!rc) reasons.push('missing-choices');
  else if (Object.keys(rc).sort().join('') !== 'ABCD') reasons.push('invalid-choice-keys');
  else for (const L of LETTERS) { const t = clean(rc[L]); if (typeof t === 'string') choices.push({ id: L, text: t }); else reasons.push(`empty-choice-${L}`); }
  const key = typeof q.correct_answer === 'string' ? q.correct_answer.trim().toUpperCase() : '';
  if (!LETTERS.includes(key)) reasons.push('invalid-answer-key');
  const srcDomain = clean(raw.domain);
  const mapped = typeof srcDomain === 'string' ? DOMAINS.get(srcDomain.toLowerCase()) : undefined;
  if (mapped && mapped[0] !== ctx.section) reasons.push('domain-section-mismatch');
  if (reasons.length) return { ok: false, sourceId, reasons };

  const flags = ['unverified-provenance', 'unmapped-skill', 'unverified-answer-key'];
  if (!mapped) flags.push('unmapped-domain');
  const sd = clean(raw.difficulty);
  const dl = typeof sd === 'string' ? sd.toLowerCase() : '';
  const difficulty = ['easy', 'medium', 'hard'].includes(dl) ? dl : 'unknown';
  flags.push(difficulty === 'unknown' ? 'missing-difficulty' : 'unverified-difficulty');
  const passage = clean(q.paragraph);
  const explanation = clean(q.explanation);
  if (typeof explanation !== 'string') flags.push('missing-explanation');
  const vis = raw.visuals ?? q.visuals; // some records nest "visuals" inside "question"
  const hasVisual = !!vis && typeof vis === 'object' && (!isNullish(vis.type) || !isNullish(vis.svg_content));
  if (hasVisual) flags.push('has-visual-unsupported');
  const text = [prompt, passage ?? '', ...choices.map((c) => c.text)].join('\n');
  if (!hasVisual && FIGURE.test(`${prompt}\n${passage ?? ''}`)) flags.push('missing-figure');
  if (MARKUP.test(text) || (explanation && MARKUP.test(explanation))) flags.push('contains-markup');
  if (new Set(choices.map((c) => norm(c.text))).size < 4) flags.push('duplicate-choices');
  if (explanation) {
    const m = explanation.match(/\bchoice\s+([A-D])\b(?=[^.]{0,30}\b(?:is|are)\b[^.]{0,20}\b(?:best|correct|right)\b)/i) || explanation.match(/\b(?:correct|best)\s+answer\s+is\s+(?:choice\s+)?([A-D])\b/i);
    if (m && m[1].toUpperCase() !== key) flags.push('explanation-key-mismatch');
    if (HEDGE.test(explanation)) flags.push('explanation-hedges');
  }
  const correctText = choices.find((c) => c.id === key).text;
  const contentHash = createHash('sha256').update(JSON.stringify([ctx.section, norm(prompt), norm(passage ?? ''), choices.map((c) => norm(c.text)).sort(), norm(correctText)])).digest('hex');
  const question = {
    id: `opensat-${ctx.section === 'math' ? 'math' : 'rw'}-${contentHash.slice(0, 12)}`,
    status: 'draft', version: 1, source: 'third-party', section: ctx.section,
    domain: mapped ? mapped[1] : UNMAPPED, skill: UNMAPPED, difficulty, format: 'multiple_choice',
    ...(passage ? { passage } : {}), prompt, choices,
    answer: { kind: 'choice', choiceId: key }, explanation: { short: explanation ?? '' }, tags: ['opensat'],
    provenance: { name: SOURCE.name, sourceId, sourceDomain: srcDomain, sourceDifficulty: sd, sourceUrl: ctx.sourceUrl, importedAt: ctx.importedAt, license: SOURCE.license, licenseNote: SOURCE.licenseNote, rawFile: ctx.rawFile, contentHash },
    reviewFlags: flags,
  };
  return { ok: true, question };
}

export function describeShape(list) {
  const top = {}, qk = {}; let nested = 0, nullStrings = 0;
  const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    Object.keys(r).forEach((k) => bump(top, k));
    if (r.question && typeof r.question === 'object') {
      Object.keys(r.question).forEach((k) => bump(qk, k));
      if ('visuals' in r.question) nested++;
      if (r.question.paragraph === 'null') nullStrings++;
    }
  }
  return { records: list.length, topLevelKeys: top, questionKeys: qk, visualsNestedInQuestion: nested, paragraphIsStringNull: nullStrings };
}

/** existingIds: ids already in the bank or staging. Nothing in existingIds is ever replaced. */
export function convertAll(rawList, ctx, existingIds = new Set()) {
  const report = { downloaded: rawList.length, considered: rawList.length, imported: 0, duplicates: [], rejected: [], sourceIdsReused: [], unmappedDomains: {}, unknownDifficulty: 0, skillUnmapped: 0, flagCounts: {}, shape: describeShape(rawList) };
  const questions = [], seen = new Set(existingIds), sourceCount = new Map();
  for (const raw of rawList) {
    const r = convertRecord(raw, ctx);
    if (!r.ok) { report.rejected.push({ sourceId: r.sourceId, reasons: r.reasons }); continue; }
    const q = r.question;
    if (seen.has(q.id)) { report.duplicates.push({ sourceId: q.provenance.sourceId, id: q.id, reason: existingIds.has(q.id) ? 'already in bank or staging' : 'same content earlier in this batch' }); continue; }
    seen.add(q.id);
    const sid = q.provenance.sourceId, n = sourceCount.get(sid) ?? 0;
    sourceCount.set(sid, n + 1);
    if (n > 0) { q.reviewFlags.push('source-id-reused'); report.sourceIdsReused.push({ sourceId: sid, id: q.id }); }
    for (const f of q.reviewFlags) report.flagCounts[f] = (report.flagCounts[f] ?? 0) + 1;
    if (q.domain === UNMAPPED) report.unmappedDomains[q.provenance.sourceDomain ?? '(missing)'] = (report.unmappedDomains[q.provenance.sourceDomain ?? '(missing)'] ?? 0) + 1;
    if (q.difficulty === 'unknown') report.unknownDifficulty++;
    report.skillUnmapped++;
    questions.push(q);
  }
  report.imported = questions.length;
  return { questions, report };
}

export function formatReport(r, title) {
  const flags = Object.entries(r.flagCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  - ${k}: ${v}`).join('\n') || '  - none';
  return [`# ${title}`, '',
    `- downloaded: ${r.downloaded}, considered: ${r.considered}`, `- imported (staged as draft): ${r.imported}`,
    `- duplicates skipped: ${r.duplicates.length}`, `- rejected: ${r.rejected.length}${r.rejected.length ? ' (' + r.rejected.map((x) => `${x.sourceId ?? '?'}: ${x.reasons.join('+')}`).join('; ') + ')' : ''}`,
    `- source ids reused with different content: ${r.sourceIdsReused.length}`,
    `- unmapped: skill ${r.skillUnmapped}/${r.imported}, domain ${Object.values(r.unmappedDomains).reduce((a, b) => a + b, 0)}, difficulty ${r.unknownDifficulty}`,
    `- review flags:\n${flags}`, `- source shape: ${JSON.stringify(r.shape)}`].join('\n');
}

// Flags a reviewer can never waive: the question itself is defective. Reject it instead.
export const HARD_FLAGS = ['duplicate-choices', 'missing-figure', 'has-visual-unsupported', 'missing-explanation', 'explanation-key-mismatch', 'explanation-hedges'];
// Flags a reviewer can clear only by writing a confirmation (at least 10 characters).
export const ACK_FLAGS = {
  'unverified-provenance': 'I accept this as third-party content shown with attribution. SATLab has not verified where it came from.',
  'unverified-answer-key': 'I worked the question myself and the source answer key is correct.',
  'unverified-difficulty': 'I checked the difficulty label.',
  'contains-markup': 'I checked that the formatting displays correctly.',
  'source-id-reused': 'I checked that this is not a copy of another question.',
};
export const MIN_NOTE = 10;

/** State of every import flag. kind: hard (cannot be waived), ack (needs a written confirmation), auto (cleared by fixing the field). */
export function flagStatus(q, tax) {
  const ack = q.reviewState?.acknowledged ?? {};
  return (q.reviewFlags ?? []).map((flag) => {
    if (HARD_FLAGS.includes(flag)) return { flag, kind: 'hard', open: true };
    if (flag in ACK_FLAGS) { const note = typeof ack[flag] === 'string' ? ack[flag].trim() : ''; return { flag, kind: 'ack', open: note.length < MIN_NOTE, note }; }
    const fixed = {
      'unmapped-skill': q.skill !== UNMAPPED && (!tax || tax.skills.get(q.skill) === q.domain),
      'unmapped-domain': q.domain !== UNMAPPED && (!tax || tax.domains.get(q.domain) === q.section),
      'missing-difficulty': q.difficulty !== 'unknown',
    }[flag];
    return { flag, kind: 'auto', open: fixed !== true }; // unknown flags stay open
  });
}

/** Problems with the question itself. These must be empty before a question can be approved. */
export function contentBlockers(q, tax) {
  const b = [];
  if (q.domain === UNMAPPED) b.push('domain is unmapped'); else if (tax && !tax.domains.has(q.domain)) b.push(`unknown domain "${q.domain}"`); else if (tax && tax.domains.get(q.domain) !== q.section) b.push('domain does not belong to the section');
  if (q.skill === UNMAPPED) b.push('skill is unmapped'); else if (tax && !tax.skills.has(q.skill)) b.push(`unknown skill "${q.skill}"`); else if (tax && tax.skills.get(q.skill) !== q.domain) b.push('skill does not belong to the domain');
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) b.push('difficulty is unknown');
  if (!q.explanation || !q.explanation.short) b.push('missing explanation');
  for (const f of flagStatus(q, tax)) if (f.open && f.kind !== 'auto') b.push(`open flag: ${f.flag}`);
  return b;
}

/** Everything that must be true before a staged question may be published. */
export function publishBlockers(q, tax) {
  const b = contentBlockers(q, tax);
  const st = q.reviewState;
  if (!st || st.status !== 'approved') b.push('not approved in review');
  else if (!st.reviewer || st.reviewer.trim().length < 2) b.push('reviewer name missing');
  return b;
}

/**
 * Moves approved staged questions into the live bank. Never overwrites: ids already in the bank are skipped.
 * bankIds: every id in src/data/questions. Flags are cleared only because each one was resolved and is recorded in reviewLog.
 */
export function promoteQuestions(staged, target, ids, tax, { bankIds = new Set(), now = new Date().toISOString() } = {}) {
  const out = { promoted: [], refused: [], skipped: [] };
  const have = new Set([...bankIds, ...target.map((q) => q.id)]);
  for (const id of ids) {
    const q = staged.find((x) => x.id === id);
    if (!q) { out.refused.push({ id, blockers: ['not found in staging'] }); continue; }
    if (have.has(id)) { out.skipped.push(id); continue; }
    const blockers = publishBlockers(q, tax);
    if (blockers.length) { out.refused.push({ id, blockers }); continue; }
    const { reviewState, ...rest } = q;
    out.promoted.push({
      ...rest, status: 'published', reviewFlags: [],
      reviewLog: flagStatus(q, tax).map((f) => ({ flag: f.flag, kind: f.kind, note: f.note ?? '' })),
      review: { reviewedBy: reviewState.reviewer.trim(), reviewedAt: reviewState.at ?? now },
    });
    have.add(id);
  }
  return out;
}

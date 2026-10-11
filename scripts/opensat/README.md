# OpenSAT import

Source: OpenSAT (https://github.com/Anas099X/OpenSAT), API https://pinesat.duckdns.org/api/questions.
Its LICENSE.md is a custom text. It allows commercial use of the database and restricts use of the project name and commercial use of the code.
It does not say where the questions come from. Treat every imported question as unverified third-party content.

Workflow (run from the project root, Node 18+; Node 22.18+ for the TypeScript tests):

1. `npm run import:opensat -- --section math --limit 10` (and `--section english`). The raw response goes to `data-raw/opensat/`; drafts and a report go to `data-import/opensat/`. Nothing is published.
2. `npm run review:opensat`, then open the printed address (127.0.0.1 only). Enter your reviewer name. For each question you can see the stem, passage, choices, the source answer key, the explanation, source ids and provenance, and every review flag.
   - Set domain, skill and difficulty (the source values stay in `provenance`).
   - Flags marked "cannot be waived" (duplicate choices, missing figure, missing explanation, explanation that contradicts or hedges on the key) mean the question is defective. Reject it.
   - Other flags need a written confirmation of at least 10 characters.
   - The answer key is never edited. If it is wrong, reject the question.
3. Approve, then press Publish approved (or `npm run promote:opensat -- --section math --approved`). Only approved questions that pass every check are copied to `src/data/questions/opensat-<section>.json`. Existing ids are never overwritten. Each published question keeps its provenance and a `reviewLog` of how each flag was resolved.
4. `npm run test:data` runs the data, review, rich-text, highlight and feedback tests. `npm run test:browser` runs the highlight test in a real browser (extra dev tools needed, see the file header).

Imported content is third-party and unverified. SATLab does not claim its copyright status or accuracy has been independently checked.

## Browser tests (optional, need extra dev tools)

`npm i -D playwright esbuild && npx playwright install chromium`, then `npm run test:browser`. They build the real components with your Tailwind config and check, in a real browser: highlighting, the two-panel exam workspace (independent scrolling, answers kept when moving between questions, mobile tabs, keyboard, finishing), the timed test, and the Home, Practice and Dashboard pages with seeded data. `SHOTS=some/dir` saves screenshots. Pages use a small stand-in for the router and for `import.meta.glob`, so these tests do not replace `npm run build`.

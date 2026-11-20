# SATLab — Personalized Digital SAT Practice Platform

SATLab is a web-based learning platform designed to help students prepare for the Digital SAT through targeted practice, timed tests, mistake review, and performance tracking.

The platform combines an interactive learning experience with a structured question management system, helping learners identify weaknesses and focus on the skills they need to improve.

**Live Demo:** [Visit SATLab](https://dqthangnguyen.github.io/satlab/)

## Features

### Learning Experience

- **Targeted Practice** — Generate practice sessions based on section, domain, skill, difficulty, and question count.
- **Timed Tests** — Complete mini-tests in a test-like environment with countdown timers, question navigation, and automatic submission.
- **Mistake Review** — Review incorrect answers, explanations, and recurring error patterns.
- **Interactive Question Workspace** — Navigate questions, highlight text, flag questions, and interact with mathematical expressions.
- **Progress Dashboard** — Track accuracy, completed tests, question attempts, and skill-level performance.
- **Study Coach** — Receive rule-based study suggestions based on learning performance.

### Authentication and Access Control

- **Anonymous Learner Authentication** — Allow learners to access practice sessions without creating a traditional account.
- **Administrator Authentication** — Password-based authentication for authorized administrators.
- **Role-Based Access Control** — Separate learner and administrator permissions.
- **Protected Admin Routes** — Verify administrator privileges before granting access to management features.

### Question Management System

- **Question Bank** — Browse, search, and filter questions.
- **Question Authoring** — Create structured questions with passages, answer choices, explanations, difficulty levels, and skill classifications.
- **Question Versioning** — Maintain multiple versions of questions.
- **Review Workflow** — Submit drafts for review and support approval, rejection, and withdrawal decisions.
- **Answer Key Protection** — Store correct answers and explanations in a private database schema.

## Tech Stack

| Category | Technologies |
|---|---|
| Frontend | React, TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Routing | React Router |
| Mathematics Rendering | KaTeX |
| Backend Services | Supabase |
| Database | PostgreSQL |
| Authentication | Supabase Auth |
| Database Security | Row Level Security (RLS), PostgreSQL Functions |
| Deployment | GitHub Pages, GitHub Actions |
| Version Control | Git, GitHub |

## Architecture Overview

SATLab uses a hybrid architecture combining a React frontend, Supabase backend services, and browser-based local persistence.

- **Frontend:** React and TypeScript power the learning interface, practice workflows, dashboard, and administrative pages.
- **Authentication:** Supabase Auth manages anonymous learner sessions and administrator authentication.
- **Database:** PostgreSQL stores structured questions, question versions, answer choices, answer keys, practice sessions, and submissions.
- **Authorization:** PostgreSQL Row Level Security policies and database functions enforce access restrictions.
- **Local Persistence:** Browser Local Storage maintains legacy test attempts, results, notes, and selected practice state.

### Data Persistence

SATLab currently uses two persistence paths:

| Feature | Storage |
|---|---|
| Supabase custom practice sessions | Supabase |
| Practice submissions and answer reviews | Supabase |
| Question bank and question versions | Supabase |
| Administrator question management | Supabase |
| Timed mini-tests and test results | Local Storage |
| Dashboard statistics | Local Storage |
| Legacy mistake tracking and notes | Local Storage |

Local test and dashboard data are browser-specific and are not currently synchronized with Supabase practice data.

## Database Design

The database is organized around several core areas:

- **Taxonomy:** Domains and skills.
- **Question Management:** Questions, question versions, choices, tags, and question reviews.
- **References and Provenance:** Official references, source metadata, and review records.
- **Private Answer Keys:** Correct choices and explanations stored separately from learner-facing question data.
- **Practice Engine:** Practice sessions, assigned questions, and answer attempts.
- **User Management:** User roles and authorization helpers.

### Database Security

- Row Level Security is enabled on database tables.
- Learners can access approved question content.
- Administrative content is restricted to authorized administrators.
- Practice sessions and submissions are scoped to their owners.
- Direct client-side database writes are restricted.
- Database functions handle sensitive question lifecycle and practice operations.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- npm
- [Git](https://git-scm.com/)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/dqthangnguyen/satlab.git
   ```

2. Navigate to the project directory:

   ```bash
   cd satlab
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Create a `.env.local` file in the project root:

   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open the local URL displayed in your terminal.

### Build for Production

```bash
npm run build
```

The generated production files will be available in the `dist/` directory.

## Deployment

SATLab is deployed through GitHub Pages using GitHub Actions.

The deployment workflow:

1. Installs dependencies.
2. Builds the application using Vite.
3. Generates a fallback page for client-side routing.
4. Publishes the production build to GitHub Pages.

Deployment is triggered by pushes to the `main` branch.

**Live Website:** [https://dqthangnguyen.github.io/satlab/](https://dqthangnguyen.github.io/satlab/)

## Project Structure

```text
satlab/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── public/
├── src/
│   ├── components/
│   ├── data/
│   ├── lib/
│   └── pages/
│       └── admin/
├── supabase/
│   ├── migrations/
│   └── config.toml
├── docs/
│   └── database/
├── scripts/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Future Improvements

- AI-powered explanations and personalized learning recommendations.
- Expanded Digital SAT question bank.
- Supabase-backed full-length SAT tests.
- Unified analytics combining practice and test performance.
- More detailed skill-level performance insights.
- Improved accessibility and mobile responsiveness.

## Author

**Dinh Quyet Thang Nguyen (Ray)**

A personal project exploring full-stack web development, database architecture, and educational technology.

---

*SATLab is an independent SAT preparation project and is not affiliated with or endorsed by the College Board.*

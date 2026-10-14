# SATLab — Personalized SAT Practice Platform

SATLab is a web-based SAT practice platform designed to help students prepare for the Digital SAT through targeted practice, timed tests, mistake tracking, and personalized learning insights.

The goal of SATLab is to make SAT preparation more organized and accessible by helping students identify their weaknesses, review mistakes, and focus on the skills they need to improve.

**Live Demo:** [Visit SATLab](https://dqthangnguyen.github.io/satlab/)

## Features

- **Targeted Practice** — Practice questions based on subject areas, skills, and difficulty levels.
- **Timed Tests** — Work through questions in a test-like environment with a timer and question navigation.
- **Mistake Tracking** — Review incorrect answers and revisit questions that need more attention.
- **Personalized Learning Insights** — Track performance and identify areas for improvement.
- **Progress Dashboard** — View practice statistics and monitor learning progress.
- **Interactive Question Workspace** — Navigate questions, select answers, highlight text, and work with mathematical expressions.
- **Local Progress Storage** — Save supported learning progress in the browser using local storage.

## Tech Stack

- **React** — Build the user interface with reusable components.
- **TypeScript** — Add static typing and improve code maintainability.
- **Vite** — Provide a fast development environment and production build.
- **Tailwind CSS** — Style the interface.
- **KaTeX** — Render mathematical expressions.
- **GitHub Pages** — Host the static website.

## Getting Started

### Prerequisites

Make sure you have the following installed:

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

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the local URL displayed in your terminal.

### Build for Production

Run the following command to create a production build:

```bash
npm run build
```

The generated static files will be placed in the `dist/` directory.

## Deployment

SATLab is deployed using GitHub Pages. The deployment workflow builds the project and publishes the generated static files.

Live website: https://dqthangnguyen.github.io/satlab/

## Project Structure

```text
satlab/
├── public/                 # Static assets
├── src/                    # Application source code
├── .github/
│   └── workflows/          # GitHub Actions workflows
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

*Note: The exact directory structure may vary as the project evolves.*

## Data and Privacy

SATLab uses browser local storage for supported learning progress and preferences. This means that saved data may be limited to the browser and device being used.

SATLab is currently a frontend web application hosted on GitHub Pages and does not automatically provide cross-device synchronization or a shared user database.

## Future Improvements

Potential areas for further development include:

- AI-assisted explanations for incorrect answers.
- More high-quality practice questions.
- More detailed skill-level analytics.
- Improved accessibility and mobile usability.
- Additional personalized study recommendations.

## Author

**Dinh Quyet Thang Nguyen (Ray)**

Built as a personal project exploring web development, educational technology, and personalized learning.

---

*SATLab is an independent SAT preparation project and is not affiliated with or endorsed by the College Board.*

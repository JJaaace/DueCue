# DueCue

> An adaptive academic deadline assistant that helps students decide when to start—not merely when work is due.

Canvas tells students what is due. DueCue turns coursework into clear start windows, ranks what deserves attention first, detects deadline pileups, suggests useful work for the time available, explains each recommendation, previews reminders, and learns from timing feedback. It is a portfolio-ready React, Express, Prisma, and PostgreSQL project with a safe simulated CarmenCanvas-style demo workspace.

> **Unofficial demo:** DueCue is OSU/Buckeye-inspired visually, but is not affiliated with Ohio State, CarmenCanvas, or Canvas. It does not scrape school systems or collect school credentials.

## Screenshots

Add screenshots here before sharing publicly. See [the capture checklist](docs/screenshots/README.md) for exact views, filenames, and privacy guidance.

| Home and Next Cue | Task detail and reasoning |
| --- | --- |
| `docs/screenshots/home.png` *(placeholder)* | `docs/screenshots/task-drawer.png` *(placeholder)* |

| Safe import | Sync changes |
| --- | --- |
| `docs/screenshots/import.png` *(placeholder)* | `docs/screenshots/sync-changes.png` *(placeholder)* |

## What it demonstrates

- Explainable start-window recommendations with priority and confidence scores.
- A deterministic **Today Plan** that ranks what to start first using urgency, open start windows, cue score, effort, task type, source changes, and deadline pileups.
- A calm **Workload Radar** that detects clustered deadlines and start windows before they become a stressful surprise.
- Task-risk labels and an **I have…** time helper that recommends practical coursework for 30 minutes, one hour, or two hours.
- A compact **Weekly Game Plan** with actionable week-ahead signals, meaningful change summaries, and deterministic batch suggestions for quick wins, shared-course work, and same-day deadlines.
- Optional, private grade goals that give comparable coursework a bounded priority adjustment—without overriding urgent, high-value work.
- A polished student dashboard, coursework filters, task drawer, feedback loop, and private ICS calendar export.
- Provider-based ingestion with a staged mock Canvas provider, transactional upserts, task-change events, and sync-run history.
- Safe manual JSON and ICS imports—no scraping, passwords, or academic access tokens.
- Preview-first reminders, deduplication, user timing preferences, and optional Resend delivery behind environment variables.
- Recruiter demo mode: staged sync story and one-click reset to a clean baseline.

## Recommendation engine

DueCue starts with a deterministic lead time by task type: short for readings/discussions, longer for projects and exams. It adjusts that window using due date, task type, estimated effort, points, task difficulty, course difficulty, reminder style, source changes, and prior feedback.

The result is persisted with a recommended start time, `0–100` cue score, confidence score, explanation, and factor list. Feedback such as **Too early** or **Too late** creates bounded learning preferences that influence future work of the same type/course. The task drawer makes these inputs visible rather than treating the result as a black box.

The Home intelligence layer deliberately stays deterministic and explainable—there is no AI/LLM claim. It combines existing recommendations with due-date urgency, start-window status, estimated effort, task type, recent deadline changes, and same-day workload clustering. That powers a ranked Today Plan, calm risk labels, Workload Radar, and available-time suggestions.

The same signals create a concise Weekly Game Plan and optional weekly digest preview: top work to start, workload watches, meaningful changes, optional grade-goal context, and learning signals. Batch suggestions use simple rules (shared course, quick low-effort work, and same-day deadlines) to reduce context switching rather than pretending to schedule a student’s full life.

### Optional grade goals

Students can manually enter a current grade, target grade, and course importance from the Work page. This information stays private to the workspace and is optional: without it, DueCue works normally. When a course is below target, comparable coursework receives a bounded boost; a high-value or imminent exam/project can still rank above it. When a course is safely above target, only low-value, low-risk work receives a small reduction. DueCue does not currently read grades from Canvas, scrape school systems, request passwords, or request Canvas access tokens. An approved future Canvas OAuth/API integration could provide richer metadata.

## Safe data boundary

Current supported sources are the simulated demo, user-authorized **iCal feed sync**, and secondary manual JSON. iCal feed URLs are DueCue’s first real integration path: they can provide event titles, due dates, and sometimes course/description/link data, then be re-checked while valid. Feeds do not reliably include grades, submissions, rubrics, exact points, or full Canvas metadata; students can enrich imported tasks with type, effort, difficulty, points, and status to improve recommendations. DueCue does **not** scrape Canvas/Carmen, automate school logins, store passwords, or collect school access tokens. Official Canvas OAuth remains a future, approval-dependent path for richer metadata.

Reminder delivery is deliberately separate from login identity. Users can maintain a primary reminder email and opt-in additional self, parent/guardian, or other recipients with per-reminder controls. Added recipients stay preview-only until independently verified; demo workspaces use an explicit mock-verification state. School-email verification is a future option for campus pilots, not a current requirement.

Start Window Open emails are the core reminder: they summarize the course, task, deadline, start window, cue score, and effort in a few lines. Their **Too early**, **Just right**, and **Too late** links carry opaque, one-time, expiring tokens scoped to the student, task, recommendation, notification, recipient, and selected rating. A click records feedback only for that student’s learning preferences and opens a DueCue confirmation page; expired, mismatched, or duplicate clicks do nothing.

## Local setup

Prerequisites: Node.js 20+, npm, and PostgreSQL.

```bash
npm install
cp backend/.env.example backend/.env
# Set DATABASE_URL in backend/.env
npm run db:migrate
npm run db:seed
npm run dev
```

The app is normally served at `http://localhost:5173` (Vite may choose `5174` if that port is busy). The API is `http://localhost:4000/api`; health is `GET /api/health`.

```bash
npm run build
npm test
```

## Demo in two minutes

See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md). Start on Home, open **See why**, submit feedback, run the staged sync, then show safe import/calendar options. Use **Reset recruiter demo** in the sidebar before a new walkthrough.

## Architecture

```txt
React / Vite UI
       │ REST
Express API ── Prisma ── PostgreSQL
       │
Provider registry → MockCanvasProvider / manual JSON / ICS
       │
Sync engine → task events → recommendations → notification previews / ICS
```

Detailed design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deployment

The intended deployment shape is Vercel (frontend), Render (API), and Neon (Postgres). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for environment variables, CORS, Prisma migrations, demo database setup, and the remaining production-auth requirement.

## Limitations and roadmap

- The current primary source is simulated data; real Canvas OAuth is not implemented.
- Production Clerk token verification must be connected before public multi-user deployment.
- Resend exists behind configuration, but preview mode is the default.
- A production release should add error monitoring and a separate demo database/tenant.

Near-term roadmap: production auth, approved OAuth/iCal integrations, import-review history, production observability, and a small student pilot. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Resume bullets

See [docs/RESUME_BULLETS.md](docs/RESUME_BULLETS.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend and API |
| `npm run build` | Build/type-check both workspaces |
| `npm test` | Run backend tests |
| `npm run db:migrate` | Apply local Prisma migrations |
| `npm run db:seed` | Reset and seed the local demo user |

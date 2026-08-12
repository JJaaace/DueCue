# DueCue

> Personalized academic reminders that learn when you should start.

DueCue is an adaptive academic deadline assistant. It ingests course work from provider adapters, detects deadline changes, calculates a useful start window before a task is due, previews proactive reminders, and adapts timing from feedback.

## Why DueCue is not just a calendar

Calendars show when something is due. DueCue is designed to decide when to begin, watch source data for changes, and eventually adapt that timing from feedback. The core product story is: sync coursework → notice a change → calculate the right cue → learn from the response.

## Core features

- TypeScript npm-workspace monorepo: React/Vite frontend and Express API
- Prisma/PostgreSQL schema for users, courses, tasks, provider connections, sync runs, task events, recommendations, notifications, feedback, learning preferences, and revocable calendar tokens
- Explicit dev-auth fallback (`demo@duecue.local`), with no school credentials or scraping
- `MockCanvasProvider` with 5 courses and 21 relative-date tasks
- Four demo stages: baseline, new CSE project, earlier MATH quiz, and increased ENGLISH essay points
- Transactional task upserts, soft-removal detection, and granular change events
- Deterministic recommendation engine with priority/confidence scores and human-readable explanations
- Feedback loop that stores scoped learning preferences and recalculates future cues
- Preview-first notification pipeline, private revocable ICS calendar feeds, and optional local job scheduling
- Responsive dashboard, courses, task detail, notifications, insights, and calendar pages

## Local setup

1. Ensure PostgreSQL is running and create a `duecue` database.
2. Copy [backend/.env.example](backend/.env.example) to `backend/.env` (or create a root `.env`) and set `DATABASE_URL`.
3. Install packages and apply the schema. For a local macOS/Homebrew Postgres setup, include your database username in `DATABASE_URL` (for example, `postgresql://your-user@localhost:5432/duecue?schema=public`):

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

The web app runs at `http://localhost:5173`; the API runs at `http://localhost:4000`. `GET /api/health` is public. All other current routes use the local demo user automatically.

## Demo sync story

Run stage 1 after seeding (already complete), then exercise source changes through the API:

```bash
curl -X POST http://localhost:4000/api/sync/run -H 'Content-Type: application/json' -d '{"stage":2}'
curl -X POST http://localhost:4000/api/sync/run -H 'Content-Type: application/json' -d '{"stage":3}'
curl -X POST http://localhost:4000/api/sync/run -H 'Content-Type: application/json' -d '{"stage":4}'
curl http://localhost:4000/api/demo/state
curl http://localhost:4000/api/sync/runs
```

Stage 2 adds CSE Project 2; stage 3 moves MATH Quiz 2 earlier; stage 4 raises the English essay’s points from 75 to 100. Each difference becomes a `TaskEvent` and is reflected in `SyncRun` counts.

## Recommendation and feedback loop

DueCue starts with explainable lead-time rules: readings/discussions get short windows, assignments/labs get two days, quizzes three, projects five, and exams seven. It then adjusts safely for reminder style, points, difficulty, estimated work, task urgency, and learning preferences. Feedback is stored by task type first; each signal changes lead time in bounded increments and raises confidence with additional samples.

## Demo mode

The dashboard is intentionally labeled as a **Buckeye demo workspace** with OSU-style course data. It uses simulated CarmenCanvas-style data and is independent—not an official Ohio State or CarmenCanvas app. It demonstrates automatic ingestion without claiming an official LMS integration or accepting school credentials. Use [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for the recruiter/interview walkthrough.

## Import your own coursework safely

DueCue supports two user-authorized import paths today:

- **Manual JSON:** Open **Import** in the app and paste an array of tasks. Each entry requires `courseCode`, `title`, and an ISO `dueAt`; optional fields include `courseName`, `type`, `pointsPossible`, `estimatedMinutes`, `difficulty`, `description`, and `sourceUrl`.
- **iCal/ICS:** Paste exported `.ics` content from a calendar you are authorized to access. DueCue imports events with a title and start date and uses title keywords for initial task classification.

Neither path stores school passwords, scrapes Canvas/Carmen, or automates school login. A future Canvas integration must use an approved OAuth or iCal path.

## Email and notification preferences

`EMAIL_MODE=preview` is the default and never sends email. To enable Resend in a deployed environment, set `EMAIL_MODE=resend`, `RESEND_API_KEY`, and `EMAIL_FROM`, then let a signed-in user opt into email notifications through their settings. Notification generation deduplicates by task, notification type, and recommendation version.

## Deployment guide

Use Vercel for `frontend`, Render for `backend`, and Neon Postgres for the database.

1. Create a Neon database and set Render `DATABASE_URL` to its pooled production connection string.
2. On Render, run `npm run db:deploy --workspace=@duecue/backend` as the release command and `npm run start --workspace=@duecue/backend` as the start command.
3. Set `NODE_ENV=production`, `FRONTEND_URL` to the Vercel URL, and `AUTH_MODE=clerk`. Production intentionally rejects `AUTH_MODE=dev`. The current middleware deliberately exposes only a local demo-user fallback; connect Clerk's Express token verification here before accepting public traffic.
4. On Vercel, configure `VITE_API_BASE_URL` with the Render API URL.
5. Seed a dedicated demo database and keep the **Demo workspace** note visible for recruiter walkthroughs. It requires no school account or credentials. In the app, **Reset recruiter demo** returns the workspace to stage 1 and clears demo feedback, learning signals, notification previews, and change history.

Before public deployment, replace the local dev-auth middleware with Clerk verification and configure allowed production origins. Keep a separate demo database/tenant for portfolio walkthroughs; never expose a shared demo user's data in a production user environment.

### Production checklist

- Render: use a health check at `/api/health`, set `DATABASE_URL`, `FRONTEND_URL`, `AUTH_MODE=clerk`, and optional Resend variables; run Prisma deploy migrations before starting the API.
- Vercel: set `VITE_API_BASE_URL` to the HTTPS Render URL, then add that exact Vercel URL as `FRONTEND_URL` for CORS.
- Neon: use its pooled runtime connection string and retain a direct migration connection if the Neon setup requires one.
- Auth: verify Clerk bearer tokens server-side and map the stable Clerk subject to `User.authProviderId`; preserve `AUTH_MODE=dev` only for local/recruiter environments.
- Observability: send unhandled API errors to an error monitor such as Sentry before opening the app to public users. Do not include task content, calendar feed tokens, or credentials in error payloads.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend and backend together |
| `npm run dev:frontend` | Start Vite only |
| `npm run dev:backend` | Start Express only |
| `npm run build` | Type-check/build all workspaces |
| `npm run test` | Run backend unit tests |
| `npm run db:migrate` | Create/apply development migrations |
| `npm run db:seed` | Reset and seed only the named local demo user |

The Calendar page includes reminder preferences for timing style, hour, weekends, digest, and email opt-in. The default remains preview-only: no email is sent until `EMAIL_MODE=resend` and the Resend variables are configured.

## Architecture

The provider layer exposes a small `CourseProvider` interface. `MockCanvasProvider` is the first implementation; future approved Canvas iCal/OAuth adapters can return the same provider DTOs. The sync engine owns the mapping to relational records and change-event creation, keeping providers free from database concerns. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Privacy and integration boundary

DueCue does not scrape Canvas/Carmen, automate login, or store school usernames/passwords. The current provider is explicitly simulated. A production integration should use an approved OAuth or user-authorized calendar feed path and production authentication instead of dev auth.

## Roadmap

Next: deterministic recommendation calculations, feedback-driven learning, notification previews, calendar ICS export, and the dashboard UI. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Resume-ready direction

- Built DueCue, an adaptive academic deadline assistant that syncs course tasks and detects deadline changes through a provider-based Node.js, Express, Prisma, and PostgreSQL backend.
- Designed a transactional ingestion pipeline that upserts LMS-shaped course data by external identity and persists granular task-event and sync-run audit trails for future integrations.

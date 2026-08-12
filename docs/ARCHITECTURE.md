# DueCue architecture

## System overview

```txt
Browser (React + Vite)
  Home · Work · Import · Calendar · task drawer
                     │ HTTPS / JSON
                     ▼
Express API ────────────────────────────────────────────┐
  data · sync · imports · feedback · notifications       │
  calendar · demo · health                               │
                     │ Prisma                            │
                     ▼                                   │
PostgreSQL: users, settings, courses, tasks, events,     │
recommendations, feedback, notifications, tokens         │
                                                         │
Provider registry ── MockCanvasProvider                  │
                 └─ manual JSON / ICS normalization ────┘
```

## Frontend

The Vite/React workspace is a focused student workspace with four routes: **Home**, **Work**, **Import**, and **Calendar**. `App.tsx` owns API loading, demo sync, the selected task drawer, onboarding, and the recruiter-demo reset. The task drawer is the explanation surface: it displays task data, recommendation factors, reminder previews, sync events, and feedback actions.

The frontend reads `VITE_API_BASE_URL`; when unset, it uses Vite's local API proxy. It displays endpoint/status context for development fetch failures.

## API and persistence

The Express API is grouped by domain: data, sync, recommendations, feedback, notifications, imports, calendar, demo, and health. Prisma maps the relational PostgreSQL model.

Key records:

- `AcademicTask` is identified by user, provider, and source external ID.
- `TaskEvent` retains create, deadline, points, removal, and update history.
- `Recommendation` stores its version, start time, scores, explanation, and input factors.
- `LearningPreference` stores bounded feedback-derived lead-time adjustments.
- `Notification` stores previews/delivery state and recommendation linkage for deduplication.
- `CalendarToken` creates private, revocable ICS-feed URLs.

## Provider and sync boundary

`CourseProvider` returns source-shaped course/task DTOs without database dependencies. `MockCanvasProvider` is the current implementation and supplies relative-date demo data plus a repeatable four-stage change story. Manual JSON and ICS are normalized into the same academic-task shape.

The sync engine owns transactional course/task upserts, comparison of mutable task fields, soft removal, `TaskEvent` creation, and `SyncRun` bookkeeping. This keeps future approved provider adapters independent of persistence behavior.

## Recommendations and learning

`recommendationEngine.ts` is deterministic and testable. Base lead time comes from task type; it is adjusted within safe bounds for reminder style, points, effort, task/course difficulty, deadline changes, and learned preferences. It returns:

- recommended start time and lead days
- priority and confidence scores
- student-readable explanation
- list of contributing factors
- start-now/overdue status

`feedbackService.ts` records immutable feedback, updates a scoped learning preference, and recalculates the user's active recommendations.

## Notifications and calendar

The notification service is preview-first and deduplicates by recipient, task, notification type, and recommendation version. Start Window Open is the primary email template; Due Soon, Deadline Changed, and Weekly Digest have a shared template boundary. Start-window feedback links use opaque, one-time, expiring database-backed tokens scoped to the owner/task/recommendation/notification. The public confirmation route consumes the token and records feedback for the token owner—not the clicker’s identity. Resend delivery is isolated behind environment configuration; preview mode is default. The calendar service generates downloadable ICS content and revocable private feed tokens containing due and recommended-start events.

## Security and integration boundary

Local development uses a seeded demo user. Production configuration rejects dev auth and reserves `AUTH_MODE=clerk` for verified identity integration. DueCue never scrapes school systems, automates logins, or stores school passwords. Canvas OAuth is a future approved integration, not an implemented claim.

# DueCue resume bullets

- Built DueCue, a full-stack academic planning app with React, Express, Prisma, and PostgreSQL that turns coursework into explainable recommended start windows rather than static due-date reminders.
- Designed a provider-based ingestion and sync pipeline with transactional external-ID upserts, soft-removal detection, staged source changes, and task-level audit events for future LMS integrations.
- Implemented a deterministic recommendation engine that combines task type, deadlines, estimated effort, points, task/course difficulty, urgency, and feedback into priority/confidence scores and human-readable rationale.
- Developed a feedback-learning loop that persists scoped timing preferences, recalculates active recommendations, and exposes the resulting signals in a responsive task-detail drawer.
- Shipped safe manual JSON and ICS import paths, preview-first/deduplicated reminders, and private revocable ICS calendar feeds without scraping school systems or collecting school credentials.
- Prepared a recruiter-ready demo with staged sync scenarios, one-click reset, deployment documentation for Vercel/Render/Neon, and automated tests across recommendation, sync, provider, import, and notification behavior.

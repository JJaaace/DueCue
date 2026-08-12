# DueCue architecture

## Phase 1–3 flow

```txt
MockCanvasProvider → Provider DTOs → Sync Engine → PostgreSQL
                                          ├─ Course / AcademicTask upserts
                                          ├─ TaskEvent change audit trail
                                          └─ SyncRun operational history
```

The frontend and API are independent npm workspaces. The backend uses a `CourseProvider` boundary so source adapters do not depend on Prisma. The sync engine resolves provider course IDs, safely upserts external identities per user/provider, compares mutable task fields, and records each change as its own event. Missing source tasks are soft-removed to preserve history.

`MockCanvasProvider` uses relative dates, so the demo remains current. Its `mockStage` connection configuration controls a repeatable four-step change story. It contains no official Canvas access and no credentials.

The recommendation engine is deterministic: task type establishes a base lead time, then style, points, difficulty, source changes, and scoped feedback preferences adjust it. It persists a recommendation and updates task status when the start window opens.

Feedback writes an immutable response plus a bounded `LearningPreference`; later calculations prioritize course+task type, task type, course, then global preferences. Notification generation is a preview-first service with a real delivery boundary reserved for a future email adapter. The calendar service uses a revocable 32-byte token and returns standards-compatible ICS due/start events.

`jobs/scheduler.ts` is backend-owned. Set `ENABLE_JOBS=true` to run local mock sync every 30 minutes and refresh recommendations/previews hourly; it is intentionally disabled by default in demo mode.

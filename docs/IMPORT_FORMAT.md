# DueCue integration paths

## Primary real integration: iCal feed sync

Paste a user-authorized calendar feed URL once. DueCue fetches the feed, creates coursework tasks, and can re-check the same URL for new events while the feed remains valid. This is the first real integration path because it avoids password collection and LMS scraping.

Calendar feeds usually provide task/event titles, due dates, and sometimes a course name, description, or link. They do **not** reliably provide submission status, grades, rubrics, exact points, full Canvas metadata, or perfect classification. After import, enrich a task in its DueCue drawer with type, estimated effort, difficulty, points, and status; DueCue recalculates its start window immediately.

The connected-feed API is authenticated and owner-scoped:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/imports/ical-feed` | Read sanitized connection and last-sync status |
| `POST /api/imports/ical-feed` | Validate, connect, and perform the first sync |
| `POST /api/imports/ical-feed/sync` | Re-sync the stored private feed without resubmitting it |
| `DELETE /api/imports/ical-feed` | Disable the connection while preserving imported tasks |

The connect body is `{ "url": "https://calendar.example.edu/private-feed.ics" }`. The private URL is never returned by these endpoints. DueCue requires HTTPS, resolves and rejects private/internal destinations, validates every redirect, pins the validated address for the outbound request, limits response size and redirects, and applies a fixed fetch deadline.

VEVENT UIDs become hashed, stable source identities. When a UID is absent, DueCue derives a deterministic fallback from the feed, inferred course, normalized title, and due date. Repeat syncs leave identical tasks unchanged, record supported title/deadline changes, and preserve user-entered difficulty, effort, points, status, and type values.

## Manual JSON

Paste an array into the Import screen:

```json
[
  {
    "courseCode": "CSE 2221",
    "courseName": "Software I",
    "title": "Project checkpoint",
    "dueAt": "2026-09-10T23:59:00.000Z",
    "type": "project",
    "pointsPossible": 40,
    "estimatedMinutes": 180,
    "difficulty": "high"
  }
]
```

Required: `courseCode`, `title`, `dueAt` (ISO 8601). The supported types are `assignment`, `quiz`, `exam`, `project`, `reading`, `discussion`, `lab`, and `other`.

## Manual JSON (secondary)

Manual JSON remains useful for demos, testing, and advanced users. It is not the primary ongoing integration path.

## Future Canvas path

The long-term path is approved official Canvas OAuth for full assignment metadata after appropriate institutional/privacy review. Do not use personal passwords or browser-derived access tokens.

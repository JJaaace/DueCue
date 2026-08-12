# Safe academic import formats

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

## iCal / ICS

Paste event data exported from a calendar you are authorized to access. DueCue reads `SUMMARY`, `DTSTART`, optional `UID`, and optional `DESCRIPTION`. It does not fetch URLs on a user’s behalf, scrape websites, or accept LMS credentials.

## Future Canvas path

The recommended future path is an official OAuth integration or a user-authorized calendar feed after appropriate institutional/privacy review. Do not use personal passwords or browser-derived access tokens.

# DueCue: 2–3 minute demo script

## Before the demo

Run `npm run db:seed` if you need a clean local baseline, then `npm run dev`. Open the frontend and use **Reset recruiter demo** if a prior walkthrough changed the staged data.

## 0:00–0:25 — Problem and Home

“Calendars show when work is due. DueCue helps students decide when to begin.” Point to **Next Cue**, the start window, score, and the summary of work worth starting today. Note that this is simulated CarmenCanvas-style data, not an official school integration.

## 0:25–1:05 — Explain the intelligence

Click **See why**. Show the recommended start time, cue score, and plain-language explanation. Point out effort, points, task level, and course load. Explain that the engine also uses task type, deadline, source changes, and feedback—and shows its factors instead of hiding them.

Click **About right**. Show the confirmation: “Got it — DueCue will adjust future cues like this.”

## 1:05–1:40 — Show change detection

Click **Run demo sync**. Explain the staged story: a new CSE project appears, then a MATH quiz moves earlier, then essay points increase. Show **Recent Changes**, then open the affected task to show its per-task sync history and adjusted timing.

## 1:40–2:15 — Show safe real-data path

Open **Import**. “DueCue deliberately does not scrape Canvas or request school passwords. Students can use demo data, paste validated task JSON, or import user-authorized ICS content. Official OAuth is a future approved path.”

Open **Calendar** and show `.ics` download/private revocable feed plus reminder preferences. Mention that notifications are preview-first by default.

## Close

“DueCue combines provider-based sync, explainable timing recommendations, and feedback-driven learning to answer the more useful student question: what should I start next?”

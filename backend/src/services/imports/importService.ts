import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";
import { recalculateUserRecommendations } from "../recommendations/recommendationService.js";
import { generateNotificationPreviews } from "../notifications/notificationService.js";

export type ImportedTask = { id?: string; courseCode: string; courseName?: string; title: string; dueAt: string; type?: "assignment" | "quiz" | "exam" | "project" | "reading" | "discussion" | "lab" | "other"; pointsPossible?: number; estimatedMinutes?: number; difficulty?: "low" | "medium" | "high"; description?: string; sourceUrl?: string };
const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 30);
const color = (code: string) => ["#60A5FA", "#A78BFA", "#F59E0B", "#34D399", "#FB7185"][code.length % 5]!;

export async function importTasks(userId: string, tasks: ImportedTask[], source: "manual_import" | "ical_feed", displayName: string, config: Prisma.InputJsonValue = { userAuthorized: true }) {
  const connection = await prisma.providerConnection.upsert({ where: { userId_provider: { userId, provider: source } }, create: { userId, provider: source, displayName, status: "connected", config }, update: { displayName, status: "connected", lastSyncAt: new Date(), config } });
  let created = 0; let updated = 0;
  for (const item of tasks) {
    const externalCourseId = `import-${digest(item.courseCode)}`;
    const course = await prisma.course.upsert({ where: { userId_providerId_externalId: { userId, providerId: source, externalId: externalCourseId } }, create: { userId, providerId: source, externalId: externalCourseId, code: item.courseCode, name: item.courseName ?? item.courseCode, color: color(item.courseCode), lastSyncedAt: new Date() }, update: { name: item.courseName ?? item.courseCode, lastSyncedAt: new Date(), active: true } });
    const externalId = item.id ?? digest(`${item.courseCode}:${item.title}:${item.dueAt}`);
    const existing = await prisma.academicTask.findUnique({ where: { userId_providerId_externalId: { userId, providerId: source, externalId } } });
    const data = { courseId: course.id, title: item.title, description: item.description, dueAt: new Date(item.dueAt), type: item.type ?? "assignment", pointsPossible: item.pointsPossible, estimatedMinutes: item.estimatedMinutes, difficulty: item.difficulty ?? "medium", sourceUrl: item.sourceUrl, rawSource: { import: source, userAuthorized: true } };
    if (existing) { await prisma.academicTask.update({ where: { id: existing.id }, data }); updated++; }
    else { const task = await prisma.academicTask.create({ data: { userId, providerId: source, externalId, status: "upcoming", ...data } }); await prisma.taskEvent.create({ data: { userId, taskId: task.id, eventType: "created", newValue: { title: task.title, source } } }); created++; }
  }
  await prisma.providerConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date() } });
  await recalculateUserRecommendations(userId); await generateNotificationPreviews(userId);
  return { created, updated, imported: tasks.length };
}

export async function importIcalFeedUrl(userId: string, feedUrl: string) {
  const response = await fetch(feedUrl, { headers: { Accept: "text/calendar, text/plain;q=0.8" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Calendar feed returned ${response.status} ${response.statusText}.`);
  const ical = await response.text(); if (ical.length > 2_000_000) throw new Error("Calendar feed is too large (maximum 2 MB).");
  const tasks = parseIcal(ical); if (!tasks.length) throw new Error("No events with SUMMARY and DTSTART were found in this calendar feed.");
  return importTasks(userId, tasks, "ical_feed", "User-authorized iCal feed", { userAuthorized: true, feedUrl, syncMode: "user_provided_feed" });
}

export function parseIcal(text: string): ImportedTask[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/); const events: Record<string, string>[] = []; let event: Record<string, string> | null = null;
  for (const line of unfolded) { if (line === "BEGIN:VEVENT") event = {}; else if (line === "END:VEVENT" && event) { events.push(event); event = null; } else if (event) { const index = line.indexOf(":"); if (index > 0) event[line.slice(0, index).split(";")[0]!] = line.slice(index + 1); } }
  return events.filter((event) => event.SUMMARY && event.DTSTART).map((event) => ({ id: event.UID, courseCode: "Imported", courseName: "Calendar import", title: event.SUMMARY!.replace(/^Due:\s*/i, ""), dueAt: icalDate(event.DTSTART!), description: event.DESCRIPTION?.replace(/\\n/g, "\n"), type: classify(event.SUMMARY!) }));
}
function icalDate(value: string) { const match = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/); if (!match) throw new Error(`Unsupported iCal date: ${value}`); const [, y, m, d, hh = "23", mm = "59", ss = "00"] = match; return new Date(Date.UTC(+y!, +m! - 1, +d!, +hh!, +mm!, +ss!)).toISOString(); }
function classify(title: string): ImportedTask["type"] { const lower = title.toLowerCase(); if (/exam|midterm|final/.test(lower)) return "exam"; if (/quiz/.test(lower)) return "quiz"; if (/project|essay|paper/.test(lower)) return "project"; if (/lab/.test(lower)) return "lab"; if (/read/.test(lower)) return "reading"; if (/discussion/.test(lower)) return "discussion"; return "assignment"; }

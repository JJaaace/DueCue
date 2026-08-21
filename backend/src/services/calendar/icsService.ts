import { prisma } from "../../lib/prisma.js";

const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export async function calendarIcs(userId: string) {
  const tasks = await prisma.academicTask.findMany({ where: { userId, providerId: { not: "mock_canvas" }, removedAt: null }, include: { course: true, recommendations: { where: { userId }, orderBy: { updatedAt: "desc" }, take: 1 } }, orderBy: { dueAt: "asc" } });
  const events = tasks.flatMap((task) => {
    const due = [`BEGIN:VEVENT`, `UID:duecue-due-${task.id}@duecue.local`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(task.dueAt)}`, `SUMMARY:${escape(`Due: ${task.course.code} ${task.title}`)}`, `DESCRIPTION:${escape(task.description ?? "DueCue academic deadline")}`, `END:VEVENT`];
    const recommendation = task.recommendations[0];
    const start = recommendation ? [`BEGIN:VEVENT`, `UID:duecue-start-${task.id}@duecue.local`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(recommendation.recommendedStartAt)}`, `SUMMARY:${escape(`Start: ${task.course.code} ${task.title}`)}`, `DESCRIPTION:${escape(recommendation.explanation)}`, `END:VEVENT`] : [];
    return [...due, ...start];
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DueCue//Academic Cues//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}

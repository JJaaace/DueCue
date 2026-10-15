import { prisma } from "../../lib/prisma.js";
import { enqueueCalendarPostImport } from "../imports/calendarPostImport.js";

export const INACTIVE_TASK_STATUSES = ["done", "dismissed"] as const;

export function localDateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isBeforeLocalToday(value: Date, timeZone: string, now = new Date()) {
  return localDateKey(value, timeZone) < localDateKey(now, timeZone);
}

export function importableCalendarTasks<T extends { dueAt: string; externalId: string }>(tasks: T[], timeZone: string, existingExternalIds: ReadonlySet<string>, now = new Date()) {
  return tasks.filter((task) => existingExternalIds.has(task.externalId) || !isBeforeLocalToday(new Date(task.dueAt), timeZone, now));
}

export function nextTaskLifecycleStatus(action: "complete" | "dismiss" | "restore", dueAt: Date, now = new Date()) {
  if (action === "complete") return "done" as const;
  if (action === "dismiss") return "dismissed" as const;
  return dueAt <= now ? "overdue" as const : "upcoming" as const;
}

async function importedHistoricalTasks(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const timeZone = user?.timezone || "America/New_York";
  const tasks = await prisma.academicTask.findMany({
    where: { userId, providerId: "ical_feed", removedAt: null, status: { notIn: [...INACTIVE_TASK_STATUSES] } },
    select: { id: true, title: true, dueAt: true, status: true },
    orderBy: { dueAt: "asc" },
  });
  return { timeZone, tasks: tasks.filter((task) => isBeforeLocalToday(task.dueAt, timeZone, now)) };
}

export async function previewHistoricalImportedTasks(userId: string, now = new Date()) {
  const { timeZone, tasks } = await importedHistoricalTasks(userId, now);
  return {
    count: tasks.length,
    timeZone,
    tasks: tasks.slice(0, 100).map((task) => ({ id: task.id, title: task.title, dueAt: task.dueAt.toISOString(), status: task.status })),
  };
}

export async function changeTaskLifecycle(userId: string, taskId: string, action: "complete" | "dismiss" | "restore") {
  const task = await prisma.academicTask.findFirst({ where: { id: taskId, userId, providerId: { not: "mock_canvas" } } });
  if (!task) return null;
  const nextStatus = nextTaskLifecycleStatus(action, task.dueAt);
  const eventType = action === "complete" ? "completed" : action === "dismiss" ? "dismissed" : "restored";
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.academicTask.update({ where: { id: task.id }, data: { status: nextStatus } });
    await transaction.taskEvent.create({ data: { userId, taskId: task.id, eventType, previousValue: { status: task.status }, newValue: { status: nextStatus } } });
    if (action !== "restore") await transaction.notification.deleteMany({ where: { userId, taskId: task.id, status: { in: ["preview", "scheduled"] } } });
    return result;
  });
  enqueueCalendarPostImport(userId, `task-${task.id}-${Date.now()}`);
  return updated;
}

export async function applyHistoricalImportedTaskAction(userId: string, action: "complete" | "dismiss", ids?: string[], now = new Date()) {
  const { tasks } = await importedHistoricalTasks(userId, now);
  const requested = ids ? new Set(ids) : null;
  const selected = requested ? tasks.filter((task) => requested.has(task.id)) : tasks;
  if (!selected.length) return { updated: 0 };
  const nextStatus = action === "complete" ? "done" : "dismissed";
  const eventType = action === "complete" ? "completed" : "dismissed";
  await prisma.$transaction(async (transaction) => {
    await transaction.academicTask.updateMany({ where: { userId, id: { in: selected.map((task) => task.id) } }, data: { status: nextStatus } });
    await transaction.taskEvent.createMany({ data: selected.map((task) => ({ userId, taskId: task.id, eventType, previousValue: { status: task.status }, newValue: { status: nextStatus } })) });
    await transaction.notification.deleteMany({ where: { userId, taskId: { in: selected.map((task) => task.id) }, status: { in: ["preview", "scheduled"] } } });
  });
  enqueueCalendarPostImport(userId, `bulk-${Date.now()}`);
  return { updated: selected.length };
}

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { generateNotificationPreviews } from "../notifications/notificationService.js";
import { recalculateUserRecommendations } from "../recommendations/recommendationService.js";
import {
  CalendarFeedError,
  feedFingerprint,
  fetchCalendarFeed,
  parseCalendarFeed,
  validateCalendarFeedUrl,
  type CalendarTaskType,
  type ParsedCalendarTask,
} from "./calendarFeed.js";

export { CalendarFeedError, parseCalendarFeed, validateCalendarFeedUrl } from "./calendarFeed.js";

export type ImportedTask = {
  id?: string;
  courseCode: string;
  courseName?: string;
  title: string;
  dueAt: string;
  type?: CalendarTaskType;
  pointsPossible?: number;
  estimatedMinutes?: number;
  difficulty?: "low" | "medium" | "high";
  description?: string;
  sourceUrl?: string;
};

type FeedConfig = {
  userAuthorized: true;
  feedUrl?: string;
  providerHost?: string;
  enabled: boolean;
  syncMode: "user_provided_feed";
};

export type CalendarSyncCounts = {
  eventsFound: number;
  tasksCreated: number;
  tasksUpdated: number;
  tasksUnchanged: number;
  tasksSkipped: number;
};

export type CalendarFeedSource = {
  type: "calendar_feed";
  status: "connected" | "disconnected" | "error";
  displayName: string;
  providerHost?: string;
  lastSyncAt: string | null;
  lastAttemptAt: string | null;
};

export type CalendarSyncResponse = {
  success: true;
  source: CalendarFeedSource;
  sync: CalendarSyncCounts;
};

const activeCalendarSyncs = new Set<string>();

async function withCalendarSyncLock<T>(userId: string, operation: () => Promise<T>) {
  if (activeCalendarSyncs.has(userId)) throw new CalendarFeedError("calendar_sync_in_progress", 409, "This calendar is already syncing. Wait a moment, then try again.");
  activeCalendarSyncs.add(userId);
  try { return await operation(); }
  finally { activeCalendarSyncs.delete(userId); }
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 30);
const color = (code: string) => ["#60A5FA", "#A78BFA", "#F59E0B", "#34D399", "#FB7185"][code.length % 5]!;

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function feedConfig(value: Prisma.JsonValue | null | undefined): FeedConfig | null {
  const config = jsonObject(value);
  if (config.userAuthorized !== true) return null;
  const legacyFeedUrl = typeof config.feedUrl === "string" ? config.feedUrl : undefined;
  return {
    userAuthorized: true,
    enabled: typeof config.enabled === "boolean" ? config.enabled : Boolean(legacyFeedUrl),
    syncMode: "user_provided_feed",
    feedUrl: legacyFeedUrl,
    providerHost: typeof config.providerHost === "string" ? config.providerHost : legacyFeedUrl ? (() => { try { return new URL(legacyFeedUrl).hostname; } catch { return undefined; } })() : undefined,
  };
}

function enrichedFields(rawSource: Prisma.JsonValue | null | undefined) {
  const raw = jsonObject(rawSource);
  return Array.isArray(raw.enrichedFields) ? raw.enrichedFields.filter((field): field is string => typeof field === "string") : [];
}

function calendarRawSource(item: ParsedCalendarTask, prior: Prisma.JsonValue | null | undefined, fields: string[]) {
  const retained = { ...jsonObject(prior) };
  delete retained.sourceUidHash;
  delete retained.location;
  return {
    ...retained,
    import: "ical_feed",
    enrichedFields: fields,
    ...(item.sourceUid ? { sourceUidHash: item.sourceUid } : {}),
    ...(item.location ? { location: item.location } : {}),
  } satisfies Prisma.InputJsonObject;
}

function sourceFor(connection: { status: string; displayName: string; lastSyncAt: Date | null; config: Prisma.JsonValue | null }, lastAttemptAt: Date | null): CalendarFeedSource {
  const config = feedConfig(connection.config);
  return {
    type: "calendar_feed",
    status: connection.status === "connected" ? "connected" : connection.status === "error" ? "error" : "disconnected",
    displayName: connection.displayName,
    providerHost: config?.providerHost,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    lastAttemptAt: lastAttemptAt?.toISOString() ?? null,
  };
}

export async function importTasks(userId: string, tasks: ImportedTask[], source: "manual_import" | "ical_feed", displayName: string, config: Prisma.InputJsonValue = { userAuthorized: true }) {
  const connection = await prisma.providerConnection.upsert({
    where: { userId_provider: { userId, provider: source } },
    create: { userId, provider: source, displayName, status: "connected", config },
    update: { displayName, status: "connected", lastSyncAt: new Date(), config },
  });
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const item of tasks) {
    const externalCourseId = `import-${digest(item.courseCode)}`;
    const course = await prisma.course.upsert({
      where: { userId_providerId_externalId: { userId, providerId: source, externalId: externalCourseId } },
      create: { userId, providerId: source, externalId: externalCourseId, code: item.courseCode, name: item.courseName ?? item.courseCode, color: color(item.courseCode), lastSyncedAt: new Date() },
      update: { name: item.courseName ?? item.courseCode, lastSyncedAt: new Date(), active: true },
    });
    const externalId = item.id ?? digest(`${item.courseCode}:${item.title}:${item.dueAt}`);
    const existing = await prisma.academicTask.findUnique({ where: { userId_providerId_externalId: { userId, providerId: source, externalId } } });
    const next = {
      courseId: course.id,
      title: item.title,
      description: item.description ?? existing?.description,
      dueAt: new Date(item.dueAt),
      type: item.type ?? existing?.type ?? "assignment" as const,
      pointsPossible: item.pointsPossible ?? existing?.pointsPossible,
      estimatedMinutes: item.estimatedMinutes ?? existing?.estimatedMinutes,
      difficulty: item.difficulty ?? existing?.difficulty ?? "medium" as const,
      sourceUrl: item.sourceUrl ?? existing?.sourceUrl,
      rawSource: { import: source, userAuthorized: true },
    };
    if (existing) {
      const changed = existing.title !== next.title || existing.dueAt.getTime() !== next.dueAt.getTime() || existing.courseId !== next.courseId;
      if (changed) { await prisma.academicTask.update({ where: { id: existing.id }, data: next }); updated += 1; }
      else unchanged += 1;
    } else {
      const task = await prisma.academicTask.create({ data: { userId, providerId: source, externalId, status: "upcoming", ...next } });
      await prisma.taskEvent.create({ data: { userId, taskId: task.id, eventType: "created", newValue: { title: task.title, source } } });
      created += 1;
    }
  }
  await prisma.providerConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date() } });
  await recalculateUserRecommendations(userId);
  await generateNotificationPreviews(userId);
  return { created, updated, unchanged, imported: tasks.length };
}

export async function syncCalendarTasks(userId: string, tasks: ParsedCalendarTask[]) {
  return prisma.$transaction(async (transaction) => {
    let tasksCreated = 0;
    let tasksUpdated = 0;
    let tasksUnchanged = 0;
    for (const item of tasks) {
      const externalCourseId = `calendar-${digest(item.courseCode)}`;
      const course = await transaction.course.upsert({
        where: { userId_providerId_externalId: { userId, providerId: "ical_feed", externalId: externalCourseId } },
        create: { userId, providerId: "ical_feed", externalId: externalCourseId, code: item.courseCode, name: item.courseName, color: color(item.courseCode), lastSyncedAt: new Date() },
        update: { name: item.courseName, active: true, lastSyncedAt: new Date() },
      });
      const existing = await transaction.academicTask.findUnique({ where: { userId_providerId_externalId: { userId, providerId: "ical_feed", externalId: item.externalId } } });
      if (!existing) {
        const created = await transaction.academicTask.create({ data: {
          userId,
          courseId: course.id,
          providerId: "ical_feed",
          externalId: item.externalId,
          title: item.title,
          description: item.description,
          dueAt: new Date(item.dueAt),
          type: item.type,
          difficulty: "medium",
          status: "upcoming",
          sourceUrl: item.sourceUrl,
          rawSource: calendarRawSource(item, null, []),
        } });
        await transaction.taskEvent.create({ data: { userId, taskId: created.id, eventType: "created", newValue: { title: created.title, source: "ical_feed" } } });
        tasksCreated += 1;
        continue;
      }
      const protectedFields = new Set(enrichedFields(existing.rawSource));
      // Existing type is user-managed after import. New tasks receive deterministic source classification.
      const nextType = existing.type;
      const nextDescription = item.description ?? existing.description;
      const nextSourceUrl = item.sourceUrl ?? existing.sourceUrl;
      const nextDueAt = new Date(item.dueAt);
      const priorRawSource = jsonObject(existing.rawSource);
      const priorLocation = typeof priorRawSource.location === "string" ? priorRawSource.location : undefined;
      const dueChanged = existing.dueAt.getTime() !== nextDueAt.getTime();
      const titleChanged = existing.title !== item.title;
      const changed = dueChanged
        || titleChanged
        || existing.courseId !== course.id
        || existing.description !== nextDescription
        || existing.type !== nextType
        || existing.sourceUrl !== nextSourceUrl
        || priorLocation !== item.location
        || existing.removedAt !== null;
      if (!changed) { tasksUnchanged += 1; continue; }
      await transaction.academicTask.update({ where: { id: existing.id }, data: {
        courseId: course.id,
        title: item.title,
        description: nextDescription,
        dueAt: nextDueAt,
        type: nextType,
        sourceUrl: nextSourceUrl,
        removedAt: null,
        rawSource: calendarRawSource(item, existing.rawSource, [...protectedFields]),
      } });
      if (dueChanged) await transaction.taskEvent.create({ data: { userId, taskId: existing.id, eventType: "due_date_changed", previousValue: { dueAt: existing.dueAt.toISOString() }, newValue: { dueAt: nextDueAt.toISOString() } } });
      if (titleChanged) await transaction.taskEvent.create({ data: { userId, taskId: existing.id, eventType: "title_changed", previousValue: { title: existing.title }, newValue: { title: item.title } } });
      if (!dueChanged && !titleChanged) await transaction.taskEvent.create({ data: { userId, taskId: existing.id, eventType: "updated", newValue: { source: "ical_feed" } } });
      tasksUpdated += 1;
    }
    return { tasksCreated, tasksUpdated, tasksUnchanged };
  });
}

function countsFromMetadata(value: Prisma.JsonValue | null): CalendarSyncCounts {
  const metadata = jsonObject(value);
  const number = (name: string) => typeof metadata[name] === "number" ? metadata[name] as number : 0;
  return { eventsFound: number("eventsFound"), tasksCreated: number("tasksCreated"), tasksUpdated: number("tasksUpdated"), tasksUnchanged: number("tasksUnchanged"), tasksSkipped: number("tasksSkipped") };
}

async function performCalendarSync(userId: string, rawUrl: string): Promise<CalendarSyncResponse> {
  const startedAt = Date.now();
  let connection = await prisma.providerConnection.findUnique({ where: { userId_provider: { userId, provider: "ical_feed" } } });
  let syncRunId: string | undefined;
  let providerHost = connection ? feedConfig(connection.config)?.providerHost : undefined;
  console.info("calendar_sync_started", { userId, provider: providerHost ?? "pending-validation" });
  try {
    const validated = await validateCalendarFeedUrl(rawUrl);
    providerHost = validated.hostname;
    const config: FeedConfig = { userAuthorized: true, feedUrl: rawUrl, providerHost, enabled: true, syncMode: "user_provided_feed" };
    connection = await prisma.providerConnection.upsert({
      where: { userId_provider: { userId, provider: "ical_feed" } },
      create: { userId, provider: "ical_feed", displayName: providerHost.includes("instructure.com") ? "Canvas school calendar" : "School calendar", status: "error", config },
      update: { displayName: providerHost.includes("instructure.com") ? "Canvas school calendar" : "School calendar", config },
    });
    const syncRun = await prisma.syncRun.create({ data: { userId, providerConnectionId: connection.id, status: "started" } });
    syncRunId = syncRun.id;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    if (!user) throw new Error("Authenticated user workspace was not found.");
    const fetched = await fetchCalendarFeed(rawUrl);
    providerHost = fetched.hostname;
    const parsed = parseCalendarFeed(fetched.text, { defaultTimeZone: user.timezone, sourceFingerprint: feedFingerprint(rawUrl) });
    await prisma.syncRun.update({ where: { id: syncRun.id }, data: { tasksFound: parsed.tasks.length, metadata: { eventsFound: parsed.eventsFound, tasksSkipped: parsed.skipped } } });
    const taskCounts = await syncCalendarTasks(userId, parsed.tasks);
    const counts: CalendarSyncCounts = { eventsFound: parsed.eventsFound, ...taskCounts, tasksSkipped: parsed.skipped };
    const finishedAt = new Date();
    await prisma.$transaction([
      prisma.syncRun.update({ where: { id: syncRun.id }, data: { status: "success", finishedAt, tasksCreated: counts.tasksCreated, tasksUpdated: counts.tasksUpdated, metadata: counts } }),
      prisma.providerConnection.update({ where: { id: connection.id }, data: { status: "connected", lastSyncAt: finishedAt } }),
    ]);
    if (parsed.tasks.length) {
      await recalculateUserRecommendations(userId);
      await generateNotificationPreviews(userId);
    }
    console.info("calendar_sync_completed", { userId, provider: providerHost, ...counts, durationMs: Date.now() - startedAt });
    return { success: true, source: sourceFor({ ...connection, status: "connected", lastSyncAt: finishedAt }, syncRun.startedAt), sync: counts };
  } catch (error) {
    const safeMessage = error instanceof CalendarFeedError ? error.message : "Calendar sync could not be completed.";
    if (connection) await prisma.providerConnection.update({ where: { id: connection.id }, data: { status: "error" } }).catch(() => undefined);
    if (syncRunId) await prisma.syncRun.update({ where: { id: syncRunId }, data: { status: "failed", finishedAt: new Date(), errorMessage: safeMessage } }).catch(() => undefined);
    console.warn("calendar_sync_failed", { userId, provider: providerHost ?? "unknown", code: error instanceof CalendarFeedError ? error.code : "internal_error", durationMs: Date.now() - startedAt });
    if (error instanceof CalendarFeedError) throw error;
    throw new CalendarFeedError("calendar_sync_failed", 500, "DueCue could not complete the calendar sync. Please try again in a moment.");
  }
}

export async function connectCalendarFeed(userId: string, feedUrl: string) {
  return withCalendarSyncLock(userId, () => performCalendarSync(userId, feedUrl));
}

export async function syncConnectedCalendarFeed(userId: string) {
  return withCalendarSyncLock(userId, async () => {
    const connection = await prisma.providerConnection.findUnique({ where: { userId_provider: { userId, provider: "ical_feed" } } });
    const config = connection ? feedConfig(connection.config) : null;
    if (!connection || !config?.enabled || !config.feedUrl) throw new CalendarFeedError("invalid_calendar_url", 400, "No school calendar is connected yet.");
    const latest = await prisma.syncRun.findFirst({ where: { userId, providerConnectionId: connection.id, status: "success" }, orderBy: { startedAt: "desc" } });
    if (latest && Date.now() - latest.startedAt.getTime() < 5_000) {
      return { success: true, source: sourceFor(connection, latest.startedAt), sync: countsFromMetadata(latest.metadata) } satisfies CalendarSyncResponse;
    }
    return performCalendarSync(userId, config.feedUrl);
  });
}

export async function getCalendarFeedState(userId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { userId_provider: { userId, provider: "ical_feed" } } });
  if (!connection) return { source: null, sync: null };
  const latest = await prisma.syncRun.findFirst({ where: { userId, providerConnectionId: connection.id }, orderBy: { startedAt: "desc" } });
  return { source: sourceFor(connection, latest?.startedAt ?? null), sync: latest?.status === "success" ? countsFromMetadata(latest.metadata) : null };
}

export async function disconnectCalendarFeed(userId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { userId_provider: { userId, provider: "ical_feed" } } });
  if (!connection) return { success: true, source: null };
  const config = feedConfig(connection.config);
  await prisma.providerConnection.update({ where: { id: connection.id }, data: {
    status: "disconnected",
    config: { userAuthorized: true, ...(config?.providerHost ? { providerHost: config.providerHost } : {}), enabled: false, syncMode: "user_provided_feed" },
  } });
  return { success: true, source: null };
}

/** Backward-compatible entry point for the existing route name. */
export const importIcalFeedUrl = connectCalendarFeed;

/** Backward-compatible parser used by manual iCal import and existing callers. */
export function parseIcal(text: string): ImportedTask[] {
  return parseCalendarFeed(text).tasks.map((task) => ({
    id: task.externalId,
    courseCode: task.courseCode,
    courseName: task.courseName,
    title: task.title,
    dueAt: task.dueAt,
    type: task.type,
    description: task.description,
    sourceUrl: task.sourceUrl,
  }));
}

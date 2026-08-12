import { Prisma, TaskEventType, type ProviderConnection } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getProvider } from "../providers/providerRegistry.js";
import { recalculateUserRecommendations } from "../recommendations/recommendationService.js";
import { generateNotificationPreviews } from "../notifications/notificationService.js";
import type { ProviderTask } from "../../types/provider.js";

type SyncCounts = { tasksCreated: number; tasksUpdated: number; tasksRemoved: number };

type ExistingTask = { title: string; dueAt: Date; pointsPossible: number | null };

export function detectTaskChanges(existing: ExistingTask, incoming: ProviderTask): Array<{ type: TaskEventType; previousValue: Prisma.InputJsonValue; newValue: Prisma.InputJsonValue }> {
  const changes: Array<{ type: TaskEventType; previousValue: Prisma.InputJsonValue; newValue: Prisma.InputJsonValue }> = [];
  if (existing.title !== incoming.title) changes.push({ type: "title_changed", previousValue: { title: existing.title }, newValue: { title: incoming.title } });
  if (existing.dueAt.toISOString() !== new Date(incoming.dueAt).toISOString()) changes.push({ type: "due_date_changed", previousValue: { dueAt: existing.dueAt.toISOString() }, newValue: { dueAt: incoming.dueAt } });
  if ((existing.pointsPossible ?? null) !== (incoming.pointsPossible ?? null)) changes.push({ type: "points_changed", previousValue: { pointsPossible: existing.pointsPossible }, newValue: { pointsPossible: incoming.pointsPossible ?? null } });
  return changes;
}

function providerConfig(connection: ProviderConnection): Record<string, unknown> {
  return connection.config && typeof connection.config === "object" && !Array.isArray(connection.config)
    ? connection.config as Record<string, unknown>
    : {};
}

export async function runSync(userId: string, connectionId: string) {
  const connection = await prisma.providerConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) throw new Error("Provider connection was not found for this user.");

  const syncRun = await prisma.syncRun.create({ data: { userId, providerConnectionId: connection.id } });
  try {
    const provider = getProvider(connection.provider);
    const result = await provider.sync(userId, connection.id, providerConfig(connection));
    const counts = await prisma.$transaction(async (tx) => {
      const courseIds = new Map<string, string>();
      for (const course of result.courses) {
        const saved = await tx.course.upsert({
          where: { userId_providerId_externalId: { userId, providerId: provider.providerId, externalId: course.externalId } },
          create: { userId, providerId: provider.providerId, externalId: course.externalId, code: course.code, name: course.name, instructorName: course.instructorName, term: course.term, color: course.color ?? "#5EEAD4", difficulty: course.difficulty ?? "normal", lastSyncedAt: new Date() },
          update: { code: course.code, name: course.name, instructorName: course.instructorName, term: course.term, color: course.color, difficulty: course.difficulty, active: true, lastSyncedAt: new Date() },
        });
        courseIds.set(course.externalId, saved.id);
      }
      const counts: SyncCounts = { tasksCreated: 0, tasksUpdated: 0, tasksRemoved: 0 };
      for (const incoming of result.tasks) {
        const courseId = courseIds.get(incoming.courseExternalId);
        if (!courseId) throw new Error(`Task '${incoming.externalId}' references unknown course '${incoming.courseExternalId}'.`);
        const existing = await tx.academicTask.findUnique({ where: { userId_providerId_externalId: { userId, providerId: provider.providerId, externalId: incoming.externalId } } });
        const taskData = {
          courseId, title: incoming.title, description: incoming.description, type: incoming.type ?? "other", dueAt: new Date(incoming.dueAt),
          availableAt: incoming.availableAt ? new Date(incoming.availableAt) : null, pointsPossible: incoming.pointsPossible, estimatedMinutes: incoming.estimatedMinutes,
          difficulty: incoming.difficulty ?? "medium", sourceUrl: incoming.sourceUrl, rawSource: incoming.rawSource as Prisma.InputJsonValue | undefined, removedAt: null,
        };
        if (!existing) {
          const created = await tx.academicTask.create({ data: { userId, providerId: provider.providerId, externalId: incoming.externalId, status: "upcoming", ...taskData } });
          await tx.taskEvent.create({ data: { userId, taskId: created.id, eventType: "created", newValue: { title: created.title, dueAt: created.dueAt.toISOString(), source: provider.providerId } } });
          counts.tasksCreated++;
          continue;
        }
        const changes = detectTaskChanges(existing, incoming);
        await tx.academicTask.update({ where: { id: existing.id }, data: taskData });
        if (changes.length) {
          counts.tasksUpdated++;
          for (const change of changes) await tx.taskEvent.create({ data: { userId, taskId: existing.id, eventType: change.type, previousValue: change.previousValue, newValue: change.newValue } });
        }
      }
      const sourceIds = result.tasks.map((task) => task.externalId);
      const missing = await tx.academicTask.findMany({ where: { userId, providerId: provider.providerId, externalId: { notIn: sourceIds }, removedAt: null }, select: { id: true, externalId: true } });
      for (const task of missing) {
        await tx.academicTask.update({ where: { id: task.id }, data: { removedAt: new Date() } });
        await tx.taskEvent.create({ data: { userId, taskId: task.id, eventType: "removed", previousValue: { externalId: task.externalId }, newValue: { removedAt: new Date().toISOString() } } });
        counts.tasksRemoved++;
      }
      return counts;
    });
    const completedRun = await prisma.$transaction(async (tx) => {
      await tx.providerConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), status: "demo" } });
      return tx.syncRun.update({ where: { id: syncRun.id }, data: { status: "success", finishedAt: new Date(), coursesFound: result.courses.length, tasksFound: result.tasks.length, ...counts, metadata: result.metadata as Prisma.InputJsonValue } });
    });
    await recalculateUserRecommendations(userId);
    await generateNotificationPreviews(userId);
    return completedRun;
  } catch (error) {
    await prisma.syncRun.update({ where: { id: syncRun.id }, data: { status: "failed", finishedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown sync error" } });
    throw error;
  }
}

export async function setMockStage(userId: string, connectionId: string, stage: number) {
  const connection = await prisma.providerConnection.findFirst({ where: { id: connectionId, userId, provider: "mock_canvas" } });
  if (!connection) throw new Error("Mock Canvas connection was not found for this user.");
  const config = { ...providerConfig(connection), mockStage: stage };
  return prisma.providerConnection.update({ where: { id: connection.id }, data: { config } });
}

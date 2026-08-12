import { prisma } from "../../lib/prisma.js";
import { calculateRecommendation } from "./recommendationEngine.js";

async function preferenceFor(userId: string, courseId: string, taskType: string) {
  const preferences = await prisma.learningPreference.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  return preferences.find((item) => item.scopeType === "course_task_type" && item.courseId === courseId && item.taskType === taskType)
    ?? preferences.find((item) => item.scopeType === "task_type" && item.taskType === taskType)
    ?? preferences.find((item) => item.scopeType === "course" && item.courseId === courseId)
    ?? preferences.find((item) => item.scopeType === "global");
}

export async function recalculateTaskRecommendation(userId: string, taskId: string) {
  const task = await prisma.academicTask.findFirst({ where: { id: taskId, userId }, include: { course: true } });
  if (!task || task.removedAt || task.status === "done") return null;
  const [settings, preference, dueEvent] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    preferenceFor(userId, task.courseId, task.type),
    prisma.taskEvent.findFirst({ where: { taskId, eventType: "due_date_changed" }, orderBy: { createdAt: "desc" } }),
  ]);
  const calculated = calculateRecommendation({ type: task.type, dueAt: task.dueAt, pointsPossible: task.pointsPossible, estimatedMinutes: task.estimatedMinutes, taskDifficulty: task.difficulty, courseDifficulty: task.course.difficulty, reminderStyle: settings?.reminderStyle ?? "balanced", adjustmentDays: preference?.leadTimeAdjustmentDays, sampleSize: preference?.sampleSize, dueDateChanged: Boolean(dueEvent) });
  const { shouldStartNow, isOverdue, factors, ...recommendationData } = calculated;
  const status = isOverdue ? "overdue" : shouldStartNow ? "start_now" : "upcoming";
  const existing = await prisma.recommendation.findFirst({ where: { userId, taskId }, orderBy: { version: "desc" } });
  const recommendation = existing
    ? await prisma.recommendation.update({ where: { id: existing.id }, data: { ...recommendationData, factors: { factors }, estimatedEffortMinutes: task.estimatedMinutes, version: existing.version + 1 } })
    : await prisma.recommendation.create({ data: { userId, taskId, ...recommendationData, factors: { factors }, estimatedEffortMinutes: task.estimatedMinutes } });
  await prisma.academicTask.update({ where: { id: taskId }, data: { status } });
  return recommendation;
}

export async function recalculateUserRecommendations(userId: string) {
  const tasks = await prisma.academicTask.findMany({ where: { userId, removedAt: null, status: { not: "done" } }, select: { id: true } });
  return Promise.all(tasks.map((task) => recalculateTaskRecommendation(userId, task.id)));
}

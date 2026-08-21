import type { FeedbackType, TaskType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recalculateUserRecommendations } from "../recommendations/recommendationService.js";

const DELTAS: Record<FeedbackType, number> = { too_early: -0.5, about_right: 0, too_late: 0.5, need_more_time: 1, need_less_time: -1, not_relevant: 0 };

export async function recordFeedback(userId: string, input: { taskId?: string; recommendationId?: string; notificationId?: string; feedbackType: FeedbackType; comment?: string }) {
  const task = input.taskId ? await prisma.academicTask.findFirst({ where: { id: input.taskId, userId, providerId: { not: "mock_canvas" } } }) : null;
  if (input.taskId && !task) throw new Error("Task was not found in the real workspace.");
  const feedback = await prisma.feedback.create({ data: { userId, ...input } });
  if (task && input.feedbackType !== "not_relevant") {
    const existing = await prisma.learningPreference.findFirst({ where: { userId, scopeType: "task_type", taskType: task.type }, orderBy: { updatedAt: "desc" } });
    const sampleSize = (existing?.sampleSize ?? 0) + 1;
    const adjustment = Math.min(4, Math.max(-4, (existing?.leadTimeAdjustmentDays ?? 0) + DELTAS[input.feedbackType]));
    const confidence = Math.min(0.95, 0.35 + sampleSize * 0.08);
    if (existing) await prisma.learningPreference.update({ where: { id: existing.id }, data: { leadTimeAdjustmentDays: adjustment, confidence, sampleSize, lastUpdatedAt: new Date() } });
    else await prisma.learningPreference.create({ data: { userId, scopeType: "task_type", taskType: task.type, leadTimeAdjustmentDays: adjustment, confidence, sampleSize } });
    await recalculateUserRecommendations(userId);
  }
  return feedback;
}

export async function learningInsights(userId: string) {
  const preferences = await prisma.learningPreference.findMany({ where: { userId }, include: { course: { select: { code: true } } }, orderBy: { updatedAt: "desc" } });
  return preferences.map((preference) => ({ ...preference, label: preference.scopeType === "task_type" ? `${preference.taskType} timing` : preference.course ? `${preference.course.code} timing` : "Overall timing" }));
}

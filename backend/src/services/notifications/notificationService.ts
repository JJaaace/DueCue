import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { createEmailFeedbackToken } from "../feedback/emailFeedbackService.js";
import { emailTemplate } from "./emailTemplates.js";

async function sendResendEmail(message: { to: string; subject: string; body: string }) {
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.body }) });
  if (!response.ok) throw new Error(`Resend delivery failed: ${await response.text()}`);
  return (await response.json()) as { id: string };
}
const formatStartWindow = (date: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hourCycle: "h12" }).format(date);
export const privateExplanationFor = (explanation: string, relationship: string) => relationship === "parent_guardian" && /target grade|course is .*below/i.test(explanation) ? "DueCue recommends starting now based on the deadline, effort, and coursework timing." : explanation;
type DigestTask = { title: string; dueAt: Date; type: string; course: { code: string; currentGradePercent: number | null; targetGradePercent: number | null } };
export function buildWeeklyDigestText(tasks: Array<{ task: DigestTask; priorityScore: number; recommendedStartAt: Date }>, changes: Array<{ eventType: string; task: { title: string } }>, learningLabel?: string, includeGradeSignal = true, now = new Date()) {
  const week = tasks.filter(({ task }) => task.dueAt.getTime() <= now.getTime() + 7 * 86_400_000).sort((a, b) => b.priorityScore - a.priorityScore);
  const top = week.slice(0, 3); const dayCounts = new Map<string, number>();
  week.forEach(({ task }) => { const day = task.dueAt.toLocaleDateString("en-US", { weekday: "long" }); dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1); });
  const heavy = [...dayCounts.entries()].find(([, count]) => count >= 2);
  const lines = ["Here’s what deserves attention this week:", ...top.map((item, index) => `${index + 1}. Start ${item.task.course.code} ${item.task.title} — due ${item.task.dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`)];
  if (heavy) lines.push(`\nWorkload watch: ${heavy[0]} has ${heavy[1]} deadlines.`);
  if (changes[0]) lines.push(`\nRecent change: ${changes[0].task.title} was updated, so DueCue refreshed its timing.`);
  const grade = includeGradeSignal && top.find(({ task }) => task.course.currentGradePercent != null && task.course.targetGradePercent != null && task.course.currentGradePercent < task.course.targetGradePercent);
  if (grade) lines.push(`\nAcademic goal signal: ${grade.task.course.code} is below your target, so comparable work is prioritized.`);
  if (learningLabel) lines.push(`\nLearning signal: ${learningLabel} is shaping future cue timing.`);
  return lines.join("\n");
}

export async function generateNotificationPreviews(userId: string) {
  const [recommendations, user, recipients] = await Promise.all([prisma.recommendation.findMany({ where: { userId }, include: { task: { include: { course: true } } } }), prisma.user.findUnique({ where: { id: userId }, include: { settings: true } }), prisma.reminderRecipient.findMany({ where: { userId, enabled: true } })]);
  let created = 0;
  for (const recommendation of recommendations) {
    const task = recommendation.task;
    if (task.removedAt || task.status === "done") continue;
    const type = task.status === "overdue" ? "overdue" : task.status === "start_now" ? "start_recommendation" : "due_soon";
    const due = task.dueAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    for (const recipient of recipients) {
      const enabledForType = type === "start_recommendation" ? recipient.startWindowEnabled : type === "due_soon" ? recipient.dueSoonEnabled : true;
      if (!enabledForType || (!recipient.verifiedAt && !recipient.demoVerified)) continue;
      const existing = await prisma.notification.findFirst({ where: { userId, recipientId: recipient.id, taskId: task.id, type, recommendationId: recommendation.id, status: { in: ["preview", "scheduled", "sent"] } } });
      if (existing) continue;
      const canEmail = env.EMAIL_MODE === "resend" && Boolean(user?.settings?.emailEnabled) && Boolean(recipient.verifiedAt);
      const explanation = privateExplanationFor(recommendation.explanation, recipient.relationship);
      const base = emailTemplate({ type: type === "start_recommendation" ? "start_recommendation" : "due_soon", course: task.course.code, title: task.title, due, explanation, startWindow: formatStartWindow(recommendation.recommendedStartAt), score: Math.round(recommendation.priorityScore), effort: task.estimatedMinutes });
      const notification = await prisma.notification.create({ data: { userId, recipientId: recipient.id, taskId: task.id, recommendationId: recommendation.id, type, channel: canEmail ? "email" : "in_app", status: canEmail ? "scheduled" : "preview", scheduledFor: recommendation.recommendedStartAt, subject: base.subject, body: base.body } });
      const feedbackLinks = Object.fromEntries(await Promise.all((["too_early", "about_right", "too_late"] as const).map(async (rating) => { const token = await createEmailFeedbackToken({ userId, taskId: task.id, recommendationId: recommendation.id, notificationId: notification.id, recipientId: recipient.id, feedbackType: rating }); return [rating, `${env.PUBLIC_API_URL}/api/feedback/email?token=${encodeURIComponent(token)}&rating=${rating}`]; }))) as Record<"too_early" | "about_right" | "too_late", string>;
      const template = emailTemplate({ type: type === "start_recommendation" ? "start_recommendation" : "due_soon", course: task.course.code, title: task.title, due, explanation, startWindow: formatStartWindow(recommendation.recommendedStartAt), score: Math.round(recommendation.priorityScore), effort: task.estimatedMinutes, feedbackLinks });
      await prisma.notification.update({ where: { id: notification.id }, data: { subject: template.subject, body: template.body } });
      if (canEmail) {
        try { const sent = await sendResendEmail({ to: recipient.email, subject: template.subject, body: template.body }); await prisma.notification.update({ where: { id: notification.id }, data: { status: "sent", sentAt: new Date(), providerMessageId: sent.id } }); }
        catch (error) { await prisma.notification.update({ where: { id: notification.id }, data: { status: "failed", failureReason: error instanceof Error ? error.message : "Unknown delivery error" } }); }
      }
      created++;
    }
  }
  return created + await generateWeeklyDigestPreviews(userId);
}

export async function generateWeeklyDigestPreviews(userId: string) {
  const [recommendations, events, preferences, recipients, user] = await Promise.all([
    prisma.recommendation.findMany({ where: { userId }, include: { task: { include: { course: true } }, }, orderBy: { priorityScore: "desc" } }),
    prisma.taskEvent.findMany({ where: { userId, eventType: { in: ["created", "due_date_changed", "points_changed"] } }, include: { task: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.learningPreference.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 1 }),
    prisma.reminderRecipient.findMany({ where: { userId, enabled: true, weeklyDigestEnabled: true } }),
    prisma.user.findUnique({ where: { id: userId }, include: { settings: true } }),
  ]);
  let created = 0; const since = new Date(Date.now() - 6 * 86_400_000);
  for (const recipient of recipients) {
    if (!recipient.verifiedAt && !recipient.demoVerified) continue;
    const existing = await prisma.notification.findFirst({ where: { userId, recipientId: recipient.id, type: "digest", createdAt: { gte: since } } });
    if (existing) continue;
    const body = buildWeeklyDigestText(recommendations, events, preferences[0] ? `${preferences[0].taskType ?? "coursework"} feedback` : undefined, recipient.relationship !== "parent_guardian");
    const canEmail = env.EMAIL_MODE === "resend" && Boolean(user?.settings?.emailEnabled) && Boolean(recipient.verifiedAt);
    const notification = await prisma.notification.create({ data: { userId, recipientId: recipient.id, type: "digest", channel: canEmail ? "email" : "in_app", status: canEmail ? "scheduled" : "preview", subject: "DueCue: Your week ahead", body } });
    if (canEmail) { try { const sent = await sendResendEmail({ to: recipient.email, subject: notification.subject, body }); await prisma.notification.update({ where: { id: notification.id }, data: { status: "sent", sentAt: new Date(), providerMessageId: sent.id } }); } catch (error) { await prisma.notification.update({ where: { id: notification.id }, data: { status: "failed", failureReason: error instanceof Error ? error.message : "Unknown delivery error" } }); } }
    created++;
  }
  return created;
}

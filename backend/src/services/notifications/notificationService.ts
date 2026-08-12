import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { createEmailFeedbackToken } from "../feedback/emailFeedbackService.js";
import { emailTemplate } from "./emailTemplates.js";

async function sendResendEmail(message: { to: string; subject: string; body: string }) {
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.body }) });
  if (!response.ok) throw new Error(`Resend delivery failed: ${await response.text()}`);
  return (await response.json()) as { id: string };
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
      const base = emailTemplate({ type: type === "start_recommendation" ? "start_recommendation" : "due_soon", course: task.course.code, title: task.title, due, explanation: recommendation.explanation, startWindow: recommendation.recommendedStartAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), score: Math.round(recommendation.priorityScore), effort: task.estimatedMinutes });
      const notification = await prisma.notification.create({ data: { userId, recipientId: recipient.id, taskId: task.id, recommendationId: recommendation.id, type, channel: canEmail ? "email" : "in_app", status: canEmail ? "scheduled" : "preview", scheduledFor: recommendation.recommendedStartAt, subject: base.subject, body: base.body } });
      const feedbackLinks = Object.fromEntries(await Promise.all((["too_early", "about_right", "too_late"] as const).map(async (rating) => { const token = await createEmailFeedbackToken({ userId, taskId: task.id, recommendationId: recommendation.id, notificationId: notification.id, recipientId: recipient.id, feedbackType: rating }); return [rating, `${env.PUBLIC_API_URL}/api/feedback/email?token=${encodeURIComponent(token)}&rating=${rating}`]; }))) as Record<"too_early" | "about_right" | "too_late", string>;
      const template = emailTemplate({ type: type === "start_recommendation" ? "start_recommendation" : "due_soon", course: task.course.code, title: task.title, due, explanation: recommendation.explanation, startWindow: recommendation.recommendedStartAt.toLocaleString("en-US", { month: "short", day: "numeric", minute: "2-digit" }), score: Math.round(recommendation.priorityScore), effort: task.estimatedMinutes, feedbackLinks });
      await prisma.notification.update({ where: { id: notification.id }, data: { subject: template.subject, body: template.body } });
      if (canEmail) {
        try { const sent = await sendResendEmail({ to: recipient.email, subject: template.subject, body: template.body }); await prisma.notification.update({ where: { id: notification.id }, data: { status: "sent", sentAt: new Date(), providerMessageId: sent.id } }); }
        catch (error) { await prisma.notification.update({ where: { id: notification.id }, data: { status: "failed", failureReason: error instanceof Error ? error.message : "Unknown delivery error" } }); }
      }
      created++;
    }
  }
  return created;
}

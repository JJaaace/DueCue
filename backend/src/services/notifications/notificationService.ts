import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";

async function sendResendEmail(message: { to: string; subject: string; body: string }) {
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.body }) });
  if (!response.ok) throw new Error(`Resend delivery failed: ${await response.text()}`);
  return (await response.json()) as { id: string };
}

export async function generateNotificationPreviews(userId: string) {
  const [recommendations, user] = await Promise.all([prisma.recommendation.findMany({ where: { userId }, include: { task: { include: { course: true } } } }), prisma.user.findUnique({ where: { id: userId }, include: { settings: true } })]);
  let created = 0;
  for (const recommendation of recommendations) {
    const task = recommendation.task;
    if (task.removedAt || task.status === "done") continue;
    const type = task.status === "overdue" ? "overdue" : task.status === "start_now" ? "start_recommendation" : "due_soon";
    const existing = await prisma.notification.findFirst({ where: { userId, taskId: task.id, type, recommendationId: recommendation.id, status: { in: ["preview", "scheduled", "sent"] } } });
    if (existing) continue;
    const due = task.dueAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const subject = `DueCue: ${task.status === "start_now" ? "Start" : "Plan for"} ${task.course.code} ${task.title}`;
    const body = `${task.title} is due ${due}. ${recommendation.explanation} Estimated effort: ${task.estimatedMinutes ? `${Math.ceil(task.estimatedMinutes / 60)} hours` : "not yet estimated"}.`;
    const canEmail = env.EMAIL_MODE === "resend" && Boolean(user?.settings?.emailEnabled);
    const notification = await prisma.notification.create({ data: { userId, taskId: task.id, recommendationId: recommendation.id, type, channel: canEmail ? "email" : "in_app", status: canEmail ? "scheduled" : "preview", scheduledFor: recommendation.recommendedStartAt, subject, body } });
    if (canEmail && user) {
      try { const sent = await sendResendEmail({ to: user.email, subject, body }); await prisma.notification.update({ where: { id: notification.id }, data: { status: "sent", sentAt: new Date(), providerMessageId: sent.id } }); }
      catch (error) { await prisma.notification.update({ where: { id: notification.id }, data: { status: "failed", failureReason: error instanceof Error ? error.message : "Unknown delivery error" } }); }
    }
    created++;
  }
  return created;
}

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../middleware/auth.js";
import { runSync, setMockStage } from "../services/sync/syncEngine.js";

export const demoRouter = Router();
demoRouter.use(requireUser);
demoRouter.get("/demo/state", async (req, res, next) => {
  try {
    const [connection, tasks, events] = await Promise.all([
      prisma.providerConnection.findFirst({ where: { userId: req.userId, provider: "mock_canvas" } }),
      prisma.academicTask.count({ where: { userId: req.userId, removedAt: null } }),
      prisma.taskEvent.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, take: 10, include: { task: { select: { title: true } } } }),
    ]);
    res.json({ mode: "demo", mockStage: (connection?.config as { mockStage?: number } | null)?.mockStage ?? 1, tasks, recentEvents: events });
  } catch (error) { next(error); }
});
demoRouter.post("/demo/reset", async (req, res, next) => {
  try {
    const [connection, user] = await Promise.all([prisma.providerConnection.findFirst({ where: { userId: req.userId, provider: "mock_canvas" } }), prisma.user.findUnique({ where: { id: req.userId }, select: { email: true, name: true } })]);
    if (!connection || !user) return res.status(404).json({ error: "Demo workspace connection was not found." });
    await prisma.$transaction([
      prisma.feedback.deleteMany({ where: { userId: req.userId } }),
      prisma.learningPreference.deleteMany({ where: { userId: req.userId } }),
      prisma.notification.deleteMany({ where: { userId: req.userId } }),
      prisma.taskEvent.deleteMany({ where: { userId: req.userId } }),
      prisma.recommendation.deleteMany({ where: { userId: req.userId } }),
      prisma.academicTask.deleteMany({ where: { userId: req.userId, providerId: "mock_canvas" } }),
      prisma.syncRun.deleteMany({ where: { userId: req.userId, providerConnectionId: connection.id } }),
      prisma.reminderRecipient.deleteMany({ where: { userId: req.userId } }),
      prisma.calendarToken.updateMany({ where: { userId: req.userId, active: true }, data: { active: false, revokedAt: new Date() } }),
      prisma.userSettings.update({ where: { userId: req.userId }, data: { defaultReminderHour: 9, defaultReminderMinute: 0, reminderStyle: "balanced", defaultChannel: "in_app", weekendRemindersEnabled: true, digestEnabled: true, emailEnabled: false } }),
    ]);
    await prisma.reminderRecipient.create({ data: { userId: req.userId!, email: user.email, label: user.name ?? "My primary email", relationship: "self", demoVerified: true, enabled: true, startWindowEnabled: true, dueSoonEnabled: true, deadlineChangedEnabled: true, weeklyDigestEnabled: true } });
    await setMockStage(req.userId!, connection.id, 1);
    const run = await runSync(req.userId!, connection.id);
    await prisma.taskEvent.deleteMany({ where: { userId: req.userId } });
    res.json({ message: "Demo workspace reset to stage 1.", run });
  } catch (error) { next(error); }
});

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
    const connection = await prisma.providerConnection.findFirst({ where: { userId: req.userId, provider: "mock_canvas" } });
    if (!connection) return res.status(404).json({ error: "Demo workspace connection was not found." });
    await prisma.$transaction([
      prisma.feedback.deleteMany({ where: { userId: req.userId } }),
      prisma.learningPreference.deleteMany({ where: { userId: req.userId } }),
      prisma.notification.deleteMany({ where: { userId: req.userId } }),
      prisma.taskEvent.deleteMany({ where: { userId: req.userId } }),
      prisma.recommendation.deleteMany({ where: { userId: req.userId } }),
    ]);
    await setMockStage(req.userId!, connection.id, 1);
    const run = await runSync(req.userId!, connection.id);
    res.json({ message: "Demo workspace reset to stage 1.", run });
  } catch (error) { next(error); }
});

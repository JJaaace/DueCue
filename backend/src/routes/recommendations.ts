import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../middleware/auth.js";
import { recalculateTaskRecommendation, recalculateUserRecommendations } from "../services/recommendations/recommendationService.js";

export const recommendationRouter = Router();
recommendationRouter.use(requireUser);
recommendationRouter.get("/recommendations", async (req, res, next) => {
  try { res.json({ recommendations: await prisma.recommendation.findMany({ where: { userId: req.userId, task: { providerId: { not: "mock_canvas" } } }, include: { task: { include: { course: true } } }, orderBy: { priorityScore: "desc" } }) }); } catch (error) { next(error); }
});
recommendationRouter.get("/recommendations/:taskId", async (req, res, next) => {
  try {
    const recommendation = await prisma.recommendation.findFirst({ where: { userId: req.userId, taskId: req.params.taskId }, include: { task: { include: { course: true } } }, orderBy: { version: "desc" } });
    if (!recommendation) return res.status(404).json({ error: "Recommendation not found." });
    res.json({ recommendation });
  } catch (error) { next(error); }
});
recommendationRouter.post("/recommendations/recalculate", async (req, res, next) => {
  try { const recommendations = await recalculateUserRecommendations(req.userId!); res.json({ recalculated: recommendations.filter(Boolean).length }); } catch (error) { next(error); }
});
recommendationRouter.post("/recommendations/:taskId/recalculate", async (req, res, next) => {
  try { const recommendation = await recalculateTaskRecommendation(req.userId!, req.params.taskId); if (!recommendation) return res.status(404).json({ error: "Task not found." }); res.json({ recommendation }); } catch (error) { next(error); }
});

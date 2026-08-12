import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { learningInsights, recordFeedback } from "../services/feedback/feedbackService.js";

export const feedbackRouter = Router(); feedbackRouter.use(requireUser);
feedbackRouter.post("/feedback", async (req, res, next) => {
  try { const input = z.object({ taskId: z.string().optional(), recommendationId: z.string().optional(), notificationId: z.string().optional(), feedbackType: z.enum(["too_early", "about_right", "too_late", "need_more_time", "need_less_time", "not_relevant"]), comment: z.string().max(1000).optional() }).parse(req.body); res.status(201).json({ feedback: await recordFeedback(req.userId!, input) }); } catch (error) { next(error); }
});
feedbackRouter.get("/feedback/insights", async (req, res, next) => { try { res.json({ insights: await learningInsights(req.userId!) }); } catch (error) { next(error); } });


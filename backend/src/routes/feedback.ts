import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../middleware/auth.js";
import { learningInsights, recordFeedback } from "../services/feedback/feedbackService.js";
import { consumeEmailFeedbackToken } from "../services/feedback/emailFeedbackService.js";
import { generateNotificationPreviews } from "../services/notifications/notificationService.js";
import { env } from "../config/env.js";

export const feedbackRouter = Router();
feedbackRouter.get("/feedback/email", async (req, res, next) => { try { const token = typeof req.query.token === "string" ? req.query.token : ""; const rating = z.enum(["too_early", "about_right", "too_late"]).safeParse(req.query.rating); if (!token || !rating.success) return res.redirect(`${env.FRONTEND_URL}/?emailFeedback=invalid`); const feedback = await consumeEmailFeedbackToken(token, rating.data); if (!feedback) return res.redirect(`${env.FRONTEND_URL}/?emailFeedback=expired`); await prisma.notification.deleteMany({ where: { userId: feedback.userId, taskId: feedback.taskId, status: "preview" } }); await generateNotificationPreviews(feedback.userId); res.redirect(`${env.FRONTEND_URL}/?emailFeedback=recorded&task=${encodeURIComponent(feedback.taskTitle)}`); } catch (error) { next(error); } });
feedbackRouter.use(requireUser);
feedbackRouter.post("/feedback", async (req, res, next) => {
  try { const input = z.object({ taskId: z.string().optional(), recommendationId: z.string().optional(), notificationId: z.string().optional(), feedbackType: z.enum(["too_early", "about_right", "too_late", "need_more_time", "need_less_time", "not_relevant"]), comment: z.string().max(1000).optional() }).parse(req.body); const feedback = await recordFeedback(req.userId!, input); if (input.taskId) await prisma.notification.deleteMany({ where: { userId: req.userId, taskId: input.taskId, status: "preview" } }); await generateNotificationPreviews(req.userId!); res.status(201).json({ feedback }); } catch (error) { next(error); }
});
feedbackRouter.get("/feedback/insights", async (req, res, next) => { try { res.json({ insights: await learningInsights(req.userId!) }); } catch (error) { next(error); } });

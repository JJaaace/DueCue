import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { learningInsights, recordFeedback } from "../services/feedback/feedbackService.js";
import { consumeEmailFeedbackToken } from "../services/feedback/emailFeedbackService.js";
import { env } from "../config/env.js";

export const feedbackRouter = Router();
feedbackRouter.get("/feedback/email", async (req, res, next) => { try { const token = typeof req.query.token === "string" ? req.query.token : ""; const rating = z.enum(["too_early", "about_right", "too_late"]).safeParse(req.query.rating); if (!token || !rating.success) return res.redirect(`${env.FRONTEND_URL}/?emailFeedback=invalid`); const feedback = await consumeEmailFeedbackToken(token, rating.data); if (!feedback) return res.redirect(`${env.FRONTEND_URL}/?emailFeedback=expired`); res.redirect(`${env.FRONTEND_URL}/?emailFeedback=recorded&task=${encodeURIComponent(feedback.taskTitle)}`); } catch (error) { next(error); } });
feedbackRouter.use(requireUser);
feedbackRouter.post("/feedback", async (req, res, next) => {
  try { const input = z.object({ taskId: z.string().optional(), recommendationId: z.string().optional(), notificationId: z.string().optional(), feedbackType: z.enum(["too_early", "about_right", "too_late", "need_more_time", "need_less_time", "not_relevant"]), comment: z.string().max(1000).optional() }).parse(req.body); res.status(201).json({ feedback: await recordFeedback(req.userId!, input) }); } catch (error) { next(error); }
});
feedbackRouter.get("/feedback/insights", async (req, res, next) => { try { res.json({ insights: await learningInsights(req.userId!) }); } catch (error) { next(error); } });

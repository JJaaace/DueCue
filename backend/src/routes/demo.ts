import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import {
  demoTaskDetail,
  endDemoSession,
  getDemoSession,
  recordDemoFeedback,
  startDemoSession,
  syncDemoSession,
  updateDemoStep,
} from "../services/demo/demoSessionService.js";

export const demoRouter = Router();
demoRouter.use(requireUser);

demoRouter.get("/demo/state", async (req, res) => {
  const session = getDemoSession(req.userId!);
  res.json({ active: Boolean(session), session });
});

demoRouter.post("/demo/session", async (req, res, next) => {
  try { res.status(201).json({ session: await startDemoSession(req.userId!) }); }
  catch (error) { next(error); }
});

demoRouter.patch("/demo/session", async (req, res, next) => {
  try {
    const { step } = z.object({ step: z.number().int().min(0).max(6) }).parse(req.body);
    const session = updateDemoStep(req.userId!, step);
    if (!session) return res.status(404).json({ error: "No active demo session." });
    res.json({ session });
  } catch (error) { next(error); }
});

demoRouter.post("/demo/session/sync", async (req, res, next) => {
  try {
    const session = await syncDemoSession(req.userId!);
    if (!session) return res.status(404).json({ error: "No active demo session." });
    res.json({ session });
  } catch (error) { next(error); }
});

demoRouter.post("/demo/session/feedback", async (req, res, next) => {
  try {
    const body = z.object({ taskId: z.string().min(1), feedbackType: z.enum(["too_early", "about_right", "too_late"]) }).parse(req.body);
    const feedback = await recordDemoFeedback(req.userId!, body.taskId, body.feedbackType);
    if (!feedback) return res.status(404).json({ error: "Demo task was not found." });
    res.status(201).json({ feedback, session: getDemoSession(req.userId!) });
  } catch (error) { next(error); }
});

demoRouter.get("/demo/session/tasks/:id", (req, res) => {
  const task = demoTaskDetail(req.userId!, req.params.id);
  if (!task) return res.status(404).json({ error: "Demo task was not found." });
  res.json({ task });
});

demoRouter.delete("/demo/session", (req, res) => {
  res.json(endDemoSession(req.userId!));
});

// Kept as a safe compatibility alias for the recruiter button. It only replaces
// the in-memory demo session and never deletes persisted coursework or settings.
demoRouter.post("/demo/reset", async (req, res, next) => {
  try {
    endDemoSession(req.userId!);
    res.json({ message: "Temporary demo reset to its baseline.", session: await startDemoSession(req.userId!) });
  } catch (error) { next(error); }
});

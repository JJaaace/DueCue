import { Router, type Request } from "express";
import { z } from "zod";
import {
  anonymousDemoTaskDetail,
  endAnonymousDemoSession,
  getAnonymousDemoSession,
  recordAnonymousDemoFeedback,
  startAnonymousDemoSession,
  syncAnonymousDemoSession,
  updateAnonymousDemoStep,
} from "../services/demo/demoSessionService.js";

export const publicDemoRouter = Router();
const sessionIdSchema = z.string().uuid();

function sessionId(req: Request, optional = false) {
  const value = req.header("x-duecue-demo-session");
  if (!value && optional) return undefined;
  const parsed = sessionIdSchema.safeParse(value);
  if (optional && !parsed.success) return undefined;
  return sessionIdSchema.parse(value);
}

publicDemoRouter.get("/public/demo/state", (req, res, next) => {
  try {
    const id = sessionId(req, true);
    const session = id ? getAnonymousDemoSession(id) : null;
    res.json({ active: Boolean(session), session });
  } catch (error) { next(error); }
});

publicDemoRouter.post("/public/demo/session", async (req, res, next) => {
  try { res.status(201).json(await startAnonymousDemoSession(sessionId(req, true))); }
  catch (error) { next(error); }
});

publicDemoRouter.patch("/public/demo/session", (req, res, next) => {
  try {
    const { step } = z.object({ step: z.number().int().min(0).max(6) }).parse(req.body);
    const session = updateAnonymousDemoStep(sessionId(req)!, step);
    if (!session) return res.status(404).json({ error: "The temporary demo session expired." });
    res.json({ session });
  } catch (error) { next(error); }
});

publicDemoRouter.post("/public/demo/session/sync", async (req, res, next) => {
  try {
    const session = await syncAnonymousDemoSession(sessionId(req)!);
    if (!session) return res.status(404).json({ error: "The temporary demo session expired." });
    res.json({ session });
  } catch (error) { next(error); }
});

publicDemoRouter.post("/public/demo/session/feedback", async (req, res, next) => {
  try {
    const body = z.object({ taskId: z.string().min(1), feedbackType: z.enum(["too_early", "about_right", "too_late"]) }).parse(req.body);
    const result = await recordAnonymousDemoFeedback(sessionId(req)!, body.taskId, body.feedbackType);
    if (!result) return res.status(404).json({ error: "The temporary demo task was not found." });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

publicDemoRouter.get("/public/demo/session/tasks/:id", (req, res, next) => {
  try {
    const task = anonymousDemoTaskDetail(sessionId(req)!, req.params.id);
    if (!task) return res.status(404).json({ error: "The temporary demo task was not found." });
    res.json({ task });
  } catch (error) { next(error); }
});

publicDemoRouter.delete("/public/demo/session", (req, res, next) => {
  try {
    const id = sessionId(req, true);
    res.json(id ? endAnonymousDemoSession(id) : { removed: false, demoOnly: true });
  } catch (error) { next(error); }
});

publicDemoRouter.post("/public/demo/reset", async (req, res, next) => {
  try {
    const oldId = sessionId(req, true);
    if (oldId) endAnonymousDemoSession(oldId);
    res.json(await startAnonymousDemoSession());
  } catch (error) { next(error); }
});

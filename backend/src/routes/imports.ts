import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../middleware/auth.js";
import {
  connectCalendarFeed,
  disconnectCalendarFeed,
  getCalendarFeedState,
  importTasks,
  parseIcal,
  syncConnectedCalendarFeed,
} from "../services/imports/importService.js";

const taskSchema = z.object({
  id: z.string().optional(),
  courseCode: z.string().min(1).max(40),
  courseName: z.string().max(120).optional(),
  title: z.string().min(1).max(240),
  dueAt: z.string().datetime(),
  type: z.enum(["assignment", "quiz", "exam", "project", "reading", "discussion", "lab", "other"]).optional(),
  pointsPossible: z.number().nonnegative().optional(),
  estimatedMinutes: z.number().int().positive().max(10080).optional(),
  difficulty: z.enum(["low", "medium", "high"]).optional(),
  description: z.string().max(5_000).optional(),
  sourceUrl: z.string().url().optional(),
});

const calendarFeedSchema = z.object({
  url: z.string().optional(),
  feedUrl: z.string().optional(),
}).refine((value) => Boolean(value.url || value.feedUrl), { message: "A calendar feed URL is required." });

export const importRouter = Router();
importRouter.use(requireUser);

importRouter.get("/imports/history", async (req, res, next) => {
  try {
    const connections = await prisma.providerConnection.findMany({
      where: { userId: req.userId, provider: { in: ["manual_import", "ical_feed"] } },
      select: { id: true, provider: true, displayName: true, status: true, lastSyncAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
    res.json({ imports: connections });
  } catch (error) { next(error); }
});

importRouter.post("/imports/json", async (req, res, next) => {
  try {
    const body = z.object({ tasks: z.array(taskSchema).min(1).max(500) }).parse(req.body);
    res.status(201).json(await importTasks(req.userId!, body.tasks, "manual_import", "Manual academic import"));
  } catch (error) { next(error); }
});

importRouter.post("/imports/ical", async (req, res, next) => {
  try {
    const body = z.object({ ical: z.string().min(20).max(2_000_000) }).parse(req.body);
    const tasks = parseIcal(body.ical);
    if (!tasks.length) return res.status(400).json({ code: "no_calendar_tasks", error: "No events with a title and date were found in this iCal data." });
    res.status(201).json(await importTasks(req.userId!, tasks, "manual_import", "Manual iCal import"));
  } catch (error) { next(error); }
});

importRouter.get("/imports/ical-feed", async (req, res, next) => {
  try { res.json(await getCalendarFeedState(req.userId!)); }
  catch (error) { next(error); }
});

importRouter.post("/imports/ical-feed", async (req, res, next) => {
  try {
    const body = calendarFeedSchema.parse(req.body);
    res.status(201).json(await connectCalendarFeed(req.userId!, body.url ?? body.feedUrl!));
  } catch (error) { next(error); }
});

importRouter.post("/imports/ical-feed/sync", async (req, res, next) => {
  try { res.json(await syncConnectedCalendarFeed(req.userId!)); }
  catch (error) { next(error); }
});

importRouter.delete("/imports/ical-feed", async (req, res, next) => {
  try { res.json(await disconnectCalendarFeed(req.userId!)); }
  catch (error) { next(error); }
});

import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { importTasks, parseIcal } from "../services/imports/importService.js";
import { prisma } from "../lib/prisma.js";

const taskSchema = z.object({ id: z.string().optional(), courseCode: z.string().min(1).max(40), courseName: z.string().max(120).optional(), title: z.string().min(1).max(240), dueAt: z.string().datetime(), type: z.enum(["assignment", "quiz", "exam", "project", "reading", "discussion", "lab", "other"]).optional(), pointsPossible: z.number().nonnegative().optional(), estimatedMinutes: z.number().int().positive().max(10080).optional(), difficulty: z.enum(["low", "medium", "high"]).optional(), description: z.string().max(5000).optional(), sourceUrl: z.string().url().optional() });
export const importRouter = Router(); importRouter.use(requireUser);
importRouter.get("/imports/history", async (req, res, next) => { try { const connections = await prisma.providerConnection.findMany({ where: { userId: req.userId, provider: { in: ["manual_import", "ical_feed"] } }, select: { id: true, provider: true, displayName: true, lastSyncAt: true, updatedAt: true }, orderBy: { updatedAt: "desc" } }); res.json({ imports: connections }); } catch (error) { next(error); } });
importRouter.post("/imports/json", async (req, res, next) => { try { const body = z.object({ tasks: z.array(taskSchema).min(1).max(500) }).parse(req.body); res.status(201).json(await importTasks(req.userId!, body.tasks, "manual_import", "Manual academic import")); } catch (error) { next(error); } });
importRouter.post("/imports/ical", async (req, res, next) => { try { const body = z.object({ ical: z.string().min(20).max(2_000_000) }).parse(req.body); const tasks = parseIcal(body.ical); if (!tasks.length) return res.status(400).json({ error: "No events with SUMMARY and DTSTART were found in this iCal data." }); res.status(201).json(await importTasks(req.userId!, tasks, "ical_feed", "User-authorized iCal import")); } catch (error) { next(error); } });

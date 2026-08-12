import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../middleware/auth.js";
import { runSync, setMockStage } from "../services/sync/syncEngine.js";

export const syncRouter = Router();
syncRouter.use(requireUser);

syncRouter.post("/sync/run", async (req, res, next) => {
  try {
    const body = z.object({ connectionId: z.string().optional(), stage: z.number().int().min(1).max(4).optional() }).parse(req.body ?? {});
    const connection = body.connectionId
      ? await prisma.providerConnection.findFirst({ where: { id: body.connectionId, userId: req.userId } })
      : await prisma.providerConnection.findFirst({ where: { userId: req.userId, provider: "mock_canvas" } });
    if (!connection) return res.status(404).json({ error: "No provider connection found." });
    if (body.stage) await setMockStage(req.userId!, connection.id, body.stage);
    const run = await runSync(req.userId!, connection.id);
    res.status(201).json({ run });
  } catch (error) { next(error); }
});

syncRouter.get("/sync/runs", async (req, res, next) => {
  try { res.json({ runs: await prisma.syncRun.findMany({ where: { userId: req.userId }, include: { providerConnection: { select: { displayName: true, provider: true } } }, orderBy: { startedAt: "desc" } }) }); }
  catch (error) { next(error); }
});

syncRouter.get("/sync/runs/:id", async (req, res, next) => {
  try {
    const run = await prisma.syncRun.findFirst({ where: { id: req.params.id, userId: req.userId }, include: { providerConnection: true } });
    if (!run) return res.status(404).json({ error: "Sync run not found." });
    res.json({ run });
  } catch (error) { next(error); }
});


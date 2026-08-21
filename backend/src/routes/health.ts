import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const healthRouter = Router();
healthRouter.get("/health", (_req, res) => res.json({ status: "ok", version: "0.1.0", time: new Date().toISOString() }));
healthRouter.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
    res.json({ status: "ready", database: "available", time: new Date().toISOString() });
  } catch {
    res.status(503).json({ error: "The DueCue database is not ready." });
  }
});

import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

declare global {
  namespace Express { interface Request { userId?: string; } }
}

/** Dev auth keeps the demo usable locally; replace with Clerk verification when AUTH_MODE=clerk. */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const requestedId = req.header("x-duecue-user-id");
  const demoUser = await prisma.user.findUnique({ where: { email: "demo@duecue.local" } });
  const user = requestedId
    ? await prisma.user.findUnique({ where: { id: requestedId } })
    : demoUser;

  if (!user) return res.status(401).json({ error: "No authenticated user. Run the demo seed first." });
  req.userId = user.id;
  next();
}


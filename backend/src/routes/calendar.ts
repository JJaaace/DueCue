import { randomBytes } from "node:crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../middleware/auth.js";
import { calendarIcs } from "../services/calendar/icsService.js";

export const calendarRouter = Router();
calendarRouter.get("/calendar/feed.ics", async (req, res, next) => { try { const token = typeof req.query.token === "string" ? req.query.token : ""; const record = await prisma.calendarToken.findFirst({ where: { token, active: true } }); if (!record) return res.status(401).send("Invalid calendar token"); res.type("text/calendar").send(await calendarIcs(record.userId)); } catch (error) { next(error); } });
calendarRouter.use(requireUser);
calendarRouter.get("/calendar/download", async (req, res, next) => { try { res.attachment("duecue.ics").type("text/calendar").send(await calendarIcs(req.userId!)); } catch (error) { next(error); } });
calendarRouter.post("/calendar/token", async (req, res, next) => { try { await prisma.calendarToken.updateMany({ where: { userId: req.userId!, active: true }, data: { active: false, revokedAt: new Date() } }); const token = await prisma.calendarToken.create({ data: { userId: req.userId!, token: randomBytes(32).toString("base64url") } }); res.status(201).json({ token: token.token, feedPath: `/api/calendar/feed.ics?token=${token.token}` }); } catch (error) { next(error); } });
calendarRouter.delete("/calendar/token", async (req, res, next) => { try { await prisma.calendarToken.updateMany({ where: { userId: req.userId!, active: true }, data: { active: false, revokedAt: new Date() } }); res.status(204).end(); } catch (error) { next(error); } });

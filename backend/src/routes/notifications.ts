import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../middleware/auth.js";
import { generateNotificationPreviews } from "../services/notifications/notificationService.js";

export const notificationRouter = Router(); notificationRouter.use(requireUser);
notificationRouter.get("/notifications", async (req, res, next) => { try { res.json({ notifications: await prisma.notification.findMany({ where: { userId: req.userId }, include: { task: { include: { course: true } } }, orderBy: { createdAt: "desc" } }) }); } catch (error) { next(error); } });
notificationRouter.post("/notifications/generate", async (req, res, next) => { try { res.json({ created: await generateNotificationPreviews(req.userId!) }); } catch (error) { next(error); } });
notificationRouter.patch("/notifications/:id/read", async (req, res, next) => { try { const notification = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.userId }, data: { status: "sent", sentAt: new Date() } }); res.json(notification); } catch (error) { next(error); } });


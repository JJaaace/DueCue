import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { generateNotificationPreviews } from "../services/notifications/notificationService.js";
import { recalculateUserRecommendations } from "../services/recommendations/recommendationService.js";
import { runSync } from "../services/sync/syncEngine.js";

/** Backend-owned job entry point. Disabled by default to keep demo development deterministic. */
export function startLocalJobs() {
  if (process.env.ENABLE_JOBS !== "true") return;
  cron.schedule("*/30 * * * *", async () => {
    const connections = await prisma.providerConnection.findMany({ where: { status: { in: ["connected", "demo"] } } });
    for (const connection of connections) {
      try { await runSync(connection.userId, connection.id); } catch (error) { console.error("DueCue scheduled sync failed", error); }
    }
  });
  cron.schedule("0 * * * *", async () => {
    const users = await prisma.user.findMany({ select: { id: true } });
    for (const user of users) { await recalculateUserRecommendations(user.id); await generateNotificationPreviews(user.id); }
  });
}

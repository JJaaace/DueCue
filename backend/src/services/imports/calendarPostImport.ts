import { generateNotificationPreviews } from "../notifications/notificationService.js";
import { recalculateUserRecommendations } from "../recommendations/recommendationService.js";

const pendingByUser = new Map<string, Promise<void>>();

const afterResponseTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

async function runCalendarPostImport(userId: string, syncRunId: string) {
  const startedAt = Date.now();
  try {
    await recalculateUserRecommendations(userId);
    await generateNotificationPreviews(userId);
    console.info("calendar_post_import_completed", { userId, syncRunId, durationMs: Date.now() - startedAt });
  } catch (error) {
    // Imported tasks and the successful sync stay committed. These operations are
    // idempotent and will be retried by the next sync without exposing feed data.
    console.warn("calendar_post_import_failed", {
      userId,
      syncRunId,
      code: error instanceof Error ? error.name : "unknown_error",
      durationMs: Date.now() - startedAt,
    });
  }
}

export function enqueueCalendarPostImport(userId: string, syncRunId: string) {
  const previous = pendingByUser.get(userId) ?? Promise.resolve();
  const pending = previous
    .catch(() => undefined)
    .then(afterResponseTurn)
    .then(() => runCalendarPostImport(userId, syncRunId));
  pendingByUser.set(userId, pending);
  void pending.finally(() => {
    if (pendingByUser.get(userId) === pending) pendingByUser.delete(userId);
  });
}

/** Wait for a user's queued enrichment work without exposing it to request latency. */
export async function waitForCalendarPostImport(userId: string) {
  await pendingByUser.get(userId);
}

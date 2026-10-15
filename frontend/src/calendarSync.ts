export const CALENDAR_SYNC_STALE_MS = 15 * 60_000;

export function shouldAutomaticallySync(lastSyncAt: string | null | undefined, now = Date.now()) {
  if (!lastSyncAt) return true;
  const lastSync = Date.parse(lastSyncAt);
  return !Number.isFinite(lastSync) || now - lastSync >= CALENDAR_SYNC_STALE_MS;
}

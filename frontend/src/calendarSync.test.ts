import { describe, expect, it } from "vitest";
import { CALENDAR_SYNC_STALE_MS, shouldAutomaticallySync } from "./calendarSync";

describe("automatic calendar sync timing", () => {
  const now = Date.parse("2026-10-14T16:00:00.000Z");
  it("syncs missing or stale connections and leaves fresh ones alone", () => {
    expect(shouldAutomaticallySync(null, now)).toBe(true);
    expect(shouldAutomaticallySync(new Date(now - CALENDAR_SYNC_STALE_MS - 1).toISOString(), now)).toBe(true);
    expect(shouldAutomaticallySync(new Date(now - 5 * 60_000).toISOString(), now)).toBe(false);
  });
});

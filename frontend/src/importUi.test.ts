import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { calendarImportError, calendarSyncMessage } from "./importUi";

describe("calendar import UI messages", () => {
  it("summarizes successful imports with useful counts", () => {
    expect(calendarSyncMessage({ eventsFound: 18, tasksCreated: 14, tasksUpdated: 0, tasksUnchanged: 4, tasksSkipped: 0 })).toBe("Calendar connected. 18 items found, 14 imported, 0 updated, 4 already up to date.");
  });

  it("treats a valid empty calendar as a successful connection", () => {
    expect(calendarSyncMessage({ eventsFound: 0, tasksCreated: 0, tasksUpdated: 0, tasksUnchanged: 0, tasksSkipped: 0 })).toContain("connected successfully");
  });

  it("distinguishes URL, fetch, parse, session, and network failures", () => {
    expect(calendarImportError(new ApiError("bad URL", "request", 400, false, "invalid_calendar_url"))).toBe("bad URL");
    expect(calendarImportError(new ApiError("hidden", "request", 422, false, "calendar_feed_unreachable"))).toContain("could not access");
    expect(calendarImportError(new ApiError("hidden", "request", 422, false, "invalid_calendar_data"))).toContain("could not be read");
    expect(calendarImportError(new ApiError("hidden", "authentication", 401))).toContain("session expired");
    expect(calendarImportError(new ApiError("Unable to reach DueCue right now. Please try again in a moment.", "network", undefined, true))).toContain("Unable to reach");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const downstream = vi.hoisted(() => ({
  recalculate: vi.fn(),
  notifications: vi.fn(),
}));

vi.mock("../services/recommendations/recommendationService.js", () => ({ recalculateUserRecommendations: downstream.recalculate }));
vi.mock("../services/notifications/notificationService.js", () => ({ generateNotificationPreviews: downstream.notifications }));

import { enqueueCalendarPostImport, waitForCalendarPostImport } from "../services/imports/calendarPostImport.js";

afterEach(() => vi.restoreAllMocks());

describe("calendar post-import processing", () => {
  it("returns control before serialized downstream work and completes it safely", async () => {
    let release!: () => void;
    downstream.recalculate.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    downstream.notifications.mockResolvedValueOnce(1);

    enqueueCalendarPostImport("user-prompt", "sync-1");
    expect(downstream.recalculate).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(downstream.recalculate).toHaveBeenCalledWith("user-prompt"));
    expect(downstream.notifications).not.toHaveBeenCalled();
    release();
    await waitForCalendarPostImport("user-prompt");
    expect(downstream.notifications).toHaveBeenCalledWith("user-prompt");
  });

  it("does not fail a completed import or expose private feed data when enrichment fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    downstream.recalculate.mockRejectedValueOnce(new Error("synthetic downstream failure"));

    enqueueCalendarPostImport("user-failure", "sync-2");
    await expect(waitForCalendarPostImport("user-failure")).resolves.toBeUndefined();
    expect(JSON.stringify(warning.mock.calls)).not.toContain("calendar.example.edu/private-token");
    expect(warning).toHaveBeenCalledWith("calendar_post_import_failed", expect.objectContaining({ userId: "user-failure", syncRunId: "sync-2", code: "Error" }));
  });
});

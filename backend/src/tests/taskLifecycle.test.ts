import { describe, expect, it } from "vitest";
import { importableCalendarTasks, isBeforeLocalToday, localDateKey, nextTaskLifecycleStatus } from "../services/tasks/taskLifecycle.js";

describe("task lifecycle date boundaries", () => {
  it("uses the authenticated user's America/New_York calendar day", () => {
    const now = new Date("2026-10-14T04:30:00.000Z"); // 12:30 AM in New York
    expect(localDateKey(now, "America/New_York")).toBe("2026-10-14");
    expect(isBeforeLocalToday(new Date("2026-10-14T03:59:00.000Z"), "America/New_York", now)).toBe(true);
    expect(isBeforeLocalToday(new Date("2026-10-14T04:00:00.000Z"), "America/New_York", now)).toBe(false);
  });

  it("keeps new historical events out while continuing to update previously imported history", () => {
    const now = new Date("2026-10-14T16:00:00.000Z");
    const tasks = [{ dueAt: "2026-10-13T20:00:00.000Z", externalId: "past" }, { dueAt: "2026-10-14T20:00:00.000Z", externalId: "today" }];
    expect(importableCalendarTasks(tasks, "America/New_York", new Set(), now).map((task) => task.externalId)).toEqual(["today"]);
    expect(importableCalendarTasks(tasks, "America/New_York", new Set(["past"]), now)).toEqual(tasks);
  });

  it("keeps completion, dismissal, undo, and restore as distinct lifecycle transitions", () => {
    const now = new Date("2026-10-14T16:00:00.000Z");
    expect(nextTaskLifecycleStatus("complete", new Date("2026-10-20T16:00:00.000Z"), now)).toBe("done");
    expect(nextTaskLifecycleStatus("dismiss", new Date("2026-10-20T16:00:00.000Z"), now)).toBe("dismissed");
    expect(nextTaskLifecycleStatus("restore", new Date("2026-10-20T16:00:00.000Z"), now)).toBe("upcoming");
    expect(nextTaskLifecycleStatus("restore", new Date("2026-10-12T16:00:00.000Z"), now)).toBe("overdue");
  });
});

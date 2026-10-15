import { describe, expect, it } from "vitest";
import { buildTodayPlan, isTaskActive } from "./intelligence";

const task = (id: string, dueAt: string, status = "overdue") => ({ id, title: id, type: "assignment", dueAt, status, estimatedMinutes: 60, course: { code: "CSE", currentGradePercent: null, targetGradePercent: null, courseImportance: "normal" as const }, recommendations: [{ recommendedStartAt: dueAt, priorityScore: 70 }] });

describe("imported task lifecycle planning", () => {
  const now = new Date("2026-10-14T16:00:00.000Z");

  it("labels overdue work accurately and never as due within a day", () => {
    const plan = buildTodayPlan([task("late", "2026-10-12T16:00:00.000Z")], [], now);
    expect(plan[0]?.reason).toContain("Overdue by 2 days");
    expect(plan[0]?.reason).not.toContain("Due within a day");
  });

  it("excludes completed, dismissed, and stale overdue tasks from Today's Plan", () => {
    expect(isTaskActive(task("done", "2026-10-20T16:00:00.000Z", "done"))).toBe(false);
    expect(isTaskActive(task("dismissed", "2026-10-20T16:00:00.000Z", "dismissed"))).toBe(false);
    expect(buildTodayPlan([task("stale", "2026-09-01T16:00:00.000Z")], [], now)).toHaveLength(0);
  });
});

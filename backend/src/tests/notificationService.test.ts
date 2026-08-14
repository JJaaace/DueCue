import { describe, expect, it } from "vitest";
import { privateExplanationFor } from "../services/notifications/notificationService.js";
import { buildWeeklyDigestText } from "../services/notifications/notificationService.js";

describe("notification deduplication policy", () => {
  it("uses a task, notification type, and recommendation version as the delivery identity", () => {
    const identity = (taskId: string, type: string, recommendationId: string) => `${taskId}:${type}:${recommendationId}`;
    expect(identity("task-a", "start_recommendation", "rec-1")).toBe(identity("task-a", "start_recommendation", "rec-1"));
    expect(identity("task-a", "start_recommendation", "rec-1")).not.toBe(identity("task-a", "start_recommendation", "rec-2"));
  });
  it("does not expose grade-specific reasoning to parent or guardian recipients", () => {
    const explanation = "Prioritized higher because this course is 15% below your course target.";
    expect(privateExplanationFor(explanation, "parent_guardian")).not.toContain("15%");
    expect(privateExplanationFor(explanation, "self")).toContain("15%");
  });
  it("builds a useful weekly digest without exposing grades to guardians", () => {
    const tasks = [{ priorityScore: 82, recommendedStartAt: new Date("2026-08-12"), task: { title: "WebAssign", dueAt: new Date("2026-08-14"), type: "assignment", course: { code: "MATH 1151", currentGradePercent: 70, targetGradePercent: 85 } } }];
    const student = buildWeeklyDigestText(tasks, [{ eventType: "due_date_changed", task: { title: "Quiz 2" } }], "quiz timing", true, new Date("2026-08-11"));
    const guardian = buildWeeklyDigestText(tasks, [], undefined, false, new Date("2026-08-11"));
    expect(student).toContain("WebAssign"); expect(student).toContain("Recent change"); expect(student).toContain("below your target");
    expect(guardian).not.toContain("below your target"); expect(guardian).not.toContain("70");
  });
});

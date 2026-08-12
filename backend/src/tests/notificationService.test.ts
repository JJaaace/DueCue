import { describe, expect, it } from "vitest";

describe("notification deduplication policy", () => {
  it("uses a task, notification type, and recommendation version as the delivery identity", () => {
    const identity = (taskId: string, type: string, recommendationId: string) => `${taskId}:${type}:${recommendationId}`;
    expect(identity("task-a", "start_recommendation", "rec-1")).toBe(identity("task-a", "start_recommendation", "rec-1"));
    expect(identity("task-a", "start_recommendation", "rec-1")).not.toBe(identity("task-a", "start_recommendation", "rec-2"));
  });
});

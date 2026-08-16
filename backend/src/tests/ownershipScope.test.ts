import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(resolve(import.meta.dirname, "..", "routes", name), "utf8");

describe("ownership boundaries", () => {
  it("keeps task, feedback, recipient, calendar, and recommendation operations scoped to req.userId", () => {
    const data = source("data.ts");
    const notifications = source("notifications.ts");
    const calendar = source("calendar.ts");
    const recommendations = source("recommendations.ts");
    const feedback = readFileSync(resolve(import.meta.dirname, "..", "services", "feedback", "feedbackService.ts"), "utf8");

    expect(data).toContain("id: req.params.id, userId: req.userId");
    expect(data).toContain("const where = { userId: req.userId!, removedAt: null");
    expect(notifications).toContain("id: req.params.id, userId: req.userId");
    expect(calendar).toContain("where: { userId: req.userId!, active: true }");
    expect(recommendations).toContain("where: { userId: req.userId, taskId: req.params.taskId }");
    expect(feedback).toContain("where: { id: input.taskId, userId }");
  });
});

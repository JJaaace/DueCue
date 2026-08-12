import { describe, expect, it } from "vitest";
import { calculateRecommendation } from "../services/recommendations/recommendationEngine.js";

const now = new Date("2026-08-11T12:00:00.000Z");
const input = (overrides = {}) => ({ type: "assignment" as const, dueAt: new Date("2026-08-20T12:00:00.000Z"), pointsPossible: 25, estimatedMinutes: 120, taskDifficulty: "medium" as const, courseDifficulty: "normal" as const, reminderStyle: "balanced" as const, now, ...overrides });

describe("recommendation engine", () => {
  it("gives exams a longer base window than assignments", () => expect(calculateRecommendation(input({ type: "exam" })).leadTimeDays).toBeGreaterThan(calculateRecommendation(input()).leadTimeDays));
  it("adjusts lead time for reminder style without becoming unsafe", () => {
    expect(calculateRecommendation(input({ reminderStyle: "conservative" })).leadTimeDays).toBeGreaterThan(calculateRecommendation(input()).leadTimeDays);
    expect(calculateRecommendation(input({ reminderStyle: "aggressive", type: "reading", taskDifficulty: "low", courseDifficulty: "easy" })).leadTimeDays).toBeGreaterThanOrEqual(0.5);
  });
  it("increases priority for high-point, imminent work", () => expect(calculateRecommendation(input({ dueAt: new Date("2026-08-12T12:00:00.000Z"), pointsPossible: 150, type: "project", taskDifficulty: "high" })).priorityScore).toBeGreaterThan(calculateRecommendation(input()).priorityScore));
  it("uses feedback adjustment and confidence sample size", () => {
    const base = calculateRecommendation(input()); const learned = calculateRecommendation(input({ adjustmentDays: 1.5, sampleSize: 5 }));
    expect(learned.leadTimeDays).toBeGreaterThan(base.leadTimeDays); expect(learned.confidenceScore).toBeGreaterThan(base.confidenceScore);
  });
  it("starts effort-heavy work earlier and raises its urgency", () => {
    const light = calculateRecommendation(input({ estimatedMinutes: 30 }));
    const heavy = calculateRecommendation(input({ estimatedMinutes: 360, taskDifficulty: "high" }));
    expect(heavy.leadTimeDays).toBeGreaterThan(light.leadTimeDays);
    expect(heavy.priorityScore).toBeGreaterThan(light.priorityScore);
  });
  it("accounts for a hard course in the recommended window", () => {
    const normal = calculateRecommendation(input({ courseDifficulty: "normal" }));
    const hard = calculateRecommendation(input({ courseDifficulty: "hard" }));
    expect(hard.leadTimeDays).toBeGreaterThan(normal.leadTimeDays);
    expect(hard.factors).toContain("hard course: +0.75 day");
  });
  it("raises the score when a deadline changes", () => {
    const stable = calculateRecommendation(input({ dueAt: new Date("2026-08-13T12:00:00.000Z") }));
    const changed = calculateRecommendation(input({ dueAt: new Date("2026-08-13T12:00:00.000Z"), dueDateChanged: true }));
    expect(changed.priorityScore).toBeGreaterThan(stable.priorityScore);
  });
});

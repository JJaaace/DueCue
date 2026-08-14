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
  it("adds a bounded priority boost when a course is below its grade target", () => {
    const base = calculateRecommendation(input());
    const behind = calculateRecommendation(input({ currentGradePercent: 70, targetGradePercent: 85, courseImportance: "important" as const }));
    expect(behind.priorityScore).toBeGreaterThan(base.priorityScore);
    expect(behind.priorityScore - base.priorityScore).toBeLessThanOrEqual(22);
    expect(behind.explanation).toContain("Prioritized higher");
  });
  it("slightly lowers low-value work when a course is safely above target", () => {
    const base = calculateRecommendation(input({ pointsPossible: 10, type: "reading" }));
    const ahead = calculateRecommendation(input({ pointsPossible: 10, type: "reading", currentGradePercent: 95, targetGradePercent: 85 }));
    expect(ahead.priorityScore).toBeLessThan(base.priorityScore);
  });
  it("keeps a high-value exam important even with a strong course grade", () => {
    const exam = calculateRecommendation(input({ type: "exam", pointsPossible: 150, dueAt: new Date("2026-08-12T12:00:00.000Z"), currentGradePercent: 96, targetGradePercent: 90 }));
    expect(exam.priorityScore).toBeGreaterThan(60);
  });
  it("works normally when grade data is absent", () => {
    expect(calculateRecommendation(input()).factors.some((factor) => factor.includes("grade goal signal"))).toBe(false);
  });
});

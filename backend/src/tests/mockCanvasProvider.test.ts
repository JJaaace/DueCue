import { describe, expect, it } from "vitest";
import { MockCanvasProvider } from "../services/providers/mockCanvasProvider.js";

describe("MockCanvasProvider", () => {
  it("returns five courses and at least twenty fresh tasks at stage 1", async () => {
    const result = await new MockCanvasProvider().sync("user", "connection", { mockStage: 1 });
    expect(result.courses).toHaveLength(5);
    expect(result.tasks.length).toBeGreaterThanOrEqual(20);
    expect(new Date(result.tasks[0]!.dueAt).getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000);
  });

  it("exposes the deterministic sync-story changes through stages", async () => {
    const provider = new MockCanvasProvider();
    const one = await provider.sync("user", "connection", { mockStage: 1 });
    const two = await provider.sync("user", "connection", { mockStage: 2 });
    const three = await provider.sync("user", "connection", { mockStage: 3 });
    const four = await provider.sync("user", "connection", { mockStage: 4 });
    expect(two.tasks.find((task) => task.externalId === "cse-project-02")).toBeDefined();
    expect(new Date(three.tasks.find((task) => task.externalId === "math-quiz-02")!.dueAt).getTime()).toBeLessThan(new Date(one.tasks.find((task) => task.externalId === "math-quiz-02")!.dueAt).getTime());
    expect(four.tasks.find((task) => task.externalId === "english-essay-draft")!.pointsPossible).toBe(100);
  });
});

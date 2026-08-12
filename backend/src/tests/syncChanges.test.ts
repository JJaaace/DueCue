import { describe, expect, it } from "vitest";
import { detectTaskChanges } from "../services/sync/syncEngine.js";

describe("sync change detection", () => {
  it("records independently meaningful due date, title, and point changes", () => {
    const changes = detectTaskChanges(
      { title: "Quiz 2", dueAt: new Date("2026-09-10T23:59:00.000Z"), pointsPossible: 30 },
      { externalId: "quiz", courseExternalId: "math", title: "Quiz 2: Derivatives", type: "quiz", dueAt: "2026-09-08T23:59:00.000Z", pointsPossible: 40 },
    );
    expect(changes.map((change) => change.type)).toEqual(["title_changed", "due_date_changed", "points_changed"]);
  });
});


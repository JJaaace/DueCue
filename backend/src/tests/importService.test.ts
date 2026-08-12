import { describe, expect, it } from "vitest";
import { parseIcal } from "../services/imports/importService.js";

describe("iCal import", () => {
  it("imports user-authorized events and classifies a midterm as an exam", () => {
    const tasks = parseIcal("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:event-1\nDTSTART:20260920T180000Z\nSUMMARY:Calculus Midterm\nDESCRIPTION:Review chapters\nEND:VEVENT\nEND:VCALENDAR");
    expect(tasks).toHaveLength(1); expect(tasks[0]).toMatchObject({ id: "event-1", title: "Calculus Midterm", type: "exam" });
  });
});

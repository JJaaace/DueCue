import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CalendarFeedError, classifyCalendarTask, parseCalendarFeed, parseCalendarDate } from "../services/imports/calendarFeed.js";

const fixture = readFileSync(fileURLToPath(new URL("./fixtures/canvas-calendar.ics", import.meta.url)), "utf8");

describe("calendar feed parsing", () => {
  it("parses Canvas-style events, folded lines, course suffixes, time zones, and unusual characters", () => {
    const result = parseCalendarFeed(fixture, { defaultTimeZone: "America/New_York", sourceFingerprint: "fixture" });
    expect(result).toMatchObject({ eventsFound: 3, skipped: 0 });
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks[0]).toMatchObject({ title: "Homework 1", courseCode: "MATH 1152", type: "assignment", dueAt: "2026-09-20T18:00:00.000Z", description: "Complete problems 1, 3; and 5\nSubmit in Canvas." });
    expect(result.tasks[1]).toMatchObject({ title: "Project 1: Component-Based Program", courseCode: "CSE 2221", type: "project", dueAt: "2026-09-23T03:59:00.000Z" });
    expect(result.tasks[2]).toMatchObject({ title: "Discussion Post", courseCode: "ENGLISH 1110", type: "discussion", dueAt: "2026-09-26T03:59:00.000Z" });
  });

  it("supports UTC, floating, and date-only values", () => {
    expect(parseCalendarDate({ value: "20261001T120000Z", params: {} })).toBe("2026-10-01T12:00:00.000Z");
    expect(parseCalendarDate({ value: "20261001T080000", params: {} }, "America/New_York")).toBe("2026-10-01T12:00:00.000Z");
    expect(parseCalendarDate({ value: "20261001", params: { VALUE: "DATE" } }, "UTC")).toBe("2026-10-01T23:59:00.000Z");
  });

  it("creates deterministic fallback identities when UID is missing", () => {
    const calendar = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260920T180000Z\nSUMMARY:Homework 1 [MATH 1152]\nEND:VEVENT\nEND:VCALENDAR";
    const first = parseCalendarFeed(calendar, { sourceFingerprint: "same-feed" }).tasks[0]!;
    const second = parseCalendarFeed(calendar, { sourceFingerprint: "same-feed" }).tasks[0]!;
    expect(first.externalId).toBe(second.externalId);
    expect(first.sourceUid).toBeUndefined();
  });

  it("skips events missing a summary or start date and reports the count", () => {
    const calendar = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:no-summary\nDTSTART:20260920T180000Z\nEND:VEVENT\nBEGIN:VEVENT\nUID:no-date\nSUMMARY:Quiz\nEND:VEVENT\nEND:VCALENDAR";
    expect(parseCalendarFeed(calendar)).toMatchObject({ eventsFound: 2, tasks: [], skipped: 2 });
  });

  it("rejects malformed calendars and unsupported dates", () => {
    expect(() => parseCalendarFeed("not a calendar")).toThrow(CalendarFeedError);
    expect(() => parseCalendarFeed("BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Quiz\nDTSTART:tomorrow\nEND:VEVENT\nEND:VCALENDAR")).toThrow(CalendarFeedError);
  });

  it("classifies common coursework titles deterministically", () => {
    expect(classifyCalendarTask("Final Test")).toBe("exam");
    expect(classifyCalendarTask("Quiz 2")).toBe("quiz");
    expect(classifyCalendarTask("Lab 3")).toBe("lab");
    expect(classifyCalendarTask("Office hours")).toBe("other");
  });
});

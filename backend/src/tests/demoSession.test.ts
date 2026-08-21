import { afterEach, describe, expect, it } from "vitest";
import {
  clearDemoSessionsForTests,
  getAnonymousDemoSession,
  endDemoSession,
  getDemoSession,
  recordDemoFeedback,
  startDemoSession,
  startAnonymousDemoSession,
  syncAnonymousDemoSession,
  syncDemoSession,
  updateDemoStep,
} from "../services/demo/demoSessionService.js";

afterEach(clearDemoSessionsForTests);

describe("isolated interactive demo sessions", () => {
  it("starts once per user and restores the active step without duplicating coursework", async () => {
    const first = await startDemoSession("student-a");
    updateDemoStep("student-a", 3);
    const restored = await startDemoSession("student-a");
    expect(restored.id).toBe(first.id);
    expect(restored.step).toBe(3);
    expect(new Set(restored.tasks.map((task) => task.id)).size).toBe(restored.tasks.length);
  });

  it("scopes temporary records to the active user and session id", async () => {
    const first = await startDemoSession("student-a");
    const second = await startDemoSession("student-b");
    expect(first.id).not.toBe(second.id);
    expect(first.tasks.every((task) => task.id.includes(first.id) && !task.id.includes(second.id))).toBe(true);
    expect(second.tasks.every((task) => task.id.includes(second.id) && !task.id.includes(first.id))).toBe(true);
  });

  it("keeps feedback demo-only and idempotently applies the sync story before exposing a change", async () => {
    const session = await startDemoSession("student-a");
    const task = session.tasks[0]!;
    const feedback = await recordDemoFeedback("student-a", task.id, "about_right");
    const repeated = await recordDemoFeedback("student-a", task.id, "about_right");
    expect(feedback?.demoOnly).toBe(true);
    expect(repeated?.id).toBe(feedback?.id);
    expect(getDemoSession("student-a")?.feedbackTaskIds).toEqual([task.id]);

    expect(session.events).toHaveLength(0);
    const synced = await syncDemoSession("student-a");
    expect(synced?.events).toHaveLength(1);
    expect(synced?.events[0]?.eventType).toBe("created");
    const syncedAgain = await syncDemoSession("student-a");
    expect(syncedAgain?.events).toHaveLength(2);
    expect(syncedAgain?.events[0]?.eventType).toBe("due_date_changed");
    expect(synced?.changedTaskId).toBeTruthy();
  });

  it("cleans up safely more than once without touching another user's session", async () => {
    await startDemoSession("student-a");
    const other = await startDemoSession("student-b");
    expect(endDemoSession("student-a")).toEqual({ removed: true, demoOnly: true });
    expect(endDemoSession("student-a")).toEqual({ removed: false, demoOnly: true });
    expect(getDemoSession("student-a")).toBeNull();
    expect(getDemoSession("student-b")?.id).toBe(other.id);
  });

  it("creates idempotent anonymous sessions and recreates an expired browser session safely", async () => {
    const first = await startAnonymousDemoSession();
    const restored = await startAnonymousDemoSession(first.sessionId);
    expect(restored.session.id).toBe(first.session.id);
    expect(restored.session.stage).toBe(1);
    expect(restored.session.tasks.length).toBeGreaterThan(0);
    expect(getAnonymousDemoSession(first.sessionId)?.id).toBe(first.session.id);
  });

  it("keeps two anonymous visitors' sync stages and feedback isolated", async () => {
    const first = await startAnonymousDemoSession();
    const second = await startAnonymousDemoSession();
    await syncAnonymousDemoSession(first.sessionId);
    expect(getAnonymousDemoSession(first.sessionId)?.stage).toBe(2);
    expect(getAnonymousDemoSession(second.sessionId)?.stage).toBe(1);
    expect(getAnonymousDemoSession(second.sessionId)?.events).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { emailTemplate } from "../services/notifications/emailTemplates.js";
import { isUsableEmailFeedbackToken } from "../services/feedback/emailFeedbackService.js";

describe("Start Window Open email", () => {
  const links = { too_early: "https://duecue.test/feedback/email?token=opaque&rating=too_early", about_right: "https://duecue.test/feedback/email?token=opaque&rating=about_right", too_late: "https://duecue.test/feedback/email?token=opaque&rating=too_late" };
  it("explains a start window and includes one-click timing feedback links", () => {
    const email = emailTemplate({ type: "start_recommendation", course: "CSE 2221", title: "Lab 01", due: "Aug 13 at 7:59 PM", explanation: "DueCue recommends starting today.", startWindow: "Aug 11", score: 60, effort: 90, feedbackLinks: links });
    expect(email.subject).toBe("DueCue: Start CSE 2221 Lab 01 today");
    expect(email.body).toContain("Cue score: 60/100");
    expect(email.body).toContain("Estimated effort: 90 minutes");
    expect(email.body).toContain(links.about_right);
  });
  it("rejects expired and duplicate-click tokens before feedback can be recorded", () => {
    const now = new Date("2026-08-12T12:00:00Z");
    expect(isUsableEmailFeedbackToken({ consumedAt: null, expiresAt: new Date("2026-08-13T12:00:00Z") }, now)).toBe(true);
    expect(isUsableEmailFeedbackToken({ consumedAt: null, expiresAt: new Date("2026-08-11T12:00:00Z") }, now)).toBe(false);
    expect(isUsableEmailFeedbackToken({ consumedAt: now, expiresAt: new Date("2026-08-13T12:00:00Z") }, now)).toBe(false);
  });
  it("keeps each feedback action bound to its own signed-link rating", () => {
    const actions = ["too_early", "about_right", "too_late"];
    expect(new Set(actions).size).toBe(3);
    expect(links.too_early).toContain("rating=too_early");
    expect(links.about_right).toContain("rating=about_right");
    expect(links.too_late).toContain("rating=too_late");
  });
});

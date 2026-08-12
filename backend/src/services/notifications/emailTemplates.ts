export type EmailCue = { type: "start_recommendation" | "due_soon" | "deadline_changed" | "digest"; course: string; title: string; due: string; explanation: string; startWindow: string; score: number; effort?: number | null; feedbackLinks?: Record<"too_early" | "about_right" | "too_late", string> };
export function emailTemplate(cue: EmailCue) {
  const heading = cue.type === "start_recommendation" ? "Start window open" : cue.type === "due_soon" ? "Due soon" : cue.type === "deadline_changed" ? "Deadline changed" : "Your weekly plan";
  const subject = cue.type === "start_recommendation" ? `DueCue: Start ${cue.course} ${cue.title} today` : `DueCue: ${heading} · ${cue.course} ${cue.title}`;
  const feedback = cue.feedbackLinks ? `\n\nWas this cue timed right?\nToo early: ${cue.feedbackLinks.too_early}\nJust right: ${cue.feedbackLinks.about_right}\nToo late: ${cue.feedbackLinks.too_late}` : "";
  const effort = cue.effort ? `\nEstimated effort: ${cue.effort} minutes` : "";
  return { subject, body: `${cue.course} ${cue.title} is due ${cue.due}.\n\n${cue.explanation}\nRecommended start window: ${cue.startWindow}\nCue score: ${cue.score}/100${effort}${feedback}` };
}

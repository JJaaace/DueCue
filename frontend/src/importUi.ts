import { ApiError } from "./api";

export type CalendarSyncCounts = {
  eventsFound: number;
  tasksCreated: number;
  tasksUpdated: number;
  tasksUnchanged: number;
  tasksSkipped: number;
};

export type CalendarFeedSource = {
  type: "calendar_feed";
  status: "connected" | "disconnected" | "error";
  displayName: string;
  providerHost?: string;
  lastSyncAt: string | null;
  lastAttemptAt: string | null;
};

export type CalendarFeedState = { source: CalendarFeedSource | null; sync: CalendarSyncCounts | null };
export type CalendarSyncResult = { success: true; source: CalendarFeedSource; sync: CalendarSyncCounts };

export function calendarSyncMessage(counts: CalendarSyncCounts) {
  if (counts.eventsFound === 0 || counts.tasksCreated + counts.tasksUpdated + counts.tasksUnchanged === 0) {
    return "The calendar connected successfully, but no assignments or tests were found yet.";
  }
  const imported = counts.tasksCreated;
  const updated = counts.tasksUpdated;
  const unchanged = counts.tasksUnchanged;
  return `Calendar connected. ${counts.eventsFound} item${counts.eventsFound === 1 ? "" : "s"} found, ${imported} imported, ${updated} updated, ${unchanged} already up to date.`;
}

export function calendarImportError(error: unknown) {
  if (!(error instanceof ApiError)) return "Unable to reach DueCue right now. Please try again in a moment.";
  if (error.kind === "authentication") return "Your DueCue session expired. Sign in again and retry.";
  if (error.kind === "network" || error.kind === "timeout" || error.kind === "server") return error.message;
  if (error.code === "invalid_calendar_url") return error.message || "That doesn’t look like a valid calendar feed URL. Paste the full iCal/ICS link from your school calendar.";
  if (error.code === "calendar_feed_unreachable") return "DueCue could not access that calendar feed. Make sure the link is still valid and accessible.";
  if (error.code === "invalid_calendar_data") return "DueCue reached the feed, but the calendar data could not be read.";
  return error.message || "DueCue could not connect that calendar feed.";
}

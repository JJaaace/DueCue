import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { IncomingHttpHeaders } from "node:http";
import https from "node:https";
import { isIP } from "node:net";

const MAX_FEED_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export type CalendarFeedErrorCode =
  | "invalid_calendar_url"
  | "calendar_feed_unreachable"
  | "invalid_calendar_data"
  | "calendar_sync_in_progress"
  | "calendar_sync_failed";

export class CalendarFeedError extends Error {
  constructor(
    public readonly code: CalendarFeedErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CalendarFeedError";
  }
}

export type CalendarTaskType = "assignment" | "quiz" | "exam" | "project" | "reading" | "discussion" | "lab" | "other";

export type ParsedCalendarTask = {
  externalId: string;
  sourceUid?: string;
  courseCode: string;
  courseName: string;
  title: string;
  dueAt: string;
  type: CalendarTaskType;
  description?: string;
  sourceUrl?: string;
  location?: string;
};

export type ParsedCalendarFeed = {
  eventsFound: number;
  tasks: ParsedCalendarTask[];
  skipped: number;
  calendarName?: string;
};

export type ResolvedFeedUrl = {
  url: URL;
  hostname: string;
  address: string;
  family: 4 | 6;
};

export type AddressResolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const feedFingerprint = (url: string) => hash(url).slice(0, 24);

function unsafeIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets as [number, number, number, number];
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0)
    || a >= 224;
}

function unsafeIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0]!;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return unsafeIpv4(mapped[1]!);
  if (normalized.startsWith("::ffff:")) return true;
  return normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || /^fe[89a-f]/.test(normalized)
    || normalized.startsWith("ff")
    || normalized.startsWith("2001:db8:");
}

export function isUnsafeAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return unsafeIpv4(address);
  if (family === 6) return unsafeIpv6(address);
  return true;
}

const defaultResolver: AddressResolver = async (hostname) => lookup(hostname, { all: true, verbatim: true });

export async function validateCalendarFeedUrl(rawUrl: string, resolve: AddressResolver = defaultResolver): Promise<ResolvedFeedUrl> {
  if (!rawUrl || rawUrl.length > 2_048) throw new CalendarFeedError("invalid_calendar_url", 400, "That doesn’t look like a valid calendar feed URL. Paste the full iCal/ICS link from your school calendar.");
  let url: URL;
  try { url = new URL(rawUrl); }
  catch { throw new CalendarFeedError("invalid_calendar_url", 400, "That doesn’t look like a valid calendar feed URL. Paste the full iCal/ICS link from your school calendar."); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new CalendarFeedError("invalid_calendar_url", 400, "That doesn’t look like a valid calendar feed URL. Use the full HTTPS iCal/ICS link from your school calendar.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname === "metadata.google.internal") {
    throw new CalendarFeedError("invalid_calendar_url", 400, "That calendar feed URL is not allowed.");
  }
  let addresses: Array<{ address: string; family: number }>;
  try { addresses = await resolve(hostname); }
  catch { throw new CalendarFeedError("calendar_feed_unreachable", 422, "DueCue could not access that calendar feed. Make sure the link is still valid and accessible."); }
  if (!addresses.length || addresses.some(({ address }) => isUnsafeAddress(address))) {
    throw new CalendarFeedError("invalid_calendar_url", 400, "That calendar feed URL is not allowed.");
  }
  const selected = addresses[0]!;
  url.hash = "";
  return { url, hostname, address: selected.address, family: selected.family === 6 ? 6 : 4 };
}

async function requestCalendar(resolved: ResolvedFeedUrl, deadline: number) {
  const remaining = Math.max(1, deadline - Date.now());
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const request = https.request(resolved.url, {
      method: "GET",
      headers: {
        Accept: "text/calendar, application/octet-stream;q=0.9, text/plain;q=0.8, */*;q=0.2",
        "User-Agent": "DueCue-Calendar-Sync/1.0",
      },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [{ address: resolved.address, family: resolved.family }]);
        else callback(null, resolved.address, resolved.family);
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const declaredLength = Number(response.headers["content-length"] ?? 0);
      if (declaredLength > MAX_FEED_BYTES) {
        response.destroy();
        reject(new CalendarFeedError("invalid_calendar_data", 422, "DueCue reached the feed, but the calendar data was too large to read safely."));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_FEED_BYTES) {
          response.destroy(new CalendarFeedError("invalid_calendar_data", 422, "DueCue reached the feed, but the calendar data was too large to read safely."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    request.setTimeout(remaining, () => request.destroy(new CalendarFeedError("calendar_feed_unreachable", 422, "DueCue could not access that calendar feed. Make sure the link is still valid and accessible.")));
    const absoluteTimeout = setTimeout(() => request.destroy(new CalendarFeedError("calendar_feed_unreachable", 422, "DueCue could not access that calendar feed. Make sure the link is still valid and accessible.")), remaining);
    request.on("close", () => clearTimeout(absoluteTimeout));
    request.on("error", reject);
    request.end();
  });
}

export async function fetchCalendarFeed(rawUrl: string) {
  const deadline = Date.now() + FETCH_TIMEOUT_MS;
  let current = rawUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const resolved = await validateCalendarFeedUrl(current);
    let response: Awaited<ReturnType<typeof requestCalendar>>;
    try { response = await requestCalendar(resolved, deadline); }
    catch (error) {
      if (error instanceof CalendarFeedError) throw error;
      throw new CalendarFeedError("calendar_feed_unreachable", 422, "DueCue could not access that calendar feed. Make sure the link is still valid and accessible.");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location || redirect === MAX_REDIRECTS) throw new CalendarFeedError("calendar_feed_unreachable", 422, "DueCue could not access that calendar feed. Make sure the link is still valid and accessible.");
      current = new URL(location, resolved.url).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new CalendarFeedError("calendar_feed_unreachable", 422, "DueCue could not access that calendar feed. Make sure the link is still valid and accessible.");
    if (!/BEGIN:VCALENDAR/i.test(response.body)) throw new CalendarFeedError("invalid_calendar_data", 422, "DueCue reached the feed, but the calendar data could not be read.");
    return { text: response.body, hostname: resolved.hostname };
  }
  throw new CalendarFeedError("calendar_feed_unreachable", 422, "DueCue could not access that calendar feed. Make sure the link is still valid and accessible.");
}

type ContentProperty = { value: string; params: Record<string, string> };

function contentProperty(line: string) {
  let quoted = false;
  let separator = -1;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (line[index] === ":" && !quoted) { separator = index; break; }
  }
  if (separator <= 0) return null;
  const [name, ...parameterParts] = line.slice(0, separator).split(";");
  const params = Object.fromEntries(parameterParts.map((part) => {
    const equals = part.indexOf("=");
    return equals > 0 ? [part.slice(0, equals).toUpperCase(), part.slice(equals + 1).replace(/^"|"$/g, "")] : [part.toUpperCase(), ""];
  }));
  return { name: name!.toUpperCase(), property: { value: line.slice(separator + 1), params } satisfies ContentProperty };
}

function decodeText(value: string) {
  return value
    .replace(/\\[nN]/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function plainText(value: string) {
  return decodeText(value).replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim();
}

function safeEventUrl(value: string | undefined) {
  if (!value) return undefined;
  const decoded = decodeText(value).trim();
  if (!decoded || decoded.length > 2_048) return undefined;
  try { const url = new URL(decoded); return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined; }
  catch { return undefined; }
}

function zoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  return Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = zoneParts(new Date(guess), timeZone);
    const represented = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
    guess += desired - represented;
  }
  return new Date(guess);
}

export function parseCalendarDate(property: ContentProperty, defaultTimeZone = "UTC") {
  const value = property.value.trim();
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) throw new CalendarFeedError("invalid_calendar_data", 422, "DueCue reached the feed, but the calendar data could not be read.");
  const [, year, month, day, rawHour, rawMinute, rawSecond, utc] = match;
  const dateOnly = property.params.VALUE?.toUpperCase() === "DATE" || !rawHour;
  const hour = dateOnly ? 23 : Number(rawHour);
  const minute = dateOnly ? 59 : Number(rawMinute ?? 0);
  const second = dateOnly ? 0 : Number(rawSecond ?? 0);
  const timeZone = property.params.TZID || defaultTimeZone;
  try {
    const date = utc ? new Date(Date.UTC(+year!, +month! - 1, +day!, hour, minute, second)) : zonedTimeToUtc(+year!, +month!, +day!, hour, minute, second, timeZone);
    if (Number.isNaN(date.getTime())) throw new Error();
    return date.toISOString();
  } catch {
    throw new CalendarFeedError("invalid_calendar_data", 422, "DueCue reached the feed, but the calendar data could not be read.");
  }
}

export function classifyCalendarTask(title: string): CalendarTaskType {
  const lower = title.toLowerCase();
  if (/\b(exam|midterm|final|test)\b/.test(lower)) return "exam";
  if (/\bquiz\b/.test(lower)) return "quiz";
  if (/\b(project|milestone|essay|paper)\b/.test(lower)) return "project";
  if (/\b(lab|laboratory)\b/.test(lower)) return "lab";
  if (/\b(discussion|post|reply)\b/.test(lower)) return "discussion";
  if (/\b(read|reading|chapter)\b/.test(lower)) return "reading";
  if (/\b(homework|assignment|problem set|worksheet)\b/.test(lower)) return "assignment";
  return "other";
}

function inferCourse(rawTitle: string, calendarName?: string) {
  const suffix = rawTitle.match(/\[\s*([A-Z]{2,}(?:\s|-)?\d{3,}[A-Z0-9-]*)\s*\]\s*$/i);
  if (suffix) {
    const code = suffix[1]!.replace(/([A-Za-z])(?=\d)/, "$1 ").replace(/\s+/g, " ").toUpperCase();
    return { code, name: code, title: rawTitle.slice(0, suffix.index).trim() };
  }
  const usefulCalendarName = calendarName && !/calendar|canvas|carmen|schedule/i.test(calendarName) ? calendarName.trim() : undefined;
  return { code: usefulCalendarName?.slice(0, 40) || "Unassigned", name: usefulCalendarName || "Unassigned course", title: rawTitle };
}

export function parseCalendarFeed(text: string, options: { defaultTimeZone?: string; sourceFingerprint?: string } = {}): ParsedCalendarFeed {
  if (!/BEGIN:VCALENDAR/i.test(text) || !/END:VCALENDAR/i.test(text)) throw new CalendarFeedError("invalid_calendar_data", 422, "DueCue reached the feed, but the calendar data could not be read.");
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: Array<Record<string, ContentProperty>> = [];
  let event: Record<string, ContentProperty> | null = null;
  let calendarName: string | undefined;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.toUpperCase() === "BEGIN:VEVENT") { event = {}; continue; }
    if (line.toUpperCase() === "END:VEVENT") { if (event) events.push(event); event = null; continue; }
    const parsed = contentProperty(line);
    if (!parsed) continue;
    if (event) event[parsed.name] = parsed.property;
    else if (parsed.name === "X-WR-CALNAME") calendarName = plainText(parsed.property.value);
  }
  const tasks: ParsedCalendarTask[] = [];
  let skipped = 0;
  for (const item of events) {
    if (!item.SUMMARY || !item.DTSTART || item.STATUS?.value.toUpperCase() === "CANCELLED") { skipped += 1; continue; }
    const rawTitle = plainText(item.SUMMARY.value).replace(/^Due:\s*/i, "").trim().slice(0, 240);
    if (!rawTitle) { skipped += 1; continue; }
    const dueAt = parseCalendarDate(item.DTSTART, options.defaultTimeZone);
    const course = inferCourse(rawTitle, calendarName);
    const title = course.title || rawTitle;
    const uid = item.UID?.value.trim();
    const identity = uid ? `uid:${uid}` : `fallback:${options.sourceFingerprint ?? "calendar"}:${course.code}:${title.toLowerCase()}:${dueAt}`;
    tasks.push({
      externalId: `ical-${hash(identity).slice(0, 40)}`,
      sourceUid: uid ? hash(uid).slice(0, 20) : undefined,
      courseCode: course.code,
      courseName: course.name.slice(0, 120),
      title,
      dueAt,
      type: classifyCalendarTask(title),
      description: item.DESCRIPTION ? plainText(item.DESCRIPTION.value).slice(0, 5_000) || undefined : undefined,
      sourceUrl: safeEventUrl(item.URL?.value),
      location: item.LOCATION ? plainText(item.LOCATION.value).slice(0, 240) || undefined : undefined,
    });
  }
  return { eventsFound: events.length, tasks, skipped, calendarName };
}

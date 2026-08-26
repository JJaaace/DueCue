import { describe, expect, it } from "vitest";
import { CalendarFeedError, isUnsafeAddress, validateCalendarFeedUrl, type AddressResolver } from "../services/imports/calendarFeed.js";

const resolvesTo = (address: string): AddressResolver => async () => [{ address, family: address.includes(":") ? 6 : 4 }];

describe("calendar feed URL security", () => {
  it("accepts a valid HTTPS Canvas host that resolves publicly", async () => {
    const result = await validateCalendarFeedUrl("https://canvas.example.edu/feeds/calendars/fake.ics", resolvesTo("142.250.64.78"));
    expect(result.hostname).toBe("canvas.example.edu");
  });

  it.each([
    "http://canvas.example.edu/feed.ics",
    "ftp://canvas.example.edu/feed.ics",
    "file:///tmp/feed.ics",
    "data:text/calendar,BEGIN:VCALENDAR",
    "javascript:alert(1)",
    "https://localhost/feed.ics",
  ])("rejects invalid or unsupported URL %s", async (url) => {
    await expect(validateCalendarFeedUrl(url, resolvesTo("142.250.64.78"))).rejects.toBeInstanceOf(CalendarFeedError);
  });

  it.each(["127.0.0.1", "10.0.0.4", "172.16.1.4", "192.168.1.5", "169.254.169.254", "::1", "::ffff:7f00:1", "fd00:ec2::254"])("rejects private or metadata address %s", async (address) => {
    await expect(validateCalendarFeedUrl("https://calendar.example.edu/feed.ics", resolvesTo(address))).rejects.toMatchObject({ code: "invalid_calendar_url", status: 400 });
    expect(isUnsafeAddress(address)).toBe(true);
  });

  it("rejects the whole host when any DNS answer is private", async () => {
    await expect(validateCalendarFeedUrl("https://calendar.example.edu/feed.ics", async () => [{ address: "142.250.64.78", family: 4 }, { address: "127.0.0.1", family: 4 }])).rejects.toMatchObject({ code: "invalid_calendar_url" });
  });
});

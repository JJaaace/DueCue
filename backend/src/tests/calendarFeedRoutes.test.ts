import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarFeedError } from "../services/imports/calendarFeed.js";

const service = vi.hoisted(() => ({
  connect: vi.fn(),
  state: vi.fn(),
  sync: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("../middleware/auth.js", () => ({
  requireUser: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.header("authorization") !== "Bearer valid") return res.status(401).json({ error: "Authentication required." });
    req.userId = "user-1";
    next();
  },
}));
vi.mock("../lib/prisma.js", () => ({ prisma: { providerConnection: { findMany: vi.fn(async () => []) } } }));
vi.mock("../services/imports/importService.js", () => ({
  connectCalendarFeed: service.connect,
  getCalendarFeedState: service.state,
  syncConnectedCalendarFeed: service.sync,
  disconnectCalendarFeed: service.disconnect,
  importTasks: vi.fn(),
  parseIcal: vi.fn(() => []),
}));

import { importRouter } from "../routes/imports.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", importRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof CalendarFeedError) return res.status(error.status).json({ code: error.code, error: error.message });
    res.status(500).json({ error: "Unexpected error." });
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => vi.clearAllMocks());
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

const post = (body: object, authenticated = true) => fetch(`${baseUrl}/api/imports/ical-feed`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: "Bearer valid" } : {}) },
  body: JSON.stringify(body),
});

describe("calendar feed API contract", () => {
  it("rejects unauthenticated requests", async () => {
    expect((await post({ url: "https://canvas.example.edu/fake.ics" }, false)).status).toBe(401);
    expect(service.connect).not.toHaveBeenCalled();
  });

  it("returns a useful 4xx response for an invalid URL", async () => {
    service.connect.mockRejectedValueOnce(new CalendarFeedError("invalid_calendar_url", 400, "That doesn’t look like a valid calendar feed URL."));
    const response = await post({ url: "http://localhost/feed.ics" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_calendar_url" });
  });

  it("returns a useful response for malformed calendar data", async () => {
    service.connect.mockRejectedValueOnce(new CalendarFeedError("invalid_calendar_data", 422, "DueCue reached the feed, but the calendar data could not be read."));
    const response = await post({ url: "https://canvas.example.edu/fake.ics" });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_calendar_data" });
  });

  it("returns source state and synchronization counts after success", async () => {
    service.connect.mockResolvedValueOnce({ success: true, source: { type: "calendar_feed", status: "connected", displayName: "Canvas school calendar", lastSyncAt: "2026-08-25T12:00:00.000Z", lastAttemptAt: "2026-08-25T12:00:00.000Z" }, sync: { eventsFound: 22, tasksCreated: 15, tasksUpdated: 3, tasksUnchanged: 4, tasksSkipped: 0 } });
    const response = await post({ url: "https://canvas.example.edu/fake.ics" });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ success: true, source: { status: "connected" }, sync: { eventsFound: 22, tasksCreated: 15, tasksUpdated: 3, tasksUnchanged: 4 } });
    expect(service.connect).toHaveBeenCalledWith("user-1", "https://canvas.example.edu/fake.ics");
  });
});

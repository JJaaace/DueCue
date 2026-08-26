import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  courses: new Map<string, Record<string, any>>(),
  tasks: new Map<string, Record<string, any>>(),
  events: [] as Array<Record<string, any>>,
  nextId: 1,
}));

const transaction = vi.hoisted(() => ({
  course: {
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const key = where.userId_providerId_externalId.externalId;
      const existing = state.courses.get(key);
      const course = existing ? { ...existing, ...update } : { id: `course-${state.nextId++}`, ...create };
      state.courses.set(key, course);
      return course;
    }),
  },
  academicTask: {
    findUnique: vi.fn(async ({ where }: any) => state.tasks.get(where.userId_providerId_externalId.externalId) ?? null),
    create: vi.fn(async ({ data }: any) => {
      const task = { id: `task-${state.nextId++}`, removedAt: null, pointsPossible: null, estimatedMinutes: null, ...data };
      state.tasks.set(data.externalId, task);
      return task;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const entry = [...state.tasks.entries()].find(([, task]) => task.id === where.id);
      if (!entry) throw new Error("task missing");
      const updated = { ...entry[1], ...data };
      state.tasks.set(entry[0], updated);
      return updated;
    }),
  },
  taskEvent: {
    create: vi.fn(async ({ data }: any) => { state.events.push(data); return data; }),
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(async (operation: any) => typeof operation === "function" ? operation(transaction) : Promise.all(operation)),
    providerConnection: { findUnique: vi.fn(async () => null), update: vi.fn() },
    user: { findUnique: vi.fn(async () => ({ timezone: "America/New_York" })) },
    syncRun: { update: vi.fn() },
  },
}));
vi.mock("../services/recommendations/recommendationService.js", () => ({ recalculateUserRecommendations: vi.fn() }));
vi.mock("../services/notifications/notificationService.js", () => ({ generateNotificationPreviews: vi.fn() }));

import { parseCalendarFeed } from "../services/imports/calendarFeed.js";
import { connectCalendarFeed, syncCalendarTasks } from "../services/imports/importService.js";

const calendar = (events: string) => `BEGIN:VCALENDAR\n${events}\nEND:VCALENDAR`;
const event = (uid: string, title: string, due: string) => `BEGIN:VEVENT\nUID:${uid}\nDTSTART:${due}\nSUMMARY:${title}\nEND:VEVENT`;

beforeEach(() => {
  state.courses.clear();
  state.tasks.clear();
  state.events.length = 0;
  state.nextId = 1;
  vi.clearAllMocks();
});

describe("calendar task synchronization", () => {
  it("creates tasks on the first sync and leaves an identical second sync unchanged", async () => {
    const tasks = parseCalendarFeed(calendar(event("uid-1", "Homework 1 [MATH 1152]", "20260920T180000Z"))).tasks;
    await expect(syncCalendarTasks("user-1", tasks)).resolves.toEqual({ tasksCreated: 1, tasksUpdated: 0, tasksUnchanged: 0 });
    await expect(syncCalendarTasks("user-1", tasks)).resolves.toEqual({ tasksCreated: 0, tasksUpdated: 0, tasksUnchanged: 1 });
    expect(state.tasks.size).toBe(1);
    expect(state.events.filter((item) => item.eventType === "created")).toHaveLength(1);
  });

  it("updates a moved deadline and preserves user enrichment", async () => {
    const first = parseCalendarFeed(calendar(event("stable-uid", "Project 1 [CSE 2221]", "20260920T180000Z"))).tasks;
    await syncCalendarTasks("user-1", first);
    const stored = [...state.tasks.values()][0]!;
    stored.difficulty = "high";
    stored.estimatedMinutes = 360;
    stored.pointsPossible = 100;
    stored.type = "exam";
    stored.rawSource = { ...stored.rawSource, enrichedFields: ["difficulty", "estimatedMinutes", "pointsPossible", "type"] };

    const moved = parseCalendarFeed(calendar(event("stable-uid", "Project 1 [CSE 2221]", "20260922T180000Z"))).tasks;
    await expect(syncCalendarTasks("user-1", moved)).resolves.toEqual({ tasksCreated: 0, tasksUpdated: 1, tasksUnchanged: 0 });
    const updated = [...state.tasks.values()][0]!;
    expect(updated).toMatchObject({ difficulty: "high", estimatedMinutes: 360, pointsPossible: 100, type: "exam" });
    expect(updated.dueAt.toISOString()).toBe("2026-09-22T18:00:00.000Z");
    expect(state.events.some((item) => item.eventType === "due_date_changed")).toBe(true);
  });

  it("does not collide when different courses use the same assignment title", async () => {
    const tasks = parseCalendarFeed(calendar([
      event("math-homework", "Homework 1 [MATH 1152]", "20260920T180000Z"),
      event("cse-homework", "Homework 1 [CSE 2221]", "20260920T180000Z"),
    ].join("\n"))).tasks;
    await expect(syncCalendarTasks("user-1", tasks)).resolves.toMatchObject({ tasksCreated: 2 });
    expect(state.tasks.size).toBe(2);
    expect(new Set([...state.tasks.values()].map((task) => task.courseId)).size).toBe(2);
  });

  it("does not touch existing tasks when feed validation or fetching fails", async () => {
    state.tasks.set("existing", { id: "existing", title: "Keep me", difficulty: "high" });
    await expect(connectCalendarFeed("user-1", "https://127.0.0.1/private.ics")).rejects.toMatchObject({ code: "invalid_calendar_url" });
    expect(state.tasks.get("existing")).toMatchObject({ title: "Keep me", difficulty: "high" });
    const { prisma } = await import("../lib/prisma.js");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

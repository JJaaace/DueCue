import { randomUUID } from "node:crypto";
import type { FeedbackType, TaskType } from "@prisma/client";
import { MockCanvasProvider } from "../providers/mockCanvasProvider.js";
import { calculateRecommendation } from "../recommendations/recommendationEngine.js";
import type { ProviderCourse, ProviderTask } from "../../types/provider.js";

export type DemoLifecycleStatus = "active" | "completed" | "skipped" | "exited";

type DemoCourse = {
  id: string; providerId: string; externalId: string; code: string; name: string; instructorName: string | null; color: string;
  difficulty: "easy" | "normal" | "hard"; currentGradePercent: number | null; targetGradePercent: number | null;
  courseImportance: "normal" | "important" | "critical"; gradeGoalLabel: "maintain_a" | "raise_grade" | null; gradeDataSource: "manual";
};

type DemoRecommendation = {
  id: string; recommendedStartAt: string; priorityScore: number; confidenceScore: number; leadTimeDays: number;
  estimatedEffortMinutes: number | null; explanation: string; factors: { factors: string[] }; version: number;
};

export type DemoTask = {
  id: string; externalId: string; providerId: string; title: string; description: string | null; type: TaskType; dueAt: string;
  pointsPossible: number | null; status: "upcoming" | "start_now" | "overdue"; estimatedMinutes: number | null;
  difficulty: "low" | "medium" | "high"; course: DemoCourse; recommendations: DemoRecommendation[];
};

export type DemoEvent = {
  id: string; eventType: "created" | "due_date_changed" | "points_changed"; createdAt: string;
  previousValue?: Record<string, unknown>; newValue?: Record<string, unknown>; task: { id: string; title: string; course: { code: string } };
};

export type DemoNotification = {
  id: string; subject: string; body: string; type: "start_recommendation"; createdAt: string; recommendationId: string;
  task: { id: string; title: string; course: DemoCourse }; recipient: { email: string; label: string };
};

export type DemoSession = {
  id: string; userId: string; status: "active"; step: number; stage: number; createdAt: string; expiresAt: string;
  tasks: DemoTask[]; events: DemoEvent[]; notifications: DemoNotification[]; feedbackTaskIds: string[]; changedTaskId: string | null;
};

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_ANONYMOUS_SESSIONS = 2_000;
const sessions = new Map<string, DemoSession>();
const provider = new MockCanvasProvider();
const anonymousScope = (sessionId: string) => `anonymous:${sessionId}`;

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessions) if (new Date(session.expiresAt).getTime() <= now) sessions.delete(key);
}

function enforceAnonymousSessionLimit() {
  const anonymous = [...sessions.entries()].filter(([key]) => key.startsWith("anonymous:")).sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt));
  while (anonymous.length >= MAX_ANONYMOUS_SESSIONS) {
    const oldest = anonymous.shift();
    if (oldest) sessions.delete(oldest[0]);
  }
}

const courseGradeData = (code: string) => code === "MATH 1151"
  ? { currentGradePercent: 70, targetGradePercent: 85, courseImportance: "important" as const, gradeGoalLabel: "raise_grade" as const }
  : code === "ENGLISH 1110"
    ? { currentGradePercent: 95, targetGradePercent: 90, courseImportance: "normal" as const, gradeGoalLabel: "maintain_a" as const }
    : { currentGradePercent: null, targetGradePercent: null, courseImportance: "normal" as const, gradeGoalLabel: null };

const courseFrom = (sessionId: string, course: ProviderCourse): DemoCourse => ({
  id: `demo:${sessionId}:course:${course.externalId}`, providerId: `demo_session:${sessionId}`, externalId: course.externalId,
  code: course.code, name: course.name, instructorName: course.instructorName ?? null, color: course.color ?? "#D21F3C",
  difficulty: course.difficulty ?? "normal", ...courseGradeData(course.code), gradeDataSource: "manual",
});

function taskFrom(session: DemoSession, incoming: ProviderTask, course: DemoCourse, dueDateChanged = false): DemoTask {
  const taskId = `demo:${session.id}:task:${incoming.externalId}`;
  const learned = session.feedbackTaskIds.includes(taskId);
  const calculated = calculateRecommendation({
    type: (incoming.type ?? "other") as TaskType, dueAt: new Date(incoming.dueAt), pointsPossible: incoming.pointsPossible ?? null,
    estimatedMinutes: incoming.estimatedMinutes ?? null, taskDifficulty: incoming.difficulty ?? "medium", courseDifficulty: course.difficulty,
    currentGradePercent: course.currentGradePercent, targetGradePercent: course.targetGradePercent, courseImportance: course.courseImportance,
    reminderStyle: "balanced", sampleSize: learned ? 1 : 0, dueDateChanged,
  });
  const recommendation: DemoRecommendation = {
    id: `demo:${session.id}:recommendation:${incoming.externalId}`, recommendedStartAt: calculated.recommendedStartAt.toISOString(),
    priorityScore: calculated.priorityScore, confidenceScore: calculated.confidenceScore, leadTimeDays: calculated.leadTimeDays,
    estimatedEffortMinutes: incoming.estimatedMinutes ?? null, explanation: calculated.explanation,
    factors: { factors: calculated.factors }, version: dueDateChanged ? 2 : 1,
  };
  return {
    id: taskId, externalId: incoming.externalId, providerId: `demo_session:${session.id}`, title: incoming.title,
    description: incoming.description ?? null, type: (incoming.type ?? "other") as TaskType, dueAt: incoming.dueAt,
    pointsPossible: incoming.pointsPossible ?? null, estimatedMinutes: incoming.estimatedMinutes ?? null,
    difficulty: incoming.difficulty ?? "medium", status: calculated.isOverdue ? "overdue" : calculated.shouldStartNow ? "start_now" : "upcoming",
    course, recommendations: [recommendation],
  };
}

function reminderFor(session: DemoSession, task: DemoTask, index: number): DemoNotification {
  const recommendation = task.recommendations[0]!;
  const due = new Date(task.dueAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const start = new Date(recommendation.recommendedStartAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return {
    id: `demo:${session.id}:notification:${index}:${task.externalId}`, type: "start_recommendation", createdAt: new Date().toISOString(),
    recommendationId: recommendation.id, subject: `Start ${task.course.code}: ${task.title}`,
    body: `${task.course.code} · ${task.title}\nDue ${due}\nRecommended start ${start}\nCue score ${recommendation.priorityScore}/100 · ${task.estimatedMinutes ?? 60} min\n\n${recommendation.explanation}`,
    task: { id: task.id, title: task.title, course: task.course }, recipient: { email: "student@example.edu", label: "You (demo)" },
  };
}

async function populate(session: DemoSession, stage: number) {
  const result = await provider.sync(session.userId, session.id, { mockStage: stage });
  const courses = new Map(result.courses.map((course) => [course.externalId, courseFrom(session.id, course)]));
  const changedExternalId = stage >= 3 ? "math-quiz-02" : null;
  session.tasks = result.tasks.map((task) => taskFrom(session, task, courses.get(task.courseExternalId)!, task.externalId === changedExternalId));
  session.notifications = [...session.tasks].sort((a, b) => b.recommendations[0]!.priorityScore - a.recommendations[0]!.priorityScore).slice(0, 3).map((task, index) => reminderFor(session, task, index));
  session.stage = stage;
  session.changedTaskId = changedExternalId ? session.tasks.find((task) => task.externalId === changedExternalId)?.id ?? null : null;
}

function activeSession(userId: string) {
  const session = sessions.get(userId);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) { sessions.delete(userId); return null; }
  return session;
}

export async function startDemoSession(userId: string) {
  pruneExpiredSessions();
  const existing = activeSession(userId);
  if (existing) return existing;
  const now = new Date();
  const session: DemoSession = {
    id: randomUUID(), userId, status: "active", step: 0, stage: 1, createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(), tasks: [], events: [], notifications: [], feedbackTaskIds: [], changedTaskId: null,
  };
  sessions.set(userId, session);
  try { await populate(session, 1); }
  catch (error) { sessions.delete(userId); throw error; }
  return session;
}

export const getDemoSession = (userId: string) => activeSession(userId);

export function updateDemoStep(userId: string, step: number) {
  const session = activeSession(userId);
  if (!session) return null;
  session.step = Math.max(0, Math.min(6, step));
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  return session;
}

export async function recordDemoFeedback(userId: string, taskId: string, feedbackType: FeedbackType) {
  const session = activeSession(userId);
  if (!session) return null;
  const task = session.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  if (!session.feedbackTaskIds.includes(taskId)) session.feedbackTaskIds.push(taskId);
  if (feedbackType === "about_right") await populate(session, session.stage);
  return { id: `demo:${session.id}:feedback:${task.externalId}`, taskId, feedbackType, demoOnly: true };
}

export async function syncDemoSession(userId: string) {
  const session = activeSession(userId);
  if (!session) return null;
  if (session.stage >= 4) return session;
  const before = new Map(session.tasks.map((task) => [task.externalId, task]));
  const nextStage = session.stage + 1;
  await populate(session, nextStage);
  const event = nextStage === 2
    ? (() => { const task = session.tasks.find((item) => item.externalId === "cse-project-02"); return task && { id: `demo:${session.id}:event:cse-project-created`, eventType: "created" as const, createdAt: new Date().toISOString(), newValue: { title: task.title, recommendedStartAt: task.recommendations[0]!.recommendedStartAt }, task: { id: task.id, title: task.title, course: { code: task.course.code } } }; })()
    : nextStage === 3
      ? (() => { const oldTask = before.get("math-quiz-02"); const task = session.tasks.find((item) => item.externalId === "math-quiz-02"); return oldTask && task && { id: `demo:${session.id}:event:math-quiz-due`, eventType: "due_date_changed" as const, createdAt: new Date().toISOString(), previousValue: { dueAt: oldTask.dueAt }, newValue: { dueAt: task.dueAt, recommendedStartAt: task.recommendations[0]!.recommendedStartAt }, task: { id: task.id, title: task.title, course: { code: task.course.code } } }; })()
      : (() => { const oldTask = before.get("english-essay-draft"); const task = session.tasks.find((item) => item.externalId === "english-essay-draft"); return oldTask && task && { id: `demo:${session.id}:event:english-points`, eventType: "points_changed" as const, createdAt: new Date().toISOString(), previousValue: { pointsPossible: oldTask.pointsPossible }, newValue: { pointsPossible: task.pointsPossible, recommendedStartAt: task.recommendations[0]!.recommendedStartAt }, task: { id: task.id, title: task.title, course: { code: task.course.code } } }; })();
  if (event && !session.events.some((item) => item.id === event.id)) session.events = [event, ...session.events];
  session.changedTaskId = event?.task.id ?? null;
  return session;
}

export function endDemoSession(userId: string) {
  const existed = sessions.delete(userId);
  return { removed: existed, demoOnly: true };
}

export const demoTaskDetail = (userId: string, taskId: string) => {
  const session = activeSession(userId);
  const task = session?.tasks.find((item) => item.id === taskId);
  if (!session || !task) return null;
  return {
    ...task,
    events: session.events.filter((event) => event.task.id === task.id),
    notifications: session.notifications.filter((notification) => notification.task.id === task.id),
  };
};

export function clearDemoSessionsForTests() { sessions.clear(); }

export type PublicDemoSession = Omit<DemoSession, "userId">;
export const publicDemoSession = ({ userId: _userId, ...session }: DemoSession): PublicDemoSession => session;

export async function startAnonymousDemoSession(existingSessionId?: string) {
  pruneExpiredSessions();
  enforceAnonymousSessionLimit();
  const sessionId = existingSessionId ?? randomUUID();
  const session = await startDemoSession(anonymousScope(sessionId));
  return { sessionId, session: publicDemoSession(session) };
}

export const getAnonymousDemoSession = (sessionId: string) => {
  const session = getDemoSession(anonymousScope(sessionId));
  return session ? publicDemoSession(session) : null;
};

export const updateAnonymousDemoStep = (sessionId: string, step: number) => {
  const session = updateDemoStep(anonymousScope(sessionId), step);
  return session ? publicDemoSession(session) : null;
};

export async function recordAnonymousDemoFeedback(sessionId: string, taskId: string, feedbackType: FeedbackType) {
  const feedback = await recordDemoFeedback(anonymousScope(sessionId), taskId, feedbackType);
  const session = getAnonymousDemoSession(sessionId);
  return feedback && session ? { feedback, session } : null;
}

export async function syncAnonymousDemoSession(sessionId: string) {
  const session = await syncDemoSession(anonymousScope(sessionId));
  return session ? publicDemoSession(session) : null;
}

export const anonymousDemoTaskDetail = (sessionId: string, taskId: string) => demoTaskDetail(anonymousScope(sessionId), taskId);
export const endAnonymousDemoSession = (sessionId: string) => endDemoSession(anonymousScope(sessionId));

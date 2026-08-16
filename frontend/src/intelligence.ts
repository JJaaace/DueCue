export type IntelligenceTask = {
  id: string;
  title: string;
  type: string;
  dueAt: string;
  status: string;
  estimatedMinutes: number | null;
  course?: { code?: string; currentGradePercent: number | null; targetGradePercent: number | null; courseImportance: "normal" | "important" | "critical" };
  recommendations: Array<{ recommendedStartAt: string; priorityScore: number }>;
};

export type Risk = { label: "Low" | "Watch" | "Start today" | "At risk" | "Overdue"; score: number; reason: string };
const DAY = 86_400_000;
const hoursUntil = (value: string, now: Date) => (new Date(value).getTime() - now.getTime()) / 3_600_000;
const dayKey = (value: string) => new Date(value).toDateString();

export function calculateTaskRisk(task: IntelligenceTask, allTasks: IntelligenceTask[] = [], changedTitles: string[] = [], now = new Date()): Risk {
  const dueHours = hoursUntil(task.dueAt, now);
  const startHours = task.recommendations[0] ? hoursUntil(task.recommendations[0].recommendedStartAt, now) : Infinity;
  const cue = task.recommendations[0]?.priorityScore ?? 35;
  const sameDay = allTasks.filter((item) => item.status !== "done" && dayKey(item.dueAt) === dayKey(task.dueAt)).length;
  let score = cue * 0.28 + Math.max(0, 30 - dueHours / 6);
  if (startHours <= 0) score += 20;
  if (task.estimatedMinutes && task.estimatedMinutes >= 120) score += 7;
  if (["exam", "test", "project"].includes(task.type)) score += 7;
  if (sameDay >= 3) score += 7;
  if (changedTitles.includes(task.title)) score += 8;
  const gap = task.course?.targetGradePercent != null && task.course?.currentGradePercent != null ? task.course.targetGradePercent - task.course.currentGradePercent : 0;
  if (gap > 0) score += Math.min(10, gap > 10 ? 10 : gap > 5 ? 6 : 3);
  if (task.course?.courseImportance === "critical") score += 6;
  if (dueHours < 0) return { label: "Overdue", score: 100, reason: "Past its due date—open it now and decide the next step." };
  if (dueHours <= 24 && startHours <= 0) return { label: "At risk", score: Math.round(score), reason: "Due soon and already inside its recommended start window." };
  if (startHours <= 0 || score >= 48) return { label: "Start today", score: Math.round(score), reason: gap > 0 ? "Its start window is open and this course is below your target grade." : "Its start window is open, so progress today protects the rest of your week." };
  if (dueHours <= 72 || score >= 35) return { label: "Watch", score: Math.round(score), reason: "Coming up soon—starting a small piece now keeps it manageable." };
  return { label: "Low", score: Math.round(score), reason: "No immediate timing risk right now." };
}

export function buildTodayPlan<T extends IntelligenceTask>(tasks: T[], changedTitles: string[] = [], now = new Date()) {
  return tasks.filter((task) => task.status !== "done").map((task) => {
    const risk = calculateTaskRisk(task, tasks, changedTitles, now);
    const dueHours = hoursUntil(task.dueAt, now);
    const rec = task.recommendations[0];
    const startOpen = !!rec && hoursUntil(rec.recommendedStartAt, now) <= 0;
    const typeBoost = ["exam", "test", "project"].includes(task.type) ? 8 : task.type === "lab" ? 4 : 0;
    const rankScore = risk.score + (startOpen ? 15 : 0) + typeBoost + (dueHours <= 48 ? 12 : 0);
    const reason = dueHours <= 24 ? "Due within a day—make progress before it becomes a pileup." : startOpen ? "Inside your start window and ready for meaningful progress." : risk.reason;
    return { task, risk, rankScore, reason };
  }).sort((a, b) => b.rankScore - a.rankScore || +new Date(a.task.dueAt) - +new Date(b.task.dueAt));
}

export function detectWorkloadRadar<T extends IntelligenceTask>(tasks: T[], changedTitles: string[] = [], now = new Date()) {
  const active = tasks.filter((task) => task.status !== "done");
  const dueGroups = Object.values(active.reduce<Record<string, T[]>>((groups, task) => { (groups[dayKey(task.dueAt)] ??= []).push(task); return groups; }, {}));
  const maxDue = dueGroups.sort((a, b) => b.length - a.length)[0] ?? [];
  const startGroups = Object.values(active.filter((task) => task.recommendations[0]).reduce<Record<string, T[]>>((groups, task) => { (groups[dayKey(task.recommendations[0].recommendedStartAt)] ??= []).push(task); return groups; }, {}));
  const maxStart = startGroups.sort((a, b) => b.length - a.length)[0] ?? [];
  const urgent = active.filter((task) => hoursUntil(task.dueAt, now) <= 48 && calculateTaskRisk(task, active, changedTitles, now).label !== "Low");
  const majorClose = active.filter((task) => hoursUntil(task.dueAt, now) <= 48 && ["exam", "test", "project"].includes(task.type));
  const level = maxDue.length >= 4 || urgent.length >= 3 ? "Overloaded" : maxDue.length >= 3 || majorClose.length >= 2 ? "Heavy" : maxDue.length >= 2 || maxStart.length >= 2 || urgent.length > 0 ? "Watch" : "Calm";
  const top = buildTodayPlan(active, changedTitles, now)[0];
  const dueDate = maxDue[0] ? new Date(maxDue[0].dueAt).toLocaleDateString(undefined, { weekday: "long" }) : "later this week";
  const message = level === "Calm" ? "This week looks manageable. DueCue is watching for changes." : majorClose.length >= 2 ? `You have a ${majorClose[0].type} and ${majorClose[1].type} due within 48 hours.` : maxDue.length >= 2 ? `${dueDate} needs attention: ${maxDue.length} tasks are due that day.` : `${maxStart.length} start windows open on the same day.`;
  return { level, message, action: top ? `Start ${top.task.title} today to protect the rest of your week.` : "No high-priority work right now. DueCue will keep watching." };
}

export function recommendForAvailableTime<T extends IntelligenceTask>(tasks: T[], minutes: number, changedTitles: string[] = [], now = new Date()) {
  const plan = buildTodayPlan(tasks, changedTitles, now);
  const fitting = plan.filter(({ task }) => !task.estimatedMinutes || task.estimatedMinutes <= minutes * 1.25);
  return (fitting.length ? fitting : plan).slice(0, 3).map((entry) => ({ ...entry, fit: entry.task.estimatedMinutes && entry.task.estimatedMinutes <= minutes ? "Fits your time" : `Best use of ${minutes} minutes` }));
}

const DEFAULT_EFFORT_BY_TYPE: Record<string, number> = {
  reading: 25,
  discussion: 30,
  quiz: 40,
  assignment: 60,
  lab: 75,
  exam: 90,
  test: 90,
  project: 120,
  other: 45,
};

export function buildAvailableTimePlan<T extends IntelligenceTask>(tasks: T[], availableMinutes: number, changedTitles: string[] = [], now = new Date()) {
  const minutes = Math.max(10, Math.min(480, Math.round(availableMinutes)));
  const ranked = buildTodayPlan(tasks, changedTitles, now).slice(0, 12).map((entry) => ({
    ...entry,
    effortMinutes: Math.max(10, entry.task.estimatedMinutes ?? DEFAULT_EFFORT_BY_TYPE[entry.task.type] ?? DEFAULT_EFFORT_BY_TYPE.other),
    usesEstimatedEffort: entry.task.estimatedMinutes == null,
  }));
  const selected: Array<typeof ranked[number] & { plannedMinutes: number; completesTask: boolean }> = [];
  const selectedIds = new Set<string>();
  let remainingMinutes = minutes;

  const urgentTopTask = ranked[0];
  if (urgentTopTask && ["Overdue", "At risk"].includes(urgentTopTask.risk.label) && urgentTopTask.effortMinutes > remainingMinutes) {
    selected.push({ ...urgentTopTask, plannedMinutes: remainingMinutes, completesTask: false });
    selectedIds.add(urgentTopTask.task.id);
    remainingMinutes = 0;
  }

  while (selected.length < 4) {
    const next = ranked.find((entry) => !selectedIds.has(entry.task.id) && entry.effortMinutes <= remainingMinutes);
    if (!next) break;
    selected.push({ ...next, plannedMinutes: next.effortMinutes, completesTask: true });
    selectedIds.add(next.task.id);
    remainingMinutes -= next.effortMinutes;
  }

  if (remainingMinutes >= 10 && selected.length < 4) {
    const next = ranked.find((entry) => !selectedIds.has(entry.task.id));
    if (next) {
      selected.push({ ...next, plannedMinutes: remainingMinutes, completesTask: false });
      remainingMinutes = 0;
    }
  }

  return {
    availableMinutes: minutes,
    plannedMinutes: minutes - remainingMinutes,
    bufferMinutes: remainingMinutes,
    items: selected,
  };
}

export function buildWeeklyGamePlan<T extends IntelligenceTask>(tasks: T[], changedTitles: string[] = [], learningLabel?: string, now = new Date()) {
  const plan = buildTodayPlan(tasks, changedTitles, now); const radar = detectWorkloadRadar(tasks, changedTitles, now);
  const items: Array<{ kind: "task" | "note"; title: string; detail: string; task?: T }> = [];
  if (plan[0]) items.push({ kind: "task", title: `Start ${plan[0].task.title}`, detail: plan[0].reason, task: plan[0].task });
  if (radar.level !== "Calm") items.push({ kind: "note", title: "Workload watch", detail: radar.message });
  const major = plan.find(({ task }) => ["exam", "project"].includes(task.type));
  if (major) items.push({ kind: "task", title: `${major.task.type === "exam" ? "Prepare for" : "Move forward on"} ${major.task.title}`, detail: `A ${major.task.type} is coming soon—give it a protected block this week.`, task: major.task });
  const changed = changedTitles[0];
  if (changed) items.push({ kind: "note", title: "Recent change matters", detail: `${changed} changed in the latest sync, so DueCue refreshed its timing.` });
  const gradeTask = plan.find(({ task }) => task.course && task.course.currentGradePercent != null && task.course.targetGradePercent != null && task.course.currentGradePercent < task.course.targetGradePercent);
  if (gradeTask) items.push({ kind: "task", title: `${gradeTask.task.course!.code} needs attention`, detail: `This course is below your target, so similar work gets a little more attention this week.`, task: gradeTask.task });
  if (learningLabel) items.push({ kind: "note", title: "Learning signal", detail: `${learningLabel} is shaping future cue timing.` });
  return items.slice(0, 6);
}

export function findBatchSuggestions<T extends IntelligenceTask>(tasks: T[], now = new Date()) {
  const active = tasks.filter((task) => task.status !== "done" && hoursUntil(task.dueAt, now) > -24);
  const suggestions: Array<{ title: string; reason: string; tasks: T[]; minutes: number }> = [];
  const quick = active.filter((task) => (task.estimatedMinutes ?? 60) <= 30).slice(0, 3);
  if (quick.length >= 2) suggestions.push({ title: "Quick wins", reason: `${quick.length} short tasks can fit into one focused block.`, tasks: quick, minutes: quick.reduce((sum, task) => sum + (task.estimatedMinutes ?? 30), 0) });
  const sameCourse = Object.values(active.reduce<Record<string, T[]>>((groups, task) => { const code = task.course?.code ?? "course"; (groups[code] ??= []).push(task); return groups; }, {})).find((group) => group.length >= 2 && group.some((task) => !["exam", "project"].includes(task.type)));
  if (sameCourse) suggestions.push({ title: `Knock out ${sameCourse[0].course?.code ?? "coursework"} together`, reason: "These tasks share a course, so setup and context carry over.", tasks: sameCourse.slice(0, 3), minutes: sameCourse.slice(0, 3).reduce((sum, task) => sum + (task.estimatedMinutes ?? 60), 0) });
  const sameDay = Object.values(active.reduce<Record<string, T[]>>((groups, task) => { (groups[dayKey(task.dueAt)] ??= []).push(task); return groups; }, {})).find((group) => group.length >= 2);
  if (sameDay) suggestions.push({ title: "Same-day deadlines", reason: "These tasks share a due day—starting the shorter one first reduces that pileup.", tasks: sameDay.slice(0, 3), minutes: sameDay.slice(0, 3).reduce((sum, task) => sum + (task.estimatedMinutes ?? 60), 0) });
  return suggestions.filter((suggestion, index, all) => all.findIndex((item) => item.tasks.map((task) => task.id).join() === suggestion.tasks.map((task) => task.id).join()) === index).slice(0, 3);
}

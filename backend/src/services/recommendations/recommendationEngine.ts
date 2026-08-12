import type { ReminderStyle, TaskType } from "@prisma/client";

export type RecommendationInput = {
  type: TaskType;
  dueAt: Date;
  pointsPossible: number | null;
  estimatedMinutes: number | null;
  taskDifficulty: "low" | "medium" | "high";
  courseDifficulty: "easy" | "normal" | "hard";
  reminderStyle: ReminderStyle;
  adjustmentDays?: number;
  sampleSize?: number;
  dueDateChanged?: boolean;
  now?: Date;
};

const BASE_LEAD_DAYS: Record<TaskType, number> = { reading: 1, discussion: 1, assignment: 2, lab: 2, quiz: 3, project: 5, exam: 7, other: 2 };
const TYPE_WEIGHT: Record<TaskType, number> = { reading: 5, discussion: 8, assignment: 18, lab: 20, quiz: 28, project: 42, exam: 48, other: 15 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function calculateRecommendation(input: RecommendationInput) {
  const now = input.now ?? new Date();
  const factors: string[] = [`${input.type} base window: ${BASE_LEAD_DAYS[input.type]} days`];
  let leadTimeDays = BASE_LEAD_DAYS[input.type];
  if (input.reminderStyle === "conservative") { leadTimeDays += 1.5; factors.push("conservative reminder style: +1.5 days"); }
  if (input.reminderStyle === "aggressive") { leadTimeDays -= 1; factors.push("aggressive reminder style: -1 day"); }
  if ((input.pointsPossible ?? 0) >= 100) { leadTimeDays += 1; factors.push("high-point task: +1 day"); }
  if (input.taskDifficulty === "high") { leadTimeDays += 1; factors.push("high task difficulty: +1 day"); }
  if (input.courseDifficulty === "hard") { leadTimeDays += 0.75; factors.push("hard course: +0.75 day"); }
  if (input.taskDifficulty === "low" && input.courseDifficulty === "easy") { leadTimeDays -= 0.5; factors.push("low-complexity task: -0.5 day"); }
  if (input.adjustmentDays) { leadTimeDays += input.adjustmentDays; factors.push(`feedback adjustment: ${input.adjustmentDays > 0 ? "+" : ""}${input.adjustmentDays} days`); }
  leadTimeDays = Math.round(clamp(leadTimeDays, 0.5, 14) * 4) / 4;

  const recommendedStartAt = new Date(input.dueAt.getTime() - leadTimeDays * 86_400_000);
  const hoursUntilDue = (input.dueAt.getTime() - now.getTime()) / 3_600_000;
  const urgency = clamp(100 - Math.max(0, hoursUntilDue), 0, 100);
  const pointsWeight = clamp((input.pointsPossible ?? 0) / 2, 0, 35);
  const difficultyWeight = input.taskDifficulty === "high" ? 15 : input.taskDifficulty === "medium" ? 8 : 2;
  const changedWeight = input.dueDateChanged ? 12 : 0;
  const effortWeight = clamp((input.estimatedMinutes ?? 60) / 30, 0, 12);
  const priorityScore = Math.round(clamp(urgency * 0.55 + (pointsWeight + TYPE_WEIGHT[input.type] + difficultyWeight + changedWeight + effortWeight) * 0.45, 0, 100));
  const sampleSize = input.sampleSize ?? 0;
  const confidenceScore = Math.round(Math.min(0.95, 0.35 + sampleSize * 0.08) * 100) / 100;
  const insideWindow = recommendedStartAt <= now;
  const explanation = input.dueDateChanged && insideWindow
    ? `Start today: this deadline changed and is now inside your ${leadTimeDays}-day start window.`
    : insideWindow
      ? `Start today: this ${input.type} is already inside your recommended ${leadTimeDays}-day start window.`
      : `Start ${leadTimeDays} days before the deadline because this is a${input.pointsPossible ? ` ${input.pointsPossible}-point` : ""} ${input.type}${input.taskDifficulty === "high" ? " with high difficulty" : ""}.${sampleSize ? " Your feedback is shaping this window." : " DueCue is using your default timing while it learns."}`;
  return { recommendedStartAt, leadTimeDays, priorityScore, confidenceScore, explanation, factors, shouldStartNow: insideWindow && input.dueAt > now, isOverdue: input.dueAt <= now };
}


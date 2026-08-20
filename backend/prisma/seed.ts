import { prisma } from "../src/lib/prisma.js";
import { runSync } from "../src/services/sync/syncEngine.js";
import { recalculateUserRecommendations } from "../src/services/recommendations/recommendationService.js";

const DEMO_EMAIL = "demo@duecue.local";
const demoClerkUserId = process.env.RECRUITER_DEMO_CLERK_USER_ID;

async function main() {
  // This only resets the named local demo account, never arbitrary application users.
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) await prisma.user.delete({ where: { id: existing.id } });

  const user = await prisma.user.create({
    data: {
      authProviderId: demoClerkUserId ?? "dev_demo_jace", email: DEMO_EMAIL, name: "Jace (Demo)", schoolName: "Demo University", timezone: "America/New_York",
      settings: { create: { defaultReminderHour: 9, reminderStyle: "balanced", defaultChannel: "in_app", weekendRemindersEnabled: true, digestEnabled: true, onboardingCompleted: true } },
      connections: { create: { provider: "mock_canvas", displayName: "Simulated Canvas / Carmen", status: "demo", config: { mockStage: 1, demo: true } } },
      reminderRecipients: { create: { email: DEMO_EMAIL, label: "Jace (Demo)", relationship: "self", demoVerified: true, enabled: true, startWindowEnabled: true, dueSoonEnabled: true, deadlineChangedEnabled: true, weeklyDigestEnabled: true } },
    },
    include: { connections: true },
  });
  const run = await runSync(user.id, user.connections[0]!.id);
  await Promise.all([
    prisma.course.updateMany({ where: { userId: user.id, code: "MATH 1151" }, data: { currentGradePercent: 70, targetGradePercent: 85, gradeGoalLabel: "raise_grade", courseImportance: "important", gradeDataSource: "manual" } }),
    prisma.course.updateMany({ where: { userId: user.id, code: "ENGLISH 1110" }, data: { currentGradePercent: 95, targetGradePercent: 90, gradeGoalLabel: "maintain_a", courseImportance: "normal", gradeDataSource: "manual" } }),
  ]);
  await recalculateUserRecommendations(user.id);
  console.log(`Seeded ${DEMO_EMAIL}: ${run.coursesFound} courses and ${run.tasksFound} tasks (sync ${run.id}).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

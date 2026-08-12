import { prisma } from "../src/lib/prisma.js";
import { runSync } from "../src/services/sync/syncEngine.js";

const DEMO_EMAIL = "demo@duecue.local";

async function main() {
  // This only resets the named local demo account, never arbitrary application users.
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) await prisma.user.delete({ where: { id: existing.id } });

  const user = await prisma.user.create({
    data: {
      authProviderId: "dev_demo_jace", email: DEMO_EMAIL, name: "Jace (Demo)", schoolName: "Demo University", timezone: "America/New_York",
      settings: { create: { defaultReminderHour: 9, reminderStyle: "balanced", defaultChannel: "in_app", weekendRemindersEnabled: true, digestEnabled: true, onboardingCompleted: true } },
      connections: { create: { provider: "mock_canvas", displayName: "Simulated Canvas / Carmen", status: "demo", config: { mockStage: 1, demo: true } } },
    },
    include: { connections: true },
  });
  const run = await runSync(user.id, user.connections[0]!.id);
  console.log(`Seeded ${DEMO_EMAIL}: ${run.coursesFound} courses and ${run.tasksFound} tasks (sync ${run.id}).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());


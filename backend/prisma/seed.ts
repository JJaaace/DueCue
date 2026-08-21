import { prisma } from "../src/lib/prisma.js";

const DEMO_EMAIL = "demo@duecue.local";
const demoClerkUserId = process.env.RECRUITER_DEMO_CLERK_USER_ID;

async function main() {
  // This only resets the named local demo account, never arbitrary application users.
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) await prisma.user.delete({ where: { id: existing.id } });

  const user = await prisma.user.create({
    data: {
      authProviderId: demoClerkUserId ?? "dev_demo_jace", email: DEMO_EMAIL, name: "Jace (Demo)", schoolName: "Demo University", timezone: "America/New_York",
      settings: { create: { defaultReminderHour: 9, reminderStyle: "balanced", defaultChannel: "in_app", weekendRemindersEnabled: true, digestEnabled: true, onboardingCompleted: false } },
    },
    include: { connections: true },
  });
  console.log(`Seeded clean local workspace for ${user.email}. The interactive demo now uses an isolated temporary session.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

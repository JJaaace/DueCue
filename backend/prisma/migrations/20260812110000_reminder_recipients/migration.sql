CREATE TYPE "RecipientRelationship" AS ENUM ('self', 'parent_guardian', 'other');

CREATE TABLE "ReminderRecipient" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "relationship" "RecipientRelationship" NOT NULL DEFAULT 'self',
  "verifiedAt" TIMESTAMP(3),
  "demoVerified" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "startWindowEnabled" BOOLEAN NOT NULL DEFAULT true,
  "dueSoonEnabled" BOOLEAN NOT NULL DEFAULT true,
  "deadlineChangedEnabled" BOOLEAN NOT NULL DEFAULT true,
  "weeklyDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReminderRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReminderRecipient_userId_email_key" ON "ReminderRecipient"("userId", "email");
CREATE INDEX "ReminderRecipient_userId_enabled_idx" ON "ReminderRecipient"("userId", "enabled");
ALTER TABLE "Notification" ADD COLUMN "recipientId" TEXT;
CREATE INDEX "Notification_recipientId_status_idx" ON "Notification"("recipientId", "status");
ALTER TABLE "ReminderRecipient" ADD CONSTRAINT "ReminderRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "ReminderRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

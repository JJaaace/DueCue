CREATE TABLE "EmailFeedbackToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "recipientId" TEXT,
  "feedbackType" "FeedbackType" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailFeedbackToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailFeedbackToken_tokenHash_key" ON "EmailFeedbackToken"("tokenHash");
CREATE INDEX "EmailFeedbackToken_userId_expiresAt_idx" ON "EmailFeedbackToken"("userId", "expiresAt");
ALTER TABLE "EmailFeedbackToken" ADD CONSTRAINT "EmailFeedbackToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailFeedbackToken" ADD CONSTRAINT "EmailFeedbackToken_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AcademicTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailFeedbackToken" ADD CONSTRAINT "EmailFeedbackToken_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailFeedbackToken" ADD CONSTRAINT "EmailFeedbackToken_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailFeedbackToken" ADD CONSTRAINT "EmailFeedbackToken_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "ReminderRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

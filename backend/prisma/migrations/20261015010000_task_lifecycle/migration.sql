ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'dismissed';
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'dismissed';
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'restored';

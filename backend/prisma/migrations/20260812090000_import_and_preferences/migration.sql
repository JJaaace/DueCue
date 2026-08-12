ALTER TYPE "ProviderKind" ADD VALUE IF NOT EXISTS 'manual_import';
ALTER TYPE "ProviderKind" ADD VALUE IF NOT EXISTS 'ical_feed';
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "emailEnabled" BOOLEAN NOT NULL DEFAULT false;

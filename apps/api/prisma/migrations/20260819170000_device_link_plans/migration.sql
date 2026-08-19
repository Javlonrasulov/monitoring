-- AlterEnum
DO $$ BEGIN
  CREATE TYPE "SubscriptionPlan" AS ENUM ('TRIAL', 'PRO', 'PRO_PLUS');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "plan" "SubscriptionPlan" NOT NULL DEFAULT 'TRIAL';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "linkedFromDeviceId" TEXT;

-- AlterTable
ALTER TABLE "DevicePairingCode" ADD COLUMN IF NOT EXISTS "issuerDeviceId" TEXT;
ALTER TABLE "DevicePairingCode" ADD COLUMN IF NOT EXISTS "issuerUserId" TEXT;

CREATE INDEX IF NOT EXISTS "DevicePairingCode_issuerDeviceId_idx" ON "DevicePairingCode"("issuerDeviceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Device_linkedFromDeviceId_fkey'
  ) THEN
    ALTER TABLE "Device"
      ADD CONSTRAINT "Device_linkedFromDeviceId_fkey"
      FOREIGN KEY ("linkedFromDeviceId") REFERENCES "Device"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

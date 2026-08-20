-- Persist free-trial usage per physical phone (install id).
-- Claim rows are intentionally NOT tied to Organization cascade so deleting
-- an account cannot reset the 24h demo on the same phone.
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "installId" TEXT;
CREATE INDEX IF NOT EXISTS "Device_installId_idx" ON "Device"("installId");

CREATE TABLE IF NOT EXISTS "TrialDeviceClaim" (
    "installId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrialDeviceClaim_pkey" PRIMARY KEY ("installId")
);

CREATE INDEX IF NOT EXISTS "TrialDeviceClaim_organizationId_idx" ON "TrialDeviceClaim"("organizationId");
CREATE INDEX IF NOT EXISTS "TrialDeviceClaim_expiresAt_idx" ON "TrialDeviceClaim"("expiresAt");

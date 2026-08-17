-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('RECORDING', 'PROCESSING', 'READY', 'FAILED', 'DELETED');
CREATE TYPE "CameraFacing" AS ENUM ('FRONT', 'BACK');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "recordingRetentionDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Organization" ADD COLUMN "recordingAutoCleanup" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "recordingSegmentSeconds" INTEGER NOT NULL DEFAULT 300;

-- CreateTable
CREATE TABLE "RecordingSegment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "cameraFacing" "CameraFacing" NOT NULL DEFAULT 'BACK',
    "quality" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" "RecordingStatus" NOT NULL DEFAULT 'RECORDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "storagePath" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordingSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecordingSegment_organizationId_startedAt_idx" ON "RecordingSegment"("organizationId", "startedAt");
CREATE INDEX "RecordingSegment_deviceId_startedAt_idx" ON "RecordingSegment"("deviceId", "startedAt");
CREATE INDEX "RecordingSegment_organizationId_cameraFacing_startedAt_idx" ON "RecordingSegment"("organizationId", "cameraFacing", "startedAt");
CREATE INDEX "RecordingSegment_organizationId_status_idx" ON "RecordingSegment"("organizationId", "status");
CREATE INDEX "RecordingSegment_status_startedAt_idx" ON "RecordingSegment"("status", "startedAt");

ALTER TABLE "RecordingSegment" ADD CONSTRAINT "RecordingSegment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordingSegment" ADD CONSTRAINT "RecordingSegment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

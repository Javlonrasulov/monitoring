-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'USER';

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING');
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'FILE', 'VOICE');
CREATE TYPE "DeviceAccountKind" AS ENUM ('OWNER', 'USER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_deviceId_key" ON "User"("deviceId");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "accountKind" "DeviceAccountKind" NOT NULL DEFAULT 'USER';

ALTER TABLE "User" ADD CONSTRAINT "User_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "maxDevices" INTEGER NOT NULL DEFAULT 2,
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Subscription_organizationId_idx" ON "Subscription"("organizationId");
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ChatThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "peerUserId" TEXT NOT NULL,
    "deviceId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatThread_organizationId_ownerUserId_peerUserId_key" ON "ChatThread"("organizationId", "ownerUserId", "peerUserId");
CREATE INDEX IF NOT EXISTS "ChatThread_organizationId_idx" ON "ChatThread"("organizationId");
CREATE INDEX IF NOT EXISTS "ChatThread_deviceId_idx" ON "ChatThread"("deviceId");

ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_peerUserId_fkey" FOREIGN KEY ("peerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT,
    "receiverUserId" TEXT,
    "messageType" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "text" TEXT,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

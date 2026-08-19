-- AlterEnum
ALTER TYPE "ChatMessageType" ADD VALUE IF NOT EXISTS 'VIDEO_NOTE';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedForEveryone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "replyToId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "forwardedFromId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "albumId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "thumbnailKey" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "waveformJson" TEXT;

CREATE INDEX IF NOT EXISTS "ChatMessage_threadId_messageType_idx" ON "ChatMessage"("threadId", "messageType");
CREATE INDEX IF NOT EXISTS "ChatMessage_clientId_idx" ON "ChatMessage"("clientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_replyToId_fkey') THEN
    ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_forwardedFromId_fkey') THEN
    ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_forwardedFromId_fkey" FOREIGN KEY ("forwardedFromId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ChatReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatReaction_messageId_userId_key" ON "ChatReaction"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "ChatReaction_messageId_idx" ON "ChatReaction"("messageId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatReaction_messageId_fkey') THEN
    ALTER TABLE "ChatReaction" ADD CONSTRAINT "ChatReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ChatMessageHide" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessageHide_pkey" PRIMARY KEY ("messageId","userId")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessageHide_messageId_fkey') THEN
    ALTER TABLE "ChatMessageHide" ADD CONSTRAINT "ChatMessageHide_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

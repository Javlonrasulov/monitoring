-- CreateEnum
CREATE TYPE "ChatThreadKind" AS ENUM ('PEER', 'SUPPORT');

-- AlterTable
ALTER TABLE "ChatThread" ADD COLUMN "kind" "ChatThreadKind" NOT NULL DEFAULT 'PEER';

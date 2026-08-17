#!/bin/bash
set -euo pipefail
docker exec monitor_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "recordingRetentionDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "recordingAutoCleanup" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "recordingSegmentSeconds" INTEGER NOT NULL DEFAULT 300;
SQL
echo "organization recording columns ok"

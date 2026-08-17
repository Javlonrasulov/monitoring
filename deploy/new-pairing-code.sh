#!/usr/bin/env bash
# Prints a fresh pairing code for the device app.
set -eu
cd "$(dirname "$0")"
BASE=http://localhost:8080
EMAIL=$(grep '^SEED_ADMIN_EMAIL=' .env.production | cut -d= -f2-)
PW=$(grep '^SEED_ADMIN_PASSWORD=' .env.production | cut -d= -f2-)
json_value() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }

ADMIN=$(curl -s -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" | json_value accessToken)
BRANCH=$(curl -s "$BASE/api/v1/organizations/me/branches" -H "Authorization: Bearer $ADMIN" | json_value id)
curl -s -X POST "$BASE/api/v1/devices/pairing-codes" -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d "{\"branchId\":\"$BRANCH\"}" | json_value code

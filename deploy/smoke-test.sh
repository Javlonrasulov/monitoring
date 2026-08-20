#!/usr/bin/env bash
# Post-deploy smoke test: run on the server from /opt/monitor/deploy
set -u
cd "$(dirname "$0")"

BASE=http://localhost:8080
PW=$(grep '^SEED_ADMIN_PASSWORD=' .env.production | cut -d= -f2-)
EMAIL=$(grep '^SEED_ADMIN_EMAIL=' .env.production | cut -d= -f2-)

echo "--- health ---"
curl -s -w ' [%{http_code}]\n' "$BASE/api/v1/health"

echo "--- admin page ---"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/"

echo "--- user web (Host: app.levelapp.site) ---"
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: app.levelapp.site' "$BASE/"

echo "--- login ---"
TOKEN=$(curl -s -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

if [ -n "$TOKEN" ]; then
  echo "login OK, token length ${#TOKEN}"
  echo "--- devices (authorized) ---"
  curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/devices"
else
  echo "login FAILED:"
  curl -s -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}"
  echo
fi

echo "--- mediamtx via nginx (expect 401/403 without token) ---"
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/device/test/whep" \
  -H 'Content-Type: application/sdp' --data 'v=0'

echo "--- neighbour project untouched ---"
docker ps --format '{{.Names}}: {{.Status}}' | grep '^crm_'

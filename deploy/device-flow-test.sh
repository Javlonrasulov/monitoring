#!/usr/bin/env bash
# End-to-end check of the exact calls the Android app makes:
# admin login -> pairing code -> device pair -> publisher token -> MediaMTX WHIP auth.
# Run on the server from /opt/monitor/deploy.
set -u
cd "$(dirname "$0")"

BASE=http://localhost:8080
EMAIL=$(grep '^SEED_ADMIN_EMAIL=' .env.production | cut -d= -f2-)
PW=$(grep '^SEED_ADMIN_PASSWORD=' .env.production | cut -d= -f2-)

json_value() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }

echo "1. admin login"
ADMIN=$(curl -s -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" | json_value accessToken)
[ -n "$ADMIN" ] || { echo "   FAILED"; exit 1; }
echo "   ok"

echo "2. create pairing code"
BRANCH=$(curl -s "$BASE/api/v1/organizations/me/branches" -H "Authorization: Bearer $ADMIN" | json_value id)
[ -n "$BRANCH" ] || { echo "   FAILED: no branch"; exit 1; }
CODE_JSON=$(curl -s -X POST "$BASE/api/v1/devices/pairing-codes" \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d "{\"branchId\":\"$BRANCH\"}")
CODE=$(echo "$CODE_JSON" | json_value code)
[ -n "$CODE" ] || { echo "   FAILED: $CODE_JSON"; exit 1; }
echo "   code=$CODE"

echo "3. device pair (as the app does)"
PAIR=$(curl -s -X POST "$BASE/api/v1/devices/pair" -H 'Content-Type: application/json' \
  -d "{\"code\":\"$CODE\",\"name\":\"E2E test device\",\"appVersion\":\"1.0.0\",\"androidVersion\":\"14\",\"deviceModel\":\"curl\"}")
DEVICE_TOKEN=$(echo "$PAIR" | json_value deviceToken)
DEVICE_ID=$(echo "$PAIR" | json_value deviceId)
[ -n "$DEVICE_TOKEN" ] || { echo "   FAILED: $PAIR"; exit 1; }
echo "   deviceId=$DEVICE_ID"

echo "4. heartbeat / status update"
curl -s -o /dev/null -w '   HTTP %{http_code}\n' -X PATCH "$BASE/api/v1/devices/me/status" \
  -H "Authorization: Bearer $DEVICE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"ONLINE","batteryPercent":80,"charging":true,"networkType":"WIFI","networkQuality":4}'

echo "5. publisher token"
PUB=$(curl -s -X POST "$BASE/api/v1/streaming/publisher-token" -H "Authorization: Bearer $DEVICE_TOKEN")
STREAM_TOKEN=$(echo "$PUB" | json_value token)
WHIP_URL=$(echo "$PUB" | json_value whipUrl)
[ -n "$STREAM_TOKEN" ] || { echo "   FAILED: $PUB"; exit 1; }
echo "   whipUrl=$WHIP_URL"

echo "6. MediaMTX accepts the token (WHIP publish authorization)"
WHIP_LOCAL=$(echo "$WHIP_URL" | sed 's#^http://[^/]*#http://localhost:8080#')
# MediaMTX forwards only basic credentials to the auth webhook, like the clients do.
BASIC=$(printf 'monitor:%s' "$STREAM_TOKEN" | base64 -w0)
# Compare the exact number of rejection lines before/after this request. A
# timestamp only has second precision and can include smoke-test traffic from
# the same second, producing a false failure.
AUTH_FAILURES_BEFORE=$(docker logs monitor_mediamtx 2>&1 | grep -c 'authentication failed' || true)
curl -s -o /tmp/whip-out.txt -w '   HTTP %{http_code}\n' -X POST "$WHIP_LOCAL" \
  -H "Authorization: Basic $BASIC" -H 'Content-Type: application/sdp' --data 'v=0'
sleep 1
AUTH_FAILURES_AFTER=$(docker logs monitor_mediamtx 2>&1 | grep -c 'authentication failed' || true)
if [ "$AUTH_FAILURES_AFTER" -gt "$AUTH_FAILURES_BEFORE" ]; then
  echo "   AUTH REJECTED - stream token not accepted"
  exit 1
fi
echo "   auth passed (rejected only because the SDP is a dummy)"

echo
echo "All device-side endpoints work. Test device id: $DEVICE_ID"

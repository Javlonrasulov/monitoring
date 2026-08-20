#!/bin/bash
set -euo pipefail
PASS=0
FAIL=0
check() {
  local name="$1"; shift
  if "$@"; then
    echo "OK  $name"
    PASS=$((PASS+1))
  else
    echo "FAIL $name"
    FAIL=$((FAIL+1))
  fi
}

echo "==== PUBLIC HTML ===="
M_TITLE=$(curl -s https://m.levelapp.site/login | grep -o '<title>[^<]*</title>' || true)
A_TITLE=$(curl -s https://levelapp.site/login | grep -o '<title>[^<]*</title>' || true)
echo "m login title: $M_TITLE"
echo "admin login title: $A_TITLE"
check "m serves LevelApp" grep -q 'LevelApp' <<<"$M_TITLE"
check "admin serves Admin" grep -qi 'Admin\|Monitoring' <<<"$A_TITLE"

echo "==== SSL ===="
SAN=$(echo | openssl s_client -connect m.levelapp.site:443 -servername m.levelapp.site 2>/dev/null | openssl x509 -noout -ext subjectAltName)
echo "$SAN"
check "cert has m.levelapp.site" grep -q 'DNS:m.levelapp.site' <<<"$SAN"

echo "==== CORS ===="
CORS=$(curl -s -D - -o /dev/null -X OPTIONS 'https://levelapp.site/api/v1/devices/pair' \
  -H 'Origin: https://m.levelapp.site' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization')
echo "$CORS" | grep -iE 'HTTP/|access-control' || true
check "CORS allow origin m" grep -qi 'access-control-allow-origin: https://m.levelapp.site' <<<"$CORS"

echo "==== PAIR FLOW ===="
STATUS=$(curl -s 'https://levelapp.site/api/v1/devices/pair-status?phone=998700001122')
echo "pair-status: $STATUS"
check "pair-status json" grep -q 'exists' <<<"$STATUS"

PAIR=$(curl -s -X POST 'https://levelapp.site/api/v1/devices/pair' \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://m.levelapp.site' \
  -d '{"phone":"998700001122","password":"1234","name":"WebAudit","appVersion":"user-web/audit","deviceModel":"audit-bot"}')
echo "pair: ${PAIR:0:220}..."
TOKEN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["deviceToken"])' <<<"$PAIR")
check "got deviceToken" test -n "$TOKEN"

ME=$(curl -s -H "Authorization: Bearer $TOKEN" https://levelapp.site/api/v1/devices/me)
echo "me: $ME"
check "devices/me" grep -q 'WebAudit\|998700001122\|"name"' <<<"$ME"

CHATS=$(curl -s -H "Authorization: Bearer $TOKEN" https://levelapp.site/api/v1/device-chats)
check "device-chats array" python3 -c 'import json,sys; json.load(sys.stdin);' <<<"$CHATS"

SUB=$(curl -s -H "Authorization: Bearer $TOKEN" https://levelapp.site/api/v1/device-subscriptions/me)
echo "sub: $SUB"
check "subscriptions/me" grep -q 'status\|plan\|active\|trial' <<<"$SUB"

SUP=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" https://levelapp.site/api/v1/device-chats/support)
echo "support: ${SUP:0:180}"
check "open support" grep -q '"id"' <<<"$SUP"
THREAD=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$SUP")

MSG=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  "https://levelapp.site/api/v1/device-chats/$THREAD/messages" \
  -d '{"text":"web audit ping","clientId":"audit_1"}')
echo "msg: ${MSG:0:180}"
check "send message" grep -q 'web audit ping' <<<"$MSG"

LINKED=$(curl -s -H "Authorization: Bearer $TOKEN" https://levelapp.site/api/v1/devices/me/linked)
check "linked devices" python3 -c 'import json,sys; assert isinstance(json.load(sys.stdin), list)' <<<"$LINKED"

CODE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  https://levelapp.site/api/v1/devices/me/pairing-codes -d '{}')
echo "pairing code: $CODE"
check "pairing code" grep -q '"code"' <<<"$CODE"

echo "==== USER ROUTES (internal host) ===="
for p in / /login /chats /settings /profile /join; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: m.levelapp.site' "http://127.0.0.1:8080$p")
  echo "$p -> $code"
  check "route $p" test "$code" = "200"
done
MAN=$(curl -s -H 'Host: m.levelapp.site' http://127.0.0.1:8080/manifest.webmanifest)
check "PWA manifest" grep -q 'LevelApp' <<<"$MAN"

echo "==== APP DNS ===="
if getent hosts app.levelapp.site >/dev/null; then
  check "app DNS exists" true
else
  echo "WARN app.levelapp.site DNS missing"
  FAIL=$((FAIL+1))
fi

echo
echo "PASS=$PASS FAIL=$FAIL"
SCORE=$(( PASS * 100 / (PASS + FAIL) ))
echo "SCORE=$SCORE/100"
test "$FAIL" -eq 0

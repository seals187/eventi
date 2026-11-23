#!/usr/bin/env bash
# API smoke test for eventi (bash + curl, no other dependencies).
#
#   BASE=http://localhost:8090 ADMIN_EMAIL=... ADMIN_PASSWORD=... tests/smoke.sh
#
# Uses the eventi admin account (PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD). Creates a test
# survey and a test user and deletes both again. Turn off rate limiting for repeated runs
# (EVENTI_RATE_LIMIT=false) or wait a minute between runs.
set -u

BASE="${BASE:-http://localhost:8090}"
ADMIN_EMAIL="${ADMIN_EMAIL:?ADMIN_EMAIL missing}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD missing}"
PASS=0
FAIL=0

# req METHOD PATH [BODY] [HEADER...] -> sets $CODE and $BODY
req() {
  local method="$1" path="$2" data="${3:-}"
  shift 3 2>/dev/null || shift $#
  local args=(-s -o /tmp/eventi_smoke_body -w "%{http_code}" -X "$method" "$BASE$path" -H "Content-Type: application/json")
  for hdr in "$@"; do args+=(-H "$hdr"); done
  [ -n "$data" ] && args+=(--data "$data")
  CODE=$(curl "${args[@]}")
  BODY=$(cat /tmp/eventi_smoke_body)
}

# json KEY -> first string/number/bool value of KEY in $BODY
json() {
  printf '%s' "$BODY" | grep -o "\"$1\":\(\"[^\"]*\"\|[^,}]*\)" | head -1 | sed -E "s/^\"$1\"://; s/^\"//; s/\"$//"
}

check() {
  local name="$1" want="$2" got="$3"
  if [ "$want" = "$got" ]; then
    PASS=$((PASS + 1)); echo "  ok   $name"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL $name (expected '$want', got '$got') ${BODY:0:200}"
  fi
}

SURVEY='{"title":"Smoke","questions":[{"type":"schedule","label":"Wann?","slots":["2030-01-10T18:00","2030-01-11"]}]}'
ANSWERS='{"name":"Anna","answers":{}}'

echo "== Config"
req GET /api/eventi/config
check "config reachable" 200 "$CODE"

echo "== Login"
req POST /api/eventi/surveys "$SURVEY"
check "create without login is rejected" 401 "$CODE"
req POST /api/collections/users/auth-with-password "{\"identity\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"
check "admin password login" 200 "$CODE"
TOKEN=$(json token)
AUTH="Authorization: $TOKEN"
req GET /api/eventi/me "" "$AUTH"
check "me: role admin" admin "$(json role)"
req PATCH "/api/collections/users/records/$(json id)" '{"role":"user"}' "$AUTH"
check "self role change is blocked" 404 "$CODE"

echo "== Surveys"
req POST /api/eventi/surveys "$SURVEY" "$AUTH"
check "create with login" 200 "$CODE"
SID=$(json id)
KEY=$(json admin_key)
req GET "/api/eventi/surveys/$SID" "" "$AUTH"
check "owner manages without key" true "$(json admin)"
req GET "/api/eventi/surveys/$SID"
check "anonymous is no admin" false "$(json admin)"
req GET "/api/eventi/surveys/$SID" "" "X-Admin-Key: $KEY"
check "admin link still works" true "$(json admin)"
req GET /api/eventi/me/surveys "" "$AUTH"
check "listed in my surveys" 1 "$(printf '%s' "$BODY" | grep -c "\"$SID\"")"

echo "== Responses"
req POST "/api/eventi/surveys/$SID/responses" "$ANSWERS"
check "anonymous vote" 200 "$CODE"
RID=$(json id)
EKEY=$(json edit_key)
req PATCH "/api/eventi/responses/$RID" '{"name":"Anna B"}' "X-Edit-Key: $EKEY"
check "edit with edit key" 200 "$CODE"
req PATCH "/api/eventi/responses/$RID" '{"comment":"Am 26. bin ich weg."}' "X-Edit-Key: $EKEY"
check "comment saved" "Am 26. bin ich weg." "$(json comment)"
req PATCH "/api/eventi/responses/$RID" '{"name":"X"}' "$AUTH"
check "other account cannot edit" 403 "$CODE"
req PATCH "/api/eventi/surveys/$SID" '{"settings":{"require_login":true}}' "$AUTH"
check "enable require_login" true "$(json require_login)"
req POST "/api/eventi/surveys/$SID/responses" "$ANSWERS"
check "anonymous vote rejected" 401 "$CODE"
req POST "/api/eventi/surveys/$SID/responses" '{"name":"Fake","answers":{}}' "$AUTH"
check "vote with account" 200 "$CODE"
req GET "/api/eventi/surveys/$SID" "" "$AUTH"
check "account name used, not 'Fake'" 0 "$(printf '%s' "$BODY" | grep -c '"Fake"')"
check "own response found via account" true "$(printf '%s' "$BODY" | grep -q '"mine":{' && echo true)"
req POST "/api/eventi/surveys/$SID/responses" "$ANSWERS" "$AUTH"
check "second vote rejected" 400 "$CODE"

echo "== Survey rules"
# Characterization tests: pin down current behaviour before refactoring
msg() { printf '%s' "$BODY" | grep -o '"message":"[^"]*"' | cut -d'"' -f4; }
mk() { # mk SETTINGS_JSON [EXTRA_FIELDS] -> sets RSID
  req POST /api/eventi/surveys "{\"title\":\"Rules\",\"settings\":$1${2:+,$2},\"questions\":[{\"id\":\"q1\",\"type\":\"schedule\",\"label\":\"Wann?\",\"slots\":[\"2030-01-10\",\"2030-01-11\"]}]}" "$AUTH"
  RSID=$(json id); CREATED="$CREATED $RSID"
}
CREATED=""

mk '{"allow_edit":false}'
req POST "/api/eventi/surveys/$RSID/responses" "$ANSWERS"
RRID=$(json id); REKEY=$(json edit_key)
req PATCH "/api/eventi/responses/$RRID" '{"name":"Changed"}' "X-Edit-Key: $REKEY"
check "allow_edit=false: edit rejected" "Err.edit_disabled." "$(msg)"
req DELETE "/api/eventi/responses/$RRID" "" "X-Edit-Key: $REKEY"
check "allow_edit=false: delete by participant rejected" "Err.edit_disabled." "$(msg)"
req DELETE "/api/eventi/responses/$RRID" "" "$AUTH"
check "allow_edit=false: owner can still delete" 204 "$CODE"

mk '{"results":"after_vote"}'
req POST "/api/eventi/surveys/$RSID/responses" "$ANSWERS"
RRID=$(json id); REKEY=$(json edit_key)
req GET "/api/eventi/surveys/$RSID"
check "after_vote: results hidden before voting" false "$(json can_see_results)"
check "after_vote: no responses sent" 1 "$(printf '%s' "$BODY" | grep -c '"responses":null')"
req GET "/api/eventi/surveys/$RSID" "" "X-Response-Id: $RRID" "X-Edit-Key: $REKEY"
check "after_vote: results visible after voting" true "$(json can_see_results)"

mk '{"results":"hidden"}'
req POST "/api/eventi/surveys/$RSID/responses" "$ANSWERS"
RRID=$(json id); REKEY=$(json edit_key)
req GET "/api/eventi/surveys/$RSID" "" "X-Response-Id: $RRID" "X-Edit-Key: $REKEY"
check "hidden: participant does not see results" false "$(json can_see_results)"
req GET "/api/eventi/surveys/$RSID" "" "$AUTH"
check "hidden: owner sees results" true "$(json can_see_results)"

mk '{}'
req PATCH "/api/eventi/surveys/$RSID" '{"closed":true}' "$AUTH"
req POST "/api/eventi/surveys/$RSID/responses" "$ANSWERS"
check "closed: vote rejected" "Err.closed." "$(msg)"
req PATCH "/api/eventi/surveys/$RSID" '{"closed":false}' "$AUTH"
req POST "/api/eventi/surveys/$RSID/responses" "$ANSWERS"
check "reopened: vote accepted" 200 "$CODE"
req PATCH "/api/eventi/surveys/$RSID" '{"closes_at":"2020-01-01T00:00:00.000Z"}' "$AUTH"
check "closes_at in the past: survey is closed" true "$(json is_closed)"
req POST "/api/eventi/surveys/$RSID/responses" "$ANSWERS"
check "closes_at in the past: vote rejected" "Err.closed." "$(msg)"

mk '{}'
req PATCH "/api/eventi/surveys/$RSID" '{"final":{"q1":"2099-01-01"}}' "$AUTH"
check "final: unknown slot is dropped" 1 "$(printf '%s' "$BODY" | grep -c '"final":{}')"
req PATCH "/api/eventi/surveys/$RSID" '{"final":{"q1":"2030-01-11"}}' "$AUTH"
check "final: valid slot is stored" 1 "$(printf '%s' "$BODY" | grep -c '"final":{"q1":"2030-01-11"}')"

mk '{}'
req GET /api/eventi/config
MAXR=$(json max_responses)
for _ in $(seq 1 "$MAXR"); do req POST "/api/eventi/surveys/$RSID/responses" "$ANSWERS"; done
req POST "/api/eventi/surveys/$RSID/responses" "$ANSWERS"
check "response limit ($MAXR) enforced" "Err.max_responses." "$(msg)"

for s in $CREATED; do req DELETE "/api/eventi/surveys/$s" "" "$AUTH"; done

echo "== User management"
UEMAIL="smoke-$RANDOM@example.com"
req POST /api/eventi/users "{\"email\":\"$UEMAIL\",\"name\":\"Smoke\",\"password\":\"smokepass123\"}" "$AUTH"
check "invite user" 200 "$CODE"
UID_=$(json id)
req POST /api/collections/users/auth-with-password "{\"identity\":\"$UEMAIL\",\"password\":\"smokepass123\"}"
check "invited user can log in" 200 "$CODE"
UAUTH="Authorization: $(json token)"
req GET /api/eventi/users "" "$UAUTH"
check "normal user cannot list users" 403 "$CODE"
req GET "/api/eventi/surveys/$SID" "" "$UAUTH"
check "normal user is no admin of foreign survey" false "$(json admin)"
req PATCH "/api/eventi/users/$UID_" '{"status":"blocked"}' "$AUTH"
check "block user" blocked "$(json status)"
req GET /api/eventi/me "" "$UAUTH"
check "blocked token rejected immediately" 401 "$CODE"
req POST /api/collections/users/auth-with-password "{\"identity\":\"$UEMAIL\",\"password\":\"smokepass123\"}"
check "blocked user cannot log in" 403 "$CODE"
req DELETE "/api/eventi/users/$UID_" "" "$AUTH"
check "delete user" 204 "$CODE"

echo "== Cleanup"
req DELETE "/api/eventi/surveys/$SID" "" "$AUTH"
check "delete survey" 204 "$CODE"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

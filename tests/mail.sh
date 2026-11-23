#!/usr/bin/env bash
# Mail flow test for eventi against a Mailpit test mail server (real SMTP, nothing leaves the machine).
# Start everything with tests/docker-test.sh, or manually with:
#   EVENTI_SMTP_HOST=<mailpit> EVENTI_SMTP_PORT=1025 EVENTI_SIGNUP=domain,approval
#   EVENTI_SIGNUP_DOMAINS=firma.ch EVENTI_DIGEST_MINUTES=0 EVENTI_RATE_LIMIT=false
#
#   BASE=http://127.0.0.1:8099 MAILPIT=http://127.0.0.1:8025 ADMIN_EMAIL=... ADMIN_PASSWORD=... tests/mail.sh
# The superuser route POST /api/eventi/outbox/run delivers queued emails at once, so the test
# does not wait for the cron job. The retry test stops and restarts the Mailpit container
# (only if docker and the container MAILPIT_CONTAINER, default eventi-mailpit, are available).
set -u

BASE="${BASE:-http://127.0.0.1:8099}"
MAILPIT="${MAILPIT:-http://127.0.0.1:8025}"
ADMIN_EMAIL="${ADMIN_EMAIL:?ADMIN_EMAIL missing}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD missing}"
H="Content-Type: application/json"
PASS=0
FAIL=0
RUN=$RANDOM

check() {
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); echo "  ok   $1"; else FAIL=$((FAIL + 1)); echo "  FAIL $1 (expected '$2', got '$3')"; fi
}
post() { curl -s -X POST "$BASE$1" -H "$H" ${3:+-H "$3"} -d "$2"; }
field() { grep -o "\"$1\":\"[^\"]*\"" | head -1 | cut -d'"' -f4; }

# Subjects of all mails to an address (newest first)
subjects() { curl -s "$MAILPIT/api/v1/search?query=to:$1" | grep -o '"Subject":"[^"]*"' | cut -d'"' -f4; }
# Plain text of the newest mail to an address
latest_text() {
  local id
  id=$(curl -s "$MAILPIT/api/v1/search?query=to:$1" | grep -o '"ID":"[^"]*"' | head -1 | cut -d'"' -f4)
  curl -s "$MAILPIT/api/v1/message/$id" | grep -o '"Text":"[^"]*"' | cut -d'"' -f4
}
# Deliver everything queued in the outbox now (incl. jobs not due yet and automatic reminders)
flush() { curl -s -o /dev/null -X POST "$BASE/api/eventi/outbox/run?all=1&auto=1" -H "$SU"; }
wait_mail() { # wait_mail ADDRESS PATTERN [SECONDS]
  for _ in $(seq 1 "${3:-10}"); do flush; subjects "$1" | grep -q "$2" && return 0; sleep 1; done
  return 1
}

MAX="max-$RUN@firma.ch"
EVA="eva-$RUN@example.org"
ADMTOKEN=$(post /api/collections/users/auth-with-password "{\"identity\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | field token)
ADM="Authorization: $ADMTOKEN"
SU="Authorization: $(post /api/collections/_superusers/auth-with-password "{\"identity\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | field token)"

echo "== Outbox"
check "outbox run needs the superuser" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/eventi/outbox/run" -H "$ADM")"

echo "== Sign-up"
R=$(post /api/collections/users/records "{\"email\":\"$MAX\",\"password\":\"maxpass123\",\"passwordConfirm\":\"maxpass123\",\"name\":\"Max\",\"lang\":\"en\",\"role\":\"admin\"}")
check "domain sign-up is active" active "$(echo "$R" | field status)"
check "role cannot be chosen" user "$(echo "$R" | field role)"
wait_mail "$MAX" "Confirm"; check "verification mail (English)" 0 $?
R=$(post /api/collections/users/records "{\"email\":\"$EVA\",\"password\":\"evapass123\",\"passwordConfirm\":\"evapass123\",\"name\":\"Eva\"}")
check "other sign-up is pending" pending "$(echo "$R" | field status)"
wait_mail "$ADMIN_EMAIL" "Freischaltung"; check "admin notified about pending sign-up" 0 $?
check "unverified password login blocked" "Err.not_verified." "$(post /api/collections/users/auth-with-password "{\"identity\":\"$MAX\",\"password\":\"maxpass123\"}" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)"
check "pending login blocked" "Err.account_pending." "$(post /api/collections/users/auth-with-password "{\"identity\":\"$EVA\",\"password\":\"evapass123\"}" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)"

echo "== Code login"
OTPID=$(post /api/collections/users/request-otp "{\"email\":\"$MAX\"}" | field otpId)
wait_mail "$MAX" "sign-in code"; check "code mail" 0 $?
CODE=$(subjects "$MAX" | grep -o "sign-in code: [0-9]*" | head -1 | grep -o "[0-9]*$")
R=$(post /api/collections/users/auth-with-otp "{\"otpId\":\"$OTPID\",\"password\":\"$CODE\"}")
MAXTOKEN=$(echo "$R" | field token)
check "code login works" 1 "$([ -n "$MAXTOKEN" ] && echo 1)"
check "code login verifies address" true "$(echo "$R" | grep -o '"verified":[a-z]*' | cut -d: -f2)"

echo "== Approval and reset"
EVAID=$(curl -s "$BASE/api/eventi/users" -H "$ADM" | tr '}' '\n' | grep "$EVA" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
curl -s -o /dev/null -X PATCH "$BASE/api/eventi/users/$EVAID" -H "$H" -H "$ADM" -d '{"status":"active"}'
wait_mail "$EVA" "freigeschaltet"; check "approval mail" 0 $?
check "approved user can log in" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/collections/users/auth-with-password" -H "$H" -d "{\"identity\":\"$EVA\",\"password\":\"evapass123\"}")"
post /api/collections/users/request-password-reset "{\"email\":\"$EVA\"}" >/dev/null
wait_mail "$EVA" "Passwort"; check "reset mail" 0 $?
check "reset link points to login page" 1 "$(latest_text "$EVA" | grep -c 'login.html#reset=')"

echo "== Invitation"
INV="inv-$RUN@example.org"
post /api/eventi/users "{\"email\":\"$INV\",\"name\":\"Ines\",\"lang\":\"fr\"}" "$ADM" >/dev/null
wait_mail "$INV" "Invitation"; check "invitation mail (French)" 0 $?

echo "== Notifications"
SID=$(post /api/eventi/surveys '{"title":"Mail <Test> '"$RUN"'","questions":[{"type":"schedule","label":"Wann?","slots":["2030-01-10T18:00","2030-01-11"]}]}' "$ADM" | field id)
post "/api/eventi/surveys/$SID/responses" '{"name":"Max","answers":{}}' "Authorization: $MAXTOKEN" >/dev/null
post "/api/eventi/surveys/$SID/responses" '{"name":"Lisa","answers":{}}' >/dev/null
# JSON key order is not fixed, so take the "id" from inside the first question object
QID=$(curl -s "$BASE/api/eventi/surveys/$SID" | grep -o '"questions":\[{[^}]*' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
curl -s -o /dev/null -X PATCH "$BASE/api/eventi/surveys/$SID" -H "$H" -H "$ADM" -d "{\"final\":{\"$QID\":\"2030-01-10T18:00\"}}"
wait_mail "$ADMIN_EMAIL" "Neue Antworten: Mail .*Test.* $RUN" 130; check "owner digest" 0 $?
check "digest lists both responses" 1 "$(latest_text "$ADMIN_EMAIL" | grep -c 'Max.*Lisa')"
wait_mail "$MAX" "Date confirmed" 130; check "final date mail to participant (English)" 0 $?
check "final date formatted" 1 "$(latest_text "$MAX" | grep -c 'Thu 2030-01-10, 18:00')"
curl -s -o /dev/null -X DELETE "$BASE/api/eventi/surveys/$SID" -H "$ADM"

echo "== Survey invitations + reminders"
ANNA="anna-$RUN@example.org"
CLOSES=$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%S.000Z)
SID=$(post /api/eventi/surveys '{"title":"Einladung '"$RUN"'","settings":{"require_login":true},"closes_at":"'"$CLOSES"'","questions":[{"type":"choice","label":"Was?","options":["A","B"]}]}' "$ADM" | field id)
R=$(post "/api/eventi/surveys/$SID/invitations" "{\"emails\":\"Anna <$ANNA>, $MAX\"}" "$ADM")
check "invite two people" 2 "$(echo "$R" | grep -o '"added":[0-9]*' | cut -d: -f2)"
R=$(post "/api/eventi/surveys/$SID/invitations" "{\"emails\":\"$ANNA\"}" "$ADM")
check "duplicate is skipped" 1 "$(echo "$R" | grep -o '"skipped":[0-9]*' | cut -d: -f2)"
check "stranger cannot see invitations" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/eventi/surveys/$SID/invitations" -H "Authorization: $MAXTOKEN")"
wait_mail "$ANNA" "Einladung $RUN" 90; check "invitation mail to Anna (German)" 0 $?
wait_mail "$MAX" "Invitation: Einladung $RUN" 30; check "invitation mail to Max (his language: English)" 0 $?
TOK=$(latest_text "$ANNA" | grep -o '#i=[A-Za-z0-9]*' | head -1 | cut -c4-)
check "personal link in mail" 1 "$([ ${#TOK} -ge 20 ] && echo 1)"
check "link identifies Anna" Anna "$(curl -s "$BASE/api/eventi/surveys/$SID" -H "X-Invite-Token: $TOK" | grep -o '"participant":{[^}]*' | field name)"
check "anonymous vote without link rejected" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/eventi/surveys/$SID/responses" -H "$H" -d '{"name":"X","answers":{}}')"
R=$(curl -s -X POST "$BASE/api/eventi/surveys/$SID/responses" -H "$H" -H "X-Invite-Token: $TOK" -d '{"name":"Fake","answers":{"x":["A"]}}')
check "vote via personal link (no account)" 1 "$(echo "$R" | grep -c '"edit_key"')"
ARID=$(echo "$R" | field id)
check "second vote via link rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/eventi/surveys/$SID/responses" -H "$H" -H "X-Invite-Token: $TOK" -d '{"answers":{}}')"
check "edit via link" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/eventi/responses/$ARID" -H "$H" -H "X-Invite-Token: $TOK" -d '{"answers":{}}')"
check "name taken from invitation" 0 "$(curl -s "$BASE/api/eventi/surveys/$SID" -H "$ADM" | grep -c '"Fake"')"
INVS=$(curl -s "$BASE/api/eventi/surveys/$SID/invitations" -H "$ADM")
check "Anna counted as voted" true "$(echo "$INVS" | tr '}' '\n' | grep "$ANNA" | grep -o '"voted":[a-z]*' | cut -d: -f2)"
check "Max still pending" false "$(echo "$INVS" | tr '}' '\n' | grep "$MAX" | grep -o '"voted":[a-z]*' | cut -d: -f2)"
flush; flush
check "automatic reminder scheduled once (closes within 24 h)" 1 "$(curl -s -G "$BASE/api/collections/outbox/records" --data-urlencode "filter=bundle~'auto-reminder:$SID'" -H "$SU" | grep -o '"totalItems":[0-9]*' | cut -d: -f2)"
check "automatic reminder skips people invited just now" 0 "$(curl -s "$BASE/api/eventi/surveys/$SID/invitations" -H "$ADM" | grep -c '"remind_queued":true')"
check "manual reminder queued for Max only" 1 "$(post "/api/eventi/surveys/$SID/invitations/remind" '{}' "$ADM" | grep -o '"queued":[0-9]*' | cut -d: -f2)"
wait_mail "$MAX" "Reminder: Einladung $RUN" 90; check "reminder mail (English)" 0 $?
check "reminder mentions closing time" 1 "$(latest_text "$MAX" | grep -c 'The poll closes on')"
check "Anna got no reminder" 0 "$(subjects "$ANNA" | grep -c Erinnerung)"
check "manual reminder: nobody due again within 12 h" 0 "$(post "/api/eventi/surveys/$SID/invitations/remind" '{}' "$ADM" | grep -o '"queued":[0-9]*' | cut -d: -f2)"
post "/api/eventi/surveys/$SID/responses" '{"answers":{}}' "Authorization: $MAXTOKEN" >/dev/null
check "Max counted as voted after voting with account" true "$(curl -s "$BASE/api/eventi/surveys/$SID/invitations" -H "$ADM" | tr '}' '\n' | grep "$MAX" | grep -o '"voted":[a-z]*' | cut -d: -f2)"
AIID=$(curl -s "$BASE/api/eventi/surveys/$SID/invitations" -H "$ADM" | tr '}' '\n' | grep "$ANNA" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
curl -s -o /dev/null -X DELETE "$BASE/api/eventi/invitations/$AIID" -H "$ADM"
check "removed invitation: link no longer works" 1 "$(curl -s "$BASE/api/eventi/surveys/$SID" -H "X-Invite-Token: $TOK" | grep -c '"invited_as":""')"
curl -s -o /dev/null -X DELETE "$BASE/api/eventi/surveys/$SID" -H "$ADM"

MPC="${MAILPIT_CONTAINER:-eventi-mailpit}"
if command -v docker >/dev/null 2>&1 && docker inspect "$MPC" >/dev/null 2>&1; then
  echo "== Outbox retries (mail server down)"
  RETRY="retry-$RUN@example.org"
  docker stop -t 1 "$MPC" >/dev/null
  R=$(post /api/eventi/users "{\"email\":\"$RETRY\",\"name\":\"Retry\",\"password\":\"retrypass123\"}" "$ADM")
  check "account created although the mail server is down" 1 "$(echo "$R" | grep -c '"mailed":true')"
  JOB=$(curl -s -G "$BASE/api/collections/outbox/records" --data-urlencode "filter=kind='account_invite' && status='pending' && attempts=1" -H "$SU")
  check "failed delivery is queued for a retry" 1 "$(echo "$JOB" | grep -o '"totalItems":[0-9]*' | cut -d: -f2)"
  check "the error is recorded" 1 "$(echo "$JOB" | grep -c '"last_error":"[^"]')"
  docker start "$MPC" >/dev/null
  for _ in $(seq 1 30); do curl -s -o /dev/null "$MAILPIT/api/v1/messages" && break; sleep 1; done
  wait_mail "$RETRY" "Einladung" 15; check "retry delivers once the mail server is back" 0 $?
fi

echo "== Cleanup"
for u in $(curl -s "$BASE/api/eventi/users" -H "$ADM" | tr '}' '\n' | grep -- "-$RUN@" | grep -o '"id":"[^"]*"' | cut -d'"' -f4); do
  curl -s -o /dev/null -X DELETE "$BASE/api/eventi/users/$u" -H "$ADM"
done

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

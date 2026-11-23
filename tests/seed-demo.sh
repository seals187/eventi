#!/usr/bin/env bash
# Creates a demo poll ("Weihnachtsessen") with a few answers, a comment and a pending invitation,
# so a freshly started test container has something to look at.
#
#   BASE=http://127.0.0.1:8098 ADMIN_EMAIL=... ADMIN_PASSWORD=... tests/seed-demo.sh
set -u

BASE="${BASE:-http://127.0.0.1:8098}"
ADMIN_EMAIL="${ADMIN_EMAIL:?ADMIN_EMAIL missing}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD missing}"
H="Content-Type: application/json; charset=utf-8"
field() { grep -o "\"$1\":\"[^\"]*\"" | head -1 | cut -d'"' -f4; }

TOKEN=$(curl -s -X POST "$BASE/api/collections/users/auth-with-password" -H "$H" \
  -d "{\"identity\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | field token)
AUTH="Authorization: $TOKEN"

# Three dates starting 10 days from now. JSON goes through stdin: on Windows (Git Bash)
# command-line arguments lose non-ASCII characters.
d1=$(date -d '+10 days' +%Y-%m-%d); d2=$(date -d '+11 days' +%Y-%m-%d); d3=$(date -d '+12 days' +%Y-%m-%d)
R=$(curl -s -X POST "$BASE/api/eventi/surveys" -H "$H" -H "$AUTH" --data-binary @- <<JSON
{
  "title": "Weihnachtsessen",
  "description": "Abstimmung für das Weihnachtsessen",
  "questions": [{"id": "q1", "type": "schedule", "label": "Wann passt es euch?", "slots": ["$d1", "$d2", "${d3}T19:00"]}]
}
JSON
)
SID=$(echo "$R" | field id)
KEY=$(echo "$R" | field admin_key)
[ -z "$SID" ] && { echo "demo seed failed: $R"; exit 1; }


vote() { printf "%s" "$1" | curl -s -o /dev/null -X POST "$BASE/api/eventi/surveys/$SID/responses" -H "$H" --data-binary @-; }
vote '{"name":"Anna","answers":{"q1":{"'"$d1"'":"yes","'"$d2"'":"yes"}}}'
vote '{"name":"Ben","answers":{"q1":{"'"$d2"'":"yes","'"$d3"'T19:00":"yes"}}}'
vote '{"name":"Clara","answers":{"q1":{"'"$d1"'":"maybe","'"$d2"'":"yes"}},"comment":"Freitag wäre ideal!"}'
vote '{"name":"JK","answers":{"q1":{"'"$d2"'":"yes","'"$d3"'T19:00":"maybe"}},"comment":"Am ersten Termin bin ich leider auf Dienstreise."}'
curl -s -o /dev/null -X POST "$BASE/api/eventi/surveys/$SID/invitations" -H "$H" -H "$AUTH" -d '{"emails":"David <david@example.org>"}'

echo "Demo poll: $BASE/s.html?id=$SID"
echo "Admin:     $BASE/a.html?id=$SID#k=$KEY"

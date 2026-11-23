#!/usr/bin/env bash
# Runs all API tests in isolated Docker containers:
#   - builds the image as eventi:test
#   - starts Mailpit (test mail server) and eventi on their own network
#   - runs tests/smoke.sh and tests/mail.sh, then adds a demo poll (tests/seed-demo.sh)
#   - leaves both containers running for manual testing (remove them with CLEAN=1,
#     or later: docker rm -f eventi-test eventi-mailpit)
# Does not touch your .env, your running eventi container or its data volume.
#
#   bash tests/docker-test.sh            # NO_DEMO=1 skips the demo poll
set -u
cd "$(dirname "$0")/.."

PORT="${PORT:-8098}"
MAILPIT_PORT="${MAILPIT_PORT:-8025}"
NET=eventi-test
ADMIN_EMAIL=admin@test.local
ADMIN_PASSWORD=adminpass123

cleanup() {
  if [ "${CLEAN:-}" != 1 ]; then
    echo
    echo "Test containers keep running:"
    echo "  eventi   http://127.0.0.1:$PORT   (admin: $ADMIN_EMAIL / $ADMIN_PASSWORD)"
    echo "  Mailpit  http://127.0.0.1:$MAILPIT_PORT   (all emails incl. sign-in codes)"
    echo "  Stop:    docker rm -f eventi-test eventi-mailpit"
    return
  fi
  docker rm -f eventi-test eventi-mailpit >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
}
trap cleanup EXIT

echo "== Build"
docker build -q --build-arg EVENTI_VERSION="$(cat VERSION)-test" -t eventi:test . >/dev/null || exit 1
docker rm -f eventi-test eventi-mailpit >/dev/null 2>&1
docker network create "$NET" >/dev/null 2>&1

echo "== Start"
docker run -d --name eventi-mailpit --network "$NET" -p "127.0.0.1:$MAILPIT_PORT:8025" axllent/mailpit:v1.27 >/dev/null || exit 1
docker run -d --name eventi-test --network "$NET" -p "127.0.0.1:$PORT:8090" \
  -e PB_ADMIN_EMAIL="$ADMIN_EMAIL" -e PB_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e EVENTI_SMTP_HOST=eventi-mailpit -e EVENTI_SMTP_PORT=1025 -e EVENTI_MAIL_FROM=eventi@test.local \
  -e EVENTI_APP_URL="http://127.0.0.1:$PORT" -e EVENTI_SIGNUP=domain,approval -e EVENTI_SIGNUP_DOMAINS=firma.ch \
  -e EVENTI_DIGEST_MINUTES=0 -e EVENTI_RATE_LIMIT=false \
  eventi:test >/dev/null || exit 1
for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/api/health" && break; sleep 1; done

export BASE="http://127.0.0.1:$PORT" MAILPIT="http://127.0.0.1:$MAILPIT_PORT" ADMIN_EMAIL ADMIN_PASSWORD
status=0
echo; echo "######## smoke.sh"; bash tests/smoke.sh || status=1
echo; echo "######## mail.sh";  bash tests/mail.sh  || status=1

# Demo data for manual testing
if [ "${CLEAN:-}" != 1 ] && [ "${NO_DEMO:-}" != 1 ]; then
  echo; echo "######## demo data"; bash tests/seed-demo.sh || status=1
fi

echo
docker logs eventi-test 2>&1 | grep -iE "panic|ReferenceError|TypeError|SyntaxError" && status=1
[ $status = 0 ] && echo "ALL TESTS PASSED" || echo "SOME TESTS FAILED"
exit $status

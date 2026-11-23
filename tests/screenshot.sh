#!/usr/bin/env bash
# Screenshot a page of the running test container (start it with tests/docker-test.sh) in a headless
# Chromium browser (Edge on Windows, Chrome/Chromium elsewhere).
#
#   bash tests/screenshot.sh PATH [options]          e.g. "/s.html?id=abc&tab=all"
#     --out FILE        PNG to write (default: tests/screenshots/shot-<time>.png)
#     --size WxH        browser window (default 1280x800)
#     --mobile          render inside a 390x844 frame (headless browsers do not go below ~500 px)
#     --login           signed in as the test admin (admin@test.local)
#     --click SELECTOR  click this element first (e.g. ".link-card .icon-pill" opens the QR dialog)
#     --light           light colour scheme (default: dark)
#     --lang de|en|fr   UI language (default: de)
#     --store KEY=JSON  extra localStorage entry, repeatable (e.g. eventi:r:<survey>={"id":"…","key":"…"})
#
# How it works: the helper pages in tests/fixtures are copied into the test container (never into the
# image); __seed.html fills localStorage and redirects, __mobile.html / __click.html wrap the page in a
# frame. Pages keep a realtime (SSE) connection open, so the browser gets a fixed --timeout instead of
# waiting for the network to go idle. A cold browser sometimes renders an empty page, hence the warm-up.
set -u
cd "$(dirname "$0")/.."

BASE="${BASE:-http://127.0.0.1:8099}"
CONTAINER="${CONTAINER:-eventi-test}"
TARGET="${1:?usage: tests/screenshot.sh PATH [options]}"; shift
OUT=""; SIZE="1280x800"; MOBILE=0; LOGIN=0; CLICK=""; LIGHT=0; LANG_UI="de"; STORES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --size) SIZE="$2"; shift 2 ;;
    --mobile) MOBILE=1; shift ;;
    --login) LOGIN=1; shift ;;
    --click) CLICK="$2"; shift 2 ;;
    --light) LIGHT=1; shift ;;
    --lang) LANG_UI="$2"; shift 2 ;;
    --store) STORES+=("$2"); shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# Browser: $BROWSER, Edge on Windows, else Chrome/Chromium
BROWSER="${BROWSER:-}"
for b in "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" "/c/Program Files/Microsoft/Edge/Application/msedge.exe" \
         "$(command -v google-chrome 2>/dev/null)" "$(command -v chromium 2>/dev/null)" "$(command -v chromium-browser 2>/dev/null)"; do
  [ -z "$BROWSER" ] && [ -n "$b" ] && [ -x "$b" ] && BROWSER="$b"
done
[ -z "$BROWSER" ] && { echo "no Chromium-based browser found (set BROWSER=...)" >&2; exit 1; }
nativepath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
enc() { perl -e '$_=$ARGV[0]; s/([^A-Za-z0-9_.~-])/sprintf("%%%02X",ord $1)/ge; print' "$1"; }

# Helper pages into the running test container (idempotent)
for f in tests/fixtures/__*.html; do docker cp "$f" "$CONTAINER:/pb/pb_public/$(basename "$f")" >/dev/null || exit 1; done

# Build the URL: frame (mobile / click) -> seed localStorage -> target
W="${SIZE%x*}"; H="${SIZE#*x}"
PAGE="$TARGET"
if [ -n "$CLICK" ]; then
  FW=$W; FH=$H; [ $MOBILE = 1 ] && { FW=390; FH=844; }
  PAGE="/__click.html?w=$FW&h=$FH&click=$(enc "$CLICK")&src=$(enc "$TARGET")"
elif [ $MOBILE = 1 ]; then
  PAGE="/__mobile.html?src=$(enc "$TARGET")"
fi
[ $MOBILE = 1 ] && { W=400; H=860; }
QS="eventi:lang=$LANG_UI"
if [ $LOGIN = 1 ]; then
  TOKEN=$(curl -s -X POST "$BASE/api/collections/users/auth-with-password" -H "Content-Type: application/json" \
    -d '{"identity":"admin@test.local","password":"adminpass123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  [ -z "$TOKEN" ] && { echo "login failed – is the test container running on $BASE?" >&2; exit 1; }
  QS="$QS&eventi:session=$(enc "{\"token\":\"$TOKEN\",\"user\":{\"role\":\"admin\",\"display_name\":\"Admin\",\"email\":\"admin@test.local\"}}")"
fi
for s in "${STORES[@]}"; do QS="$QS&$(enc "${s%%=*}")=$(enc "${s#*=}")"; done
URL="$BASE/__seed.html?$QS&next=$(enc "$PAGE")"

[ -z "$OUT" ] && { mkdir -p tests/screenshots; OUT="tests/screenshots/shot-$(date +%H%M%S).png"; }
mkdir -p "$(dirname "$OUT")"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"   # the browser needs an absolute path
COLOR="--force-dark-mode"; [ $LIGHT = 1 ] && COLOR="--blink-settings=preferredColorScheme=1"

# Every run gets its own fresh profile: a second run on the same profile attaches to the still
# exiting first browser and renders an empty page
shoot() { # shoot URL OUTFILE WIDTH HEIGHT
  local profile
  profile="$(mktemp -d)"
  rm -f "$2"
  timeout 40 "$BROWSER" --headless=new --disable-gpu --hide-scrollbars $COLOR --no-first-run \
    --user-data-dir="$(nativepath "$profile")" --window-size="$3,$4" --timeout=7000 \
    --screenshot="$(nativepath "$2")" "$1" >/dev/null 2>&1
  rm -rf "$profile" 2>/dev/null
}
WARM="$(mktemp -d)"
shoot "$BASE/login.html" "$WARM/warmup.png" 600 300       # warm-up: a cold browser may render a blank page
rm -rf "$WARM"
shoot "$URL" "$OUT" "$W" "$H"
[ -s "$OUT" ] || shoot "$URL" "$OUT" "$W" "$H"            # one retry
[ -s "$OUT" ] && echo "$OUT" || { echo "screenshot failed" >&2; exit 1; }

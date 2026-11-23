#!/usr/bin/env bash
# Cut a release: bash scripts/release.sh 0.1.1
#
# Expects a clean working tree on main and a filled "## [Unreleased]" section in CHANGELOG.md.
# Steps: lint -> CHANGELOG ([Unreleased] becomes [<version>] – <date>, new empty [Unreleased], compare
# link) -> VERSION -> commit -> tag v<version> -> push main + tag.
# The tag triggers .github/workflows/docker.yml: multi-arch image on GHCR and the GitHub release
# (notes = this version's CHANGELOG section). Watch it with: gh run watch
set -eu
cd "$(dirname "$0")/.."

V="${1:?usage: scripts/release.sh <version>, e.g. 0.1.1}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3" >&2; exit 1; }
PREV="$(tr -d '[:space:]' < VERSION)"
DATE="$(date +%Y-%m-%d)"

[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "not on main" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean – commit first" >&2; exit 1; }
git rev-parse -q --verify "refs/tags/v$V" >/dev/null && { echo "tag v$V exists" >&2; exit 1; }
grep -q '^## \[Unreleased\]' CHANGELOG.md || { echo "CHANGELOG.md has no '## [Unreleased]' section" >&2; exit 1; }
# The section must contain something besides blank lines
NOTES="$(awk '/^## \[Unreleased\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md | grep -c '[^[:space:]]' || true)"
[ "$NOTES" -gt 0 ] || { echo "[Unreleased] section is empty" >&2; exit 1; }

bash tests/lint.sh

V="$V" PREV="$PREV" DATE="$DATE" perl -0pi -e '
  s/^## \[Unreleased\][ \t]*\n/## [Unreleased]\n\n## [$ENV{V}] – $ENV{DATE}\n/m;
  s{^\[Unreleased\]:.*\n}{}m;
  s{^(\[\Q$ENV{PREV}\E\]:)}{[Unreleased]: https://github.com/seals187/eventi/compare/v$ENV{V}...HEAD\n[$ENV{V}]: https://github.com/seals187/eventi/compare/v$ENV{PREV}...v$ENV{V}\n$1}m;
' CHANGELOG.md
grep -q "^\[$V\]: " CHANGELOG.md || { echo "could not add the compare link – check CHANGELOG.md" >&2; git checkout CHANGELOG.md; exit 1; }
echo "$V" > VERSION

git add CHANGELOG.md VERSION
git commit -q -m "Release $V"
git tag -a "v$V" -m "v$V"
git push origin main "v$V"
echo "Released v$V – image and GitHub release are built by the workflow (gh run watch)."

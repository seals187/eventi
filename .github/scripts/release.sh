#!/usr/bin/env bash
# Creates or updates the GitHub release for a tag, with the matching CHANGELOG.md section as notes.
#   release.sh <tag> <latest|old>      (needs GH_TOKEN and the gh CLI, as on GitHub Actions runners)
set -euo pipefail
tag="$1"
mode="${2:-latest}"
version="${tag#v}"

# Everything between "## [<version>]" and the next "## [" heading (or the link references at the end)
awk -v v="$version" '
  index($0, "## [" v "]") == 1 { found = 1; next }
  found && (/^## \[/ || /^\[[0-9]/) { exit }
  found { print }
' CHANGELOG.md > notes.md
printf '\n**Docker image:** `ghcr.io/%s:%s`\n' "$GITHUB_REPOSITORY" "$version" >> notes.md

latest="--latest"
[ "$mode" = old ] && latest="--latest=false"

if gh release view "$tag" >/dev/null 2>&1; then
  gh release edit "$tag" --title "$version" --notes-file notes.md "$latest"
else
  gh release create "$tag" --title "$version" --notes-file notes.md --verify-tag "$latest"
fi

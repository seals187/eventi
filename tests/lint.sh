#!/usr/bin/env bash
# Lint the frontend and the PocketBase hooks with ESLint (config: eslint.config.js).
# Runs in the official node Docker image, so nothing has to be installed locally.
#   bash tests/lint.sh
set -u
cd "$(dirname "$0")/.."
ESLINT_VERSION=10.15.0
# MSYS_NO_PATHCONV: keep Git Bash on Windows from rewriting /app into a Windows path
MSYS_NO_PATHCONV=1 exec docker run --rm -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22-alpine \
  npx --yes "eslint@$ESLINT_VERSION" --max-warnings 0 pb_public/js pb_hooks pb_migrations

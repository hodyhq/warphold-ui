#!/usr/bin/env bash
# Builds the UI and commits the output under build/ (committed on purpose,
# mirroring upstream kopia/htmluibuild) so the Go module embeds it.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! git diff --cached --quiet; then
  echo "error: index already has staged changes; commit or unstage them before running this script" >&2
  exit 1
fi

npm ci
npm run build
git add -f build

if git diff --cached --quiet; then
  echo "build output unchanged; nothing to commit"
  exit 0
fi

git commit -m "build: ui $(git rev-parse --short HEAD)"

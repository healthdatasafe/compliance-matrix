#!/bin/sh
#
# upload.sh — publish the current dist/ contents to the `gh-pages` branch
# on `pryv/compliance-matrix`. Run AFTER `npm run build`.
#
# Mirrors app-web-auth3/scripts/upload.sh: a single commit message is
# required so the gh-pages history stays readable.

set -e

scriptsFolder=$(cd "$(dirname "$0")"; pwd)
cd "$scriptsFolder/.."

if [ $# -eq 0 ]; then
  echo "Usage: scripts/upload.sh \"<commit message>\""
  echo "No commit message was provided — refusing to push an unlabeled deploy."
  exit 1
fi

if [ ! -d dist/.git ]; then
  echo "dist/.git not found — run scripts/setup.sh first."
  exit 1
fi

cd dist

# `add -A` covers additions + modifications + deletions, so vite-emitted
# hashed filenames don't accumulate stale assets in the gh-pages history.
git add -A .

if git diff --cached --quiet; then
  echo "Nothing to publish — dist/ matches the deployed gh-pages already."
  exit 0
fi

git commit -m "$1"
git push origin gh-pages

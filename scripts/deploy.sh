#!/usr/bin/env bash
# Deploy the browsable matrix site to gh-pages → compliance.datasafe.dev.
#
# Manual deploy (HDS workspace policy: gh-pages branch scheme via deploy.sh,
# NOT the GitHub Actions workflow). dist/site/ is built by `npm run site`
# and pushed to the `gh-pages` branch checked out as a sibling worktree at
# ./dist-ghpages/.
set -euo pipefail

scriptsFolder=$(cd "$(dirname "$0")"; pwd)
cd "$scriptsFolder/.."

MAIN_BRANCH="main"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "$MAIN_BRANCH" ]; then
  echo "ERROR: Deploy only allowed from '$MAIN_BRANCH' (current: $BRANCH)."
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Working tree is not clean. Commit or stash first."
  git status --short
  exit 1
fi

WORKTREE="dist-ghpages"
if [ ! -d "$WORKTREE/.git" ]; then
  echo "Setting up '$WORKTREE' as a gh-pages checkout..."
  rm -rf "$WORKTREE"
  git clone -b gh-pages git@github.com:healthdatasafe/compliance-matrix.git "$WORKTREE"
fi

# Guard: the worktree must be on gh-pages (mirrors dev-site's deploy guard).
GH_BRANCH="$(git -C "$WORKTREE" branch --show-current)"
if [ "$GH_BRANCH" != "gh-pages" ]; then
  echo "ERROR: $WORKTREE is on branch '$GH_BRANCH', expected 'gh-pages'. Aborting."
  exit 1
fi

git pull --ff-only origin main

echo "Validating + building..."
npm run build:all
echo "Generating site..."
npm run site

if [ ! -s dist/site/index.html ]; then
  echo "ERROR: dist/site/index.html missing or empty after build — refusing to deploy."
  exit 1
fi

COMMIT_FULL="$(git rev-parse HEAD)"
COMMIT_SHORT="$(git rev-parse --short HEAD)"

# Sync site output into the gh-pages worktree (preserve its .git).
find "$WORKTREE" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -r dist/site/. "$WORKTREE"/
touch "$WORKTREE/.nojekyll"

cat > "$WORKTREE/version.json" <<VEOF
{
  "commit": "$COMMIT_FULL",
  "commitShort": "$COMMIT_SHORT",
  "branch": "$MAIN_BRANCH",
  "buildDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
VEOF

git -C "$WORKTREE" add -A
if git -C "$WORKTREE" diff --cached --quiet; then
  echo "No changes in $WORKTREE — nothing to deploy."
  exit 0
fi
git -C "$WORKTREE" commit -m "deploy $COMMIT_SHORT ($COMMIT_FULL)"
git -C "$WORKTREE" push origin gh-pages

echo "Deployed $COMMIT_SHORT to gh-pages."
echo "Live at: https://compliance.datasafe.dev"

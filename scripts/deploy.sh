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

# Fetch + ff-only merge FETCH_HEAD (not `pull --ff-only origin main`, which can
# spuriously fail "Cannot fast-forward to multiple branches" even when current).
git fetch origin main
git merge --ff-only FETCH_HEAD

# Refuse to build against a node_modules that does not match package-lock.json.
# A dependency bump pulled from git but never `npm install`ed produces a bundle
# linked against the OLD library while the source expects the new one - lint,
# tests and the build all stay green and the only symptom is a white screen in
# the browser, after deploy. (Broke app.hds.ngo 2026-08-25: hds-lib 1.3.4
# installed, 1.5.0 required.) Checks direct dependencies only, so nested
# dev-tool dedupe differences do not cause false alarms.
(node -e '
const fs = require("fs");
let want, have;
try { want = JSON.parse(fs.readFileSync("package-lock.json", "utf8")).packages || {}; } catch (e) { process.exit(0); }
try { have = JSON.parse(fs.readFileSync("node_modules/.package-lock.json", "utf8")).packages || {}; }
catch (e) { console.error("ERROR: node_modules/ is missing or was not installed by npm."); console.error("Run: npm install"); process.exit(1); }
const drift = [], linked = [];
for (const [p, meta] of Object.entries(want)) {
  if (!p || (p.match(/node_modules\//g) || []).length !== 1) continue;
  const got = have[p];
  if (!got) continue;
  const name = p.replace(/^node_modules\//, "");
  if (got.link && !meta.link) { linked.push(name + " -> " + got.resolved); continue; }
  if (meta.version && got.version && meta.version !== got.version) drift.push(name + ": installed " + got.version + ", lockfile wants " + meta.version);
}
if (linked.length) {
  console.error("ERROR: npm-linked dependencies present - the build would not match the lockfile.");
  linked.forEach(function (l) { console.error("  " + l); });
  console.error("Unlink before deploying: npm install");
}
if (drift.length) {
  console.error("ERROR: node_modules is out of sync with package-lock.json - refusing to build a stale bundle.");
  drift.slice(0, 10).forEach(function (d) { console.error("  " + d); });
  if (drift.length > 10) console.error("  ... and " + (drift.length - 10) + " more");
  console.error("Run: npm install");
}
if (linked.length || drift.length) process.exit(1);
')


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

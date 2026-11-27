#!/usr/bin/env bash
# Confirm GitHub Pages actually serves a deploy (B-2026-11-06-12).
#
# Usage: scripts/verify-pages.sh <owner/repo> <domain> <pushed-pages-sha> <app-commit>
#
# WHY: a push to the Pages branch is not a deploy. GitHub builds and publishes it in
# its own `pages-build-deployment` run, which can fail on its side (2026-11-06: the
# "Deploy to GitHub Pages" step timed out after 10 min) while the site keeps serving
# the previous build, and nothing reports it. So this waits until the site's own
# version.json names the app commit just built, re-runs a failed Pages run once (that
# failure was transient), and exits non-zero otherwise.
#
# VERIFY_PAGES_TIMEOUT (seconds, default 900) bounds the wait. Without `gh`, only the
# served version is checked.
set -uo pipefail

REPO="${1:-}"; DOMAIN="${2:-}"; PUSHED="${3:-}"; COMMIT="${4:-}"
[ -n "$REPO" ] && [ -n "$DOMAIN" ] && [ -n "$PUSHED" ] && [ -n "$COMMIT" ] || {
  echo "Usage: $0 <owner/repo> <domain> <pushed-pages-sha> <app-commit>" >&2; exit 2; }
TIMEOUT="${VERIFY_PAGES_TIMEOUT:-900}"

served () {
  curl -s --max-time 15 "https://${DOMAIN}/version.json?cb=$(date +%s)${RANDOM}" \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(String(JSON.parse(s).commit||''))}catch(e){}})" 2>/dev/null
}

echo "Waiting for https://${DOMAIN} to serve ${COMMIT:0:7} (Pages run of ${PUSHED:0:7} in ${REPO})..."
START=$(date +%s)
RERUN=0
while :; do
  if [ "$(served)" = "$COMMIT" ]; then
    echo "OK https://${DOMAIN} serves ${COMMIT:0:7} ($(( $(date +%s) - START ))s)"
    exit 0
  fi
  if command -v gh > /dev/null 2>&1; then
    read -r RUN_ID STATUS CONCLUSION <<< "$(gh run list --repo "$REPO" --workflow pages-build-deployment --commit "$PUSHED" --limit 1 \
      --json databaseId,status,conclusion --jq '.[0] | "\(.databaseId) \(.status) \(.conclusion)"' 2>/dev/null)"
    if [ "${STATUS:-}" = "completed" ] && [ "${CONCLUSION:-}" != "success" ]; then
      if [ "$RERUN" = 0 ]; then
        echo "Pages run ${RUN_ID} ended '${CONCLUSION}': re-running its failed jobs once"
        gh run rerun "$RUN_ID" --repo "$REPO" --failed > /dev/null 2>&1 || true
        RERUN=1
        sleep 10
      else
        echo "ERROR: Pages run ${RUN_ID} failed again ('${CONCLUSION}'). The push went through, the site does not serve it." >&2
        echo "       https://github.com/${REPO}/actions/runs/${RUN_ID}" >&2
        exit 1
      fi
    fi
  fi
  if [ $(( $(date +%s) - START )) -ge "$TIMEOUT" ]; then
    echo "ERROR: after ${TIMEOUT}s https://${DOMAIN} serves '$(served)', not ${COMMIT:0:7}. The push went through, the site does not serve it." >&2
    echo "       Check: gh run list --repo ${REPO} --workflow pages-build-deployment" >&2
    exit 1
  fi
  sleep 15
done

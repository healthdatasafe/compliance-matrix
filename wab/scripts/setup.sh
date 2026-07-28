#!/bin/sh
#
# setup.sh — DEPLOY DISABLED (HDS adaptation, 2026-07-28).
#
# This script (inherited from pryv/compliance-matrix) prepared wab/dist/ as a
# gh-pages checkout for publishing the SPA. It is disabled here because:
#   1. The inherited target was `pryv/compliance-matrix` gh-pages — not ours
#      to push to.
#   2. This repo's OWN gh-pages branch serves the static reference site at
#      compliance.datasafe.dev (built by scripts/site.js, deployed by
#      scripts/deploy.sh at the repo root). Publishing the SPA there would
#      clobber it.
#
# Local development works without any of this:
#   npm install
#   npm run dev      # copies ../dist/compliance.sqlite via copy-sqlite.js
#
# To deploy the SPA one day, decide a target first (own repo / subpath of the
# static site / separate domain), then rewrite this script for that target.

echo "WAB deploy is disabled — see the header of this script for why and how"
echo "to re-enable. Local dev: npm install && npm run dev"
exit 1

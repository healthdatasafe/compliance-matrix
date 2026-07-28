#!/bin/sh
#
# upload.sh — DEPLOY DISABLED (HDS adaptation, 2026-07-28).
#
# Inherited from pryv/compliance-matrix, where it pushed wab/dist/ to that
# repo's gh-pages. Disabled here: this repo's gh-pages serves the static
# reference site (compliance.datasafe.dev) and must not be clobbered by the
# SPA build. See wab/scripts/setup.sh header for the re-enable path.

echo "WAB deploy is disabled — see wab/scripts/setup.sh for why and how to"
echo "re-enable. Local dev: npm install && npm run dev"
exit 1

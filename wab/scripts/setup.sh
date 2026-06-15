#!/bin/sh
#
# setup.sh — prepare wab/dist/ as a git checkout of the
# `pryv/compliance-matrix` `gh-pages` branch so subsequent `npm run build`
# writes the SPA assets directly into a deployable working tree.
#
# Schema mirrors app-web-auth3/scripts/setup.sh (one-shot per machine):
#   1. install node modules
#   2. if dist/ exists without .git/, wipe it (left over from a non-deploy
#      build)
#   3. if dist/ is absent, clone the repo into it + checkout gh-pages
#
# Run once after cloning the repo, then use `npm run build && scripts/upload.sh
# "<commit msg>"` to publish.

set -e

scriptsFolder=$(cd "$(dirname "$0")"; pwd)
cd "$scriptsFolder/.."

echo "
Installing Node modules from 'package.json' if necessary...
"
npm install

if [ -d dist ] && [ ! -d dist/.git ]; then
  echo "
  Conflict with previous unpublished build, cleaning 'dist' folder."
  rm -rf dist/
fi

if [ ! -d dist ]; then
  echo "
Setting up 'dist' folder for publishing to GitHub Pages...
"
  git clone git@github.com:pryv/compliance-matrix.git dist
  cd dist
  git checkout gh-pages
fi

echo "
Setup is complete. Next steps:
  1. npm run build        # writes SPA + compliance.sqlite into dist/
  2. scripts/upload.sh \"<commit message>\"
"

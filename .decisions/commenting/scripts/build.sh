#!/usr/bin/env bash
# Builds the drawings with the dashboard's toolchain: links the dashboard's
# node_modules beside them for the build, and removes the link after.
set -euo pipefail
here="$(cd "$(dirname "$0")/../drawings" && pwd)"
dash="$(cd "$here/../../../apps/dashboard" && pwd)"
ln -sfn "$dash/node_modules" "$here/node_modules"
trap 'rm -f "$here/node_modules"' EXIT
cd "$here"
"$dash/node_modules/.bin/vite" build --config "$here/vite.config.ts" --logLevel warn

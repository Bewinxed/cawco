#!/usr/bin/env bash
# Readies a release host from a fresh clone, so the release runs with nothing set up by hand:
#
#   bash scripts/release-setup.sh                         installs what is missing, then checks everything
#   bash scripts/release-setup.sh --check                 installs nothing: prints what is missing, exits 1 if anything is
#   bash scripts/release-setup.sh --import-secrets PLACE  writes the release secrets from PLACE into the release env
#
# This bootstrap puts the Bun the release pins (scripts/build-binary.ts PINNED_BUN) at ~/.bun/bin/bun through Bun's
# own installer ("To install a specific version, pass the git tag to the install script",
# https://bun.com/docs/installation), then hands everything else to release-setup.ts, which runs on that Bun.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
pinned=$(sed -n 's/^export const PINNED_BUN = "\(.*\)";$/\1/p' "$repo/scripts/build-binary.ts")
[[ -n $pinned ]] || { echo "release-setup: scripts/build-binary.ts names no PINNED_BUN" >&2; exit 1; }
bun="$HOME/.bun/bin/bun"
have=$("$bun" --version 2> /dev/null || true)
if [[ $have != "$pinned" ]]; then
  if [[ ${1:-} == --check ]]; then
    echo "missing: Bun $pinned at $bun (it has ${have:-none}); bash scripts/release-setup.sh installs it"
    exit 1
  fi
  for tool in curl unzip; do
    command -v "$tool" > /dev/null || { echo "release-setup: Bun's installer needs $tool: sudo apt-get install -y $tool" >&2; exit 1; }
  done
  curl -fsSL https://bun.com/install | bash -s "bun-v$pinned"
fi
exec "$bun" "$repo/scripts/release-setup.ts" "$@"

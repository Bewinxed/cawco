#!/usr/bin/env bash
# Usage: proof-cache-prune.sh TREE
#
# Run by scripts/release.ts once a release is published, with the tree (`git rev-parse <commit>^{tree}`) it was built
# from. The proof cache (`CAWCO_PROOF_CACHE`, default ~/.cache/cawco-proof) then keeps, of the stage 2 builds
# build-stage2.ts kept per tree (`builds/<tree:16>-<key id>`), only the published tree's: every other tree's is a
# superseded release's, and the next release builds what it needs. The image store (`images`, a podman root kept
# between runs, podman-instance.sh) stays a cache: only its dangling images go, through `podman image prune` (no
# `--all`: an image a tag names, which is what every proof runs, is never touched), as the store's one instance under
# its writer's lock, as proof_images opens it.
set -euo pipefail
tree=${1:-}
[[ $tree =~ ^[0-9a-f]{40,64}$ ]] || { echo "Usage: proof-cache-prune.sh TREE (the published commit's tree id)" >&2; exit 2; }
source "$(dirname "$(realpath "$0")")/podman-instance.sh"

kept="${tree:0:16}-"
if [[ -d $PROOF_CACHE/builds ]]; then
  for build in "$PROOF_CACHE"/builds/*; do
    [[ -e $build ]] || continue
    name=$(basename "$build")
    if [[ $name == "$kept"* ]]; then
      echo "proof cache: kept builds/$name (the published tree)"
    else
      rm -rf "$build"
      echo "proof cache: removed builds/$name"
    fi
  done
fi

[[ -d $PROOF_STORE ]] || exit 0
(
  flock 8
  proof_store_database >&2 || exit 1
  p=$(podman_instance "$PROOF_STORE_INSTANCE" "$PROOF_STORE")
  trap 'podman_instance_closed "$PROOF_STORE_INSTANCE" "$PROOF_STORE"' EXIT
  pruned=$($p image prune --force)
  echo "proof cache: dangling images pruned from images/: $(printf '%s\n' "$pruned" | grep -c . || true)"
) 8> "$PROOF_CACHE/images.lock"

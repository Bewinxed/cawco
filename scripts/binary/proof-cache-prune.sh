#!/usr/bin/env bash
# Usage: proof-cache-prune.sh TREE
#
# Run by scripts/release.ts once a release is published, from the published commit's checkout, with its tree
# (`git rev-parse <commit>^{tree}`). The proof cache (`CAWCO_PROOF_CACHE`, default ~/.cache/cawco-proof) then keeps:
# - of the stage 2 builds build-stage2.ts kept per tree (`builds/<tree:16>-<key id>`), only the published tree's:
#   every other tree's is a superseded release's, and the next release builds what it needs;
# - in the image store (`images`, a podman root kept between runs, podman-instance.sh), the images this tree's recipes
#   name and the base image. Each proof's `--tags-only` writes its recipes and says their tags by the one rule
#   proof_images builds under (proof_image_tag); every other `localhost/cawco-proof-*` image is a recipe this tree
#   no longer has, and is removed (proof_superseded_images). Then the dangling images (a removed image's build stage
#   among them) go, through `podman image prune` (no `--all`). All of it as the store's one instance, under its
#   writer's lock, as proof_images opens it.
set -euo pipefail
tree=${1:-}
[[ $tree =~ ^[0-9a-f]{40,64}$ ]] || { echo "Usage: proof-cache-prune.sh TREE (the published commit's tree id)" >&2; exit 2; }
here=$(dirname "$(realpath "$0")")
# shellcheck source=base-image.sh
source "$here/base-image.sh"
# shellcheck source=podman-instance.sh
source "$here/podman-instance.sh"

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
recipes=$(mktemp -d "${TMPDIR:-/tmp}/proof-recipes.XXXXXX")
trap 'rm -rf "$recipes"' EXIT
said=$({ bash "$here/prove-stage1.sh" --tags-only "$recipes/stage1" && bash "$here/prove-stage2.sh" --tags-only "$recipes/stage2"; })
current=()
for name in stage1-clean stage1-systemd host machine; do
  tag=$(sed -n "s/^$name=//p" <<< "$said")
  [[ $tag == localhost/cawco-proof-$name:* ]] || { echo "proof cache: the recipes did not say the $name image's tag (they said: $said); no image is removed" >&2; exit 1; }
  current+=("$tag")
  echo "proof cache: kept $tag (this tree's $name recipe)"
done
(
  flock 8
  proof_store_database >&2 || exit 1
  p=$(podman_instance "$PROOF_STORE_INSTANCE" "$PROOF_STORE")
  trap 'podman_instance_closed "$PROOF_STORE_INSTANCE" "$PROOF_STORE"' EXIT
  superseded=$($p images --format '{{.Repository}}:{{.Tag}}' | proof_superseded_images "${current[@]}")
  for name in $superseded; do
    $p rmi "$name" > /dev/null
    echo "proof cache: removed $name (a recipe this tree no longer has)"
  done
  pruned=$($p image prune --force)
  echo "proof cache: dangling images pruned from images/: $(printf '%s\n' "$pruned" | grep -c . || true)"
) 8> "$PROOF_CACHE/images.lock"

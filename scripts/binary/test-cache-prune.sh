#!/usr/bin/env bash
# Usage: test-cache-prune.sh INPUTS
#
# Run by scripts/release.ts once a release is published, from the published commit's checkout, with the key of its
# test inputs (test-inputs.ts `testInputsKey`). The test cache (`CAWCO_TEST_CACHE`, default ~/.cache/cawco-test)
# then keeps:
# - of the end-to-end builds build-e2e.ts kept per test inputs (`builds/<inputs:16>-<key id>`), only the published
#   commit's: every other is a superseded release's, and the next release builds what it needs;
# - in the image store (`images`, a podman root kept between runs, podman-instance.sh), the images this commit's recipes
#   name and the base image. Each test's `--tags-only` writes its recipes and says their tags by the one rule
#   test_images builds under (test_image_tag); every other `localhost/cawco-test-*` image is a recipe this tree
#   no longer has, and is removed (test_superseded_images). Then the dangling images (a removed image's build stage
#   among them) go, through `podman image prune` (no `--all`). All of it as the store's one instance, under its
#   writer's lock, as test_images opens it.
set -euo pipefail
inputs=${1:-}
[[ $inputs =~ ^[0-9a-f]{16,64}$ ]] || { echo "Usage: test-cache-prune.sh INPUTS (the published commit's test inputs key)" >&2; exit 2; }
here=$(dirname "$(realpath "$0")")
# shellcheck source=base-image.sh
source "$here/base-image.sh"
# shellcheck source=podman-instance.sh
source "$here/podman-instance.sh"

kept="${inputs:0:16}-"
if [[ -d $TEST_CACHE/builds ]]; then
  for build in "$TEST_CACHE"/builds/*; do
    [[ -e $build ]] || continue
    name=$(basename "$build")
    if [[ $name == "$kept"* ]]; then
      echo "test cache: kept builds/$name (the published commit's test inputs)"
    else
      rm -rf "$build"
      echo "test cache: removed builds/$name"
    fi
  done
fi

[[ -d $TEST_STORE ]] || exit 0
recipes=$(mktemp -d "${TMPDIR:-/tmp}/test-recipes.XXXXXX")
trap 'rm -rf "$recipes"' EXIT
said=$({ bash "$here/smoke-test.sh" --tags-only "$recipes/smoke" && bash "$here/e2e-test.sh" --tags-only "$recipes/e2e"; })
current=()
for name in smoke-systemd host machine; do
  tag=$(sed -n "s/^$name=//p" <<< "$said")
  [[ $tag == localhost/cawco-test-$name:* ]] || { echo "test cache: the recipes did not say the $name image's tag (they said: $said); no image is removed" >&2; exit 1; }
  current+=("$tag")
  echo "test cache: kept $tag (this tree's $name recipe)"
done
(
  flock 8
  test_store_database >&2 || exit 1
  p=$(podman_instance "$TEST_STORE_INSTANCE" "$TEST_STORE")
  trap 'podman_instance_closed "$TEST_STORE_INSTANCE" "$TEST_STORE"' EXIT
  superseded=$($p images --format '{{.Repository}}:{{.Tag}}' | test_superseded_images "${current[@]}")
  for name in $superseded; do
    $p rmi "$name" > /dev/null
    echo "test cache: removed $name (a recipe this tree no longer has)"
  done
  pruned=$($p image prune --force)
  echo "test cache: dangling images pruned from images/: $(printf '%s\n' "$pruned" | grep -c . || true)"
) 8> "$TEST_CACHE/images.lock"

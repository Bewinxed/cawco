#!/usr/bin/env bash
# Prints the stamp of apps/apple as this checkout holds it now: the git tree
# hash of its files, uncommitted edits and new files included (.gitignore
# honoured), written through a throwaway index so the real one is untouched.
# The same content always prints the same stamp, on any machine.
#
# build-both.sh writes it beside each simulator app it builds
# (CawCo.app.tree); scripts/lib/apple-app.ts compares it with this tree's
# before a probe runs that app, and refuses one built from other code.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
INDEX=$(mktemp "${TMPDIR:-/tmp}/cawco-tree-stamp.XXXXXX")
trap 'rm -f "$INDEX"' EXIT
# Starting from the real index skips hashing every unchanged file again.
cp "$(git -C "$ROOT" rev-parse --path-format=absolute --git-path index)" "$INDEX"
GIT_INDEX_FILE=$INDEX git -C "$ROOT" add -A -- apps/apple
GIT_INDEX_FILE=$INDEX git -C "$ROOT" write-tree --prefix=apps/apple/

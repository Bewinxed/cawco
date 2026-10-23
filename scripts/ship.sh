#!/usr/bin/env bash
# The one way a commit on main becomes a published release, for the nightly and for the agent that fixed something
# (the hub runs it after a landing whose finish_item says `ship`, as gate.md's `Ship:` line declares it):
#
#   bash scripts/ship.sh --commit SHA --notes FILE [--channel nightly|stable] [--tag vX.Y.Z]
#       Checks Apple's notarization limit has room for a release (release-quota.ts; refused in its words, exit 2),
#       then starts the release as a user unit of its own, `cawco-ship-<sha12>-<time>`, which outlives whoever asked
#       (the release restarts the hub it is asked from), prints the unit's name and returns.
#   bash scripts/ship.sh --run --commit SHA --notes FILE [--channel …] [--tag …]
#       What that unit runs: a clean worktree of the commit, its frozen install, and from it
#       `release.ts --commit SHA --channel … --notes … --output ~/.cache/cawco-release/out --publish`; the worktree is
#       removed when the release ends, whichever way. release.ts keeps its own lock and its queue of one: a request
#       while a release runs is built next, the newest one winning.
#
# A fresh clone on a fresh machine runs this after `bash scripts/release-setup.sh` and its secrets import alone.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
run=0 commit= notes= channel=nightly tag=
while (($#)); do
  case $1 in
    --run) run=1; shift ;;
    --commit) commit=${2:-}; shift 2 ;;
    --notes) notes=${2:-}; shift 2 ;;
    --channel) channel=${2:-}; shift 2 ;;
    --tag) tag=${2:-}; shift 2 ;;
    *) echo "ship.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done
[[ -n $commit && ($channel == stable || -f $notes) && ($channel == nightly || $channel == stable) ]] ||
  { echo "usage: bash scripts/ship.sh [--run] --commit SHA --notes FILE (a nightly's) [--channel nightly|stable] [--tag vX.Y.Z]" >&2; exit 2; }
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
cache="$HOME/.cache/cawco-release"

if ((run == 0)); then
  said=$(bun "$here/release-quota.ts") || { echo "$said"; exit 2; }
  git -C "$repo" fetch --quiet origin
  sha=$(git -C "$repo" rev-parse --verify "$commit^{commit}")
  git -C "$repo" merge-base --is-ancestor "$sha" origin/main ||
    { echo "$sha is not on origin/main." >&2; exit 2; }
  unit="cawco-ship-${sha:0:12}-$(date +%s)"
  # The notes are kept with the unit: whoever handed them over may remove theirs as soon as this returns.
  kept=
  if [[ -n $notes ]]; then
    mkdir -p "$cache/notes"
    kept="$cache/notes/$unit.md"
    cp "$notes" "$kept"
  fi
  # A stop is the release's to carry out, in order (release.ts `stop`): KillMode=mixed sends its SIGTERM to this
  # script alone, which hands it on, and SIGKILL to what remains only once this script has ended or TimeoutStopSec
  # has passed (systemd.kill(5)). Under the default, control-group, every process of the release took the SIGTERM at
  # once, its gh uploads failed as steps beside the stop, and the 90 s default killed a cleanup that may wait 180 s
  # for its proofs (STOP_GRACE_MS) and then clears trees, staging and the draft.
  systemd-run --user --collect --quiet --unit="$unit" --working-directory="$repo" \
    --property=KillMode=mixed --property=TimeoutStopSec=300 \
    --setenv=PATH="$PATH" --setenv=HOME="$HOME" \
    bash "$here/ship.sh" --run --commit "$sha" ${kept:+--notes "$kept"} --channel "$channel" ${tag:+--tag "$tag"}
  echo "Shipping $sha as $unit (journalctl --user -u $unit)"
  exit 0
fi

sha=$(git -C "$repo" rev-parse --verify "$commit^{commit}")
runner="$HOME/.worktrees/release-runner-${sha:0:12}-$$"
cleanup() {
  git -C "$repo" worktree remove --force "$runner" > /dev/null 2>&1 || rm -rf "$runner"
  git -C "$repo" worktree prune
}
trap cleanup EXIT
# A stop (the unit's SIGTERM, which KillMode=mixed sends to this shell alone) goes to the release, and the runner is
# removed only once the release has ended: release.ts runs from the runner and clears its own trees, staging, proofs
# and draft on the way out. Removing the runner under it left its cleanup with no cwd ("posix_spawn 'git'" ENOENT,
# nightly 5186). Before the release starts, a stop ends the shell once the command in hand returns.
release=
stop() {
  if [[ -n $release ]]; then
    kill -s "$1" "$release" 2> /dev/null || true
  else
    exit "$2"
  fi
}
trap 'stop TERM 143' TERM
trap 'stop INT 130' INT
git -C "$repo" worktree add --quiet --detach "$runner" "$sha"
(cd "$runner" && bun install --frozen-lockfile)
cd "$runner"
bun scripts/release.ts --commit "$sha" --channel "$channel" ${notes:+--notes "$notes"} \
  --output "$cache/out" ${tag:+--tag "$tag"} --publish &
release=$!
# A trapped signal cuts `wait` short (status above 128) while the release is still clearing: wait on until it is gone.
until wait "$release"; status=$?; ((status <= 128)) || ! kill -0 "$release" 2> /dev/null; do :; done
exit "$status"

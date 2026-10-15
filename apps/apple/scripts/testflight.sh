#!/usr/bin/env bash
# Run from the repository on obelisk; all credentials stay on the Mac.
# Every upload names its commit and carries end-user notes (docs/releases/README.md):
#   testflight.sh [--mac] --commit <sha> --notes <file>
# The commit is proven here before anything is archived: the repo's checks at that commit
# (typecheck, which holds the wire to every shipped build, plus migrations, roles and tools;
# lint), and its app against the newest published nightly's hub. The archive is the app's
# compile; nothing uploads unless it succeeds. The build is recorded before it uploads: the
# annotated tag `testflight-<ios|mac>-<build>` on the commit, pushed to origin, which every
# later wire check reads (packages/hub/scripts/shipped.ts), and a last line of its What to Test.
# A person's shell only: a CawCo workspace holds no SSH key and reaches no other machine.
set -euo pipefail
if [[ -n ${CAWCO_WORKSPACE:-} ]]; then
  echo "testflight.sh reaches the Mac over ssh, and this CawCo workspace reaches no other machine. Run it from the orchestrator's own shell on obelisk; a build check names the Mac on the item's check instead." >&2
  exit 2
fi
cd "$(git rev-parse --show-toplevel)"
SSH=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes mac)
USAGE='usage: testflight.sh [--mac] --commit <sha> --notes <file> | --status | --attach <build> --notes <file> | --set-notes <build> <file> | --record <build> <sha> | --expire <build>'
# --mac: the Mac Catalyst build on the same App Store record, its own TestFlight train.
PLATFORM=()
TRAIN=ios
if [[ ${1:-} == --mac ]]; then
  PLATFORM=(--mac)
  TRAIN=mac
  shift
fi
# Copies a notes file to the Mac for this run; the copy is removed when it ends.
REMOTE_NOTES=
send_notes() {
  [[ -s $1 ]] || { echo "Notes file $1 is missing or empty" >&2; exit 2; }
  REMOTE_NOTES=$("${SSH[@]}" 'f=$(mktemp -t cawco-notes); cat > "$f"; echo "$f"' < "$1")
  trap '"${SSH[@]}" rm -f "$REMOTE_NOTES"' EXIT
}
# A build's record: the annotated tag on its commit.
tag_of() { echo "testflight-$TRAIN-$1"; }
recorded() {
  git fetch --quiet --tags origin
  git rev-parse --verify --quiet "$(tag_of "$1")^{commit}" || { echo "TestFlight $TRAIN build $1 has no record: testflight.sh ${PLATFORM[*]} --record $1 <sha>" >&2; exit 2; }
}
# `record <build> <sha> [replace]`. An archive's number is one App Store Connect has not used
# (testflight.py `next_number`), so a tag already on it was left by an upload that never
# landed: the upload replaces it. A backfill never replaces a record.
record() {
  local build=$1 sha=$2 replace=${3:-} tag existing
  [[ $build =~ ^[0-9]{8}(\.[0-9]+)?$ ]] || { echo "A build number is yyyymmdd or yyyymmdd.n, not $build" >&2; exit 2; }
  tag=$(tag_of "$build")
  if existing=$(git rev-parse --verify --quiet "$tag^{commit}") && [[ $existing != "$sha" && -z $replace ]]; then
    echo "$tag already records $existing, not $sha" >&2
    exit 2
  fi
  git tag --force -a "$tag" "$sha" -m "TestFlight $TRAIN build $build" -m "Commit: $sha"
  git push --quiet --force origin "refs/tags/$tag"
  echo "RECORDED $tag $sha"
}
# Seconds a step took, as every release proof step prints them.
took() { awk -v a="$1" -v b="$EPOCHREALTIME" 'BEGIN { printf "%.1f s", b - a }'; }
case ${1:-} in
  --status)
    "${SSH[@]}" '/usr/bin/python3 - --status' "${PLATFORM[@]}" < apps/apple/scripts/testflight.py
    exit ;;
  --commit)
    [[ $# -eq 4 && $3 == --notes ]] || { echo "$USAGE" >&2; exit 2; }
    COMMIT=$2
    NOTES=$4 ;;
  --attach)
    [[ $# -eq 4 && $3 == --notes ]] || { echo "$USAGE" >&2; exit 2; }
    sha=$(recorded "$2")
    send_notes "$4"
    "${SSH[@]}" '/usr/bin/python3 - --attach' "$2" --notes "$REMOTE_NOTES" --commit "$sha" "${PLATFORM[@]}" < apps/apple/scripts/testflight.py
    exit ;;
  --set-notes)
    [[ $# -eq 3 ]] || { echo "$USAGE" >&2; exit 2; }
    sha=$(recorded "$2")
    send_notes "$3"
    "${SSH[@]}" '/usr/bin/python3 - --set-notes' "$2" "$REMOTE_NOTES" --commit "$sha" "${PLATFORM[@]}" < apps/apple/scripts/testflight.py
    exit ;;
  --record)
    # A build uploaded before builds recorded their commit.
    [[ $# -eq 3 ]] || { echo "$USAGE" >&2; exit 2; }
    git fetch --quiet --tags origin
    record "$2" "$(git rev-parse --verify "$3^{commit}")"
    exit ;;
  --expire)
    # No tester can install it from now on, and no wire check holds a hub to it.
    [[ $# -eq 2 ]] || { echo "$USAGE" >&2; exit 2; }
    "${SSH[@]}" '/usr/bin/python3 - --expire' "$2" "${PLATFORM[@]}" < apps/apple/scripts/testflight.py
    tag=$(tag_of "$2")
    if [[ -n $(git ls-remote --tags origin "refs/tags/$tag") ]]; then
      git push --quiet origin ":refs/tags/$tag"
    fi
    if git rev-parse --verify --quiet "refs/tags/$tag" > /dev/null; then
      git tag --delete "$tag" > /dev/null
    fi
    echo "UNRECORDED $tag"
    exit ;;
  *) echo "TestFlight builds name their commit and need end-user notes: --commit <sha> --notes <file>" >&2; echo "$USAGE" >&2; exit 2 ;;
esac
mkdir -p "$HOME/.cache"
exec 9>"$HOME/.cache/cawco-testflight.lock"
flock -n 9 || { echo 'TestFlight upload already running' >&2; exit 1; }
git fetch --quiet --tags origin
REV=$(git rev-parse --verify "$COMMIT^{commit}")
git merge-base --is-ancestor "$REV" origin/main || { echo "$REV is not on origin/main" >&2; exit 2; }
send_notes "$NOTES"
# The commit's own checks, in a checkout of it, before anything reaches the Mac.
CHECKOUT="$HOME/.cache/cawco-testflight/checkout-${REV:0:12}"
rm -rf "$CHECKOUT"
git worktree prune
git worktree add --quiet --detach "$CHECKOUT" "$REV"
trap '"${SSH[@]}" rm -f "$REMOTE_NOTES"; git worktree remove --force "$CHECKOUT"' EXIT
(
  cd "$CHECKOUT"
  started=$EPOCHREALTIME
  bun install --frozen-lockfile > /dev/null
  bun run typecheck
  bun run lint
  echo "repo checks at ${REV:0:12}: $(took "$started")"
  started=$EPOCHREALTIME
  # The hub this app meets on its first day: the newest published nightly's.
  nightly=$(bun packages/hub/scripts/shipped.ts | head -n 1 | cut -f 1)
  bun packages/hub/scripts/wire-compat.ts --app "$REV" --hub "$nightly"
  echo "app at ${REV:0:12} against $nightly's hub: $(took "$started")"
)
# A quiet window belongs to another build track. Wait before touching build inputs.
while [[ -n $("${SSH[@]}" 'find ~/build/.mac-hold -mmin -25 2>/dev/null') ]]; do
  echo 'WAITING for the Mac quiet window'
  sleep 60
done
"${SSH[@]}" 'rm -rf ~/build/cawco-testflight/source; mkdir -p ~/build/cawco-testflight/source'
git archive "$REV" | "${SSH[@]}" 'tar -xf - -C ~/build/cawco-testflight/source'
echo "ARCHIVING $REV $TRAIN"
# The archive is an Xcode build: it holds the Mac build slot every build-both.sh
# and mac-slot.sh caller shares. Export, upload and App Store Connect's
# processing run after, with the slot free.
ARCHIVE_LOG=$(mktemp)
"${SSH[@]}" 'bash ~/build/cawco-testflight/source/apps/apple/scripts/mac-slot.sh build -- /usr/bin/python3 - --archive' "${PLATFORM[@]}" < apps/apple/scripts/testflight.py | tee "$ARCHIVE_LOG"
BUILD=$(awk '$1 == "BUILD_NUMBER" { print $3 }' "$ARCHIVE_LOG" | tail -n 1)
rm -f "$ARCHIVE_LOG"
[[ -n $BUILD ]] || { echo "The archive named no build number" >&2; exit 1; }
# Recorded before it can reach a tester.
record "$BUILD" "$REV" replace
"${SSH[@]}" '/usr/bin/python3 - --upload-archive --notes' "$REMOTE_NOTES" --commit "$REV" "${PLATFORM[@]}" < apps/apple/scripts/testflight.py

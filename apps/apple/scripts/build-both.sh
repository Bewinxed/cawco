#!/usr/bin/env bash
# Builds the CawCo app on the Mac for an iPhone simulator, then for the Mac
# (Mac Catalyst), and
# proves each build starts and stays up for 8 s. A launch-time abort fails it.
# Run from anywhere in the repo: bash apps/apple/scripts/build-both.sh [ios|macos] [--compile-only|--gate]
# With no argument it builds both and prints BUILT iOS, LAUNCHED iOS,
# BUILT macOS, LAUNCHED macOS, BUILT iOS 18.5, LAUNCHED iOS 18.5.
# `ios` proves both iOS runtimes; `macos` proves only macOS.
# A landing check runs `build-both.sh ios`: it launches on the floor (iOS
# 18.5) and the newest runtime, so a binary that dies at launch fails it.
# `--compile-only` never launches; it is for a workspace that cannot. Its
# generic iOS Simulator build compiles arm64 alone: the Mac's simulators are
# Apple silicon, and the x86_64 slice the generic destination adds doubles
# the compile for code no simulator here runs.
# `--gate` is the Apple build gate's (packages/hub apple-gate.ts): it
# compiles as `--compile-only` does, in the one build root `gate` every
# item's gate shares instead of the checkout's own. That root stays warm
# between items, so Xcode rebuilds only what the item's tree changed against
# the last tree it compiled: the rsync below makes the root's apps/apple
# that tree exactly (--checksum --delete; a changed file is written anew,
# an unchanged one keeps its mtime), and Xcode's incremental build follows.
# No probe reads that root; a workspace's own builds stay in its own.
# Exits non-zero at the first failure. It starts only with room for a whole
# build root: below 10 GB free (CAWCO_MIN_FREE_GB) where it builds, it exits 3
# with one sentence naming the free space and the biggest folders under
# CawCo's workspace roots (scripts/lib/disk-room.sh).
#
# The builds run one after the other into one DerivedData: two xcodebuilds
# sharing it lock its build.db. -skipPackagePluginValidation lets the
# OpenAPIGenerator build plugin (CawCoAPI) run without Xcode's trust prompt.
# Each workspace owns ~/build/cawco-apple/<workspace>, including DerivedData
# and logs; `--gate` builds in ~/build/cawco-apple/gate. Mac-side locks cover retirement, rsync and both builds; a
# second build of the same workspace, and builds from different
# workspaces, wait their turn.
# The Mac build slot (one Xcode build at a time) is one lock for every caller,
# in ~/.cawco/workspace-cache/xdg/cawco-apple/.locks: workspaces, a person's
# or the orchestrator's SSH, and TestFlight's archive all wait on it. Each
# launch boots its simulator in one of the Mac's two simulator slots.
# Simulators and builds outside build-both.sh go through mac-slot.sh.
# Only processes this script starts are stopped: the Mac-side build runs in
# its own process group, which ends (TERM, then KILL) when the SSH link drops.
# Run on the Mac itself, the Mac side runs here through the same steps and
# the same link, with no SSH, under one root for every caller,
# ~/.cawco/workspace-cache/xdg/cawco-apple: a CawCo workspace's own cache,
# where its boundary lets it write builds, and the same folder from the
# owner's shell, so the app a probe finds is the one this script last built
# (scripts/lib/apple-app.ts). Each simulator build leaves CawCo.app.tree
# beside the app, the stamp of apps/apple it was built from
# (scripts/tree-stamp.sh); a probe refuses an app whose stamp is not its tree's.
# The SSH hop is for a person's shell on Linux only. A CawCo workspace holds
# no key and reaches no other machine: there the check names the Mac and the
# hub runs this script in a workspace on it.
set -euo pipefail

if [[ -n ${CAWCO_MAC_SLOT:-} ]]; then
  echo "build-both.sh takes the Mac build slot itself; inside a mac-slot.sh $CAWCO_MAC_SLOT slot it would wait on its own caller. Run it on its own." >&2
  exit 2
fi
if [[ $(uname -s) == Darwin ]]; then
  MAC=(bash --norc -c)
  APPLE_ROOT=$HOME/.cawco/workspace-cache/xdg/cawco-apple
elif [[ -n ${CAWCO_WORKSPACE:-} ]]; then
  echo "build-both.sh builds on the Mac, and this CawCo workspace reaches no other machine. Name the Mac on the check instead, e.g. { machine: \"Omars-MacBook-Pro\", command: \"bash apps/apple/scripts/build-both.sh ios\", expect: \"LAUNCHED iOS 18.5\" }, or delegate the work to the Mac." >&2
  exit 2
else
  MAC=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 mac)
  # Empty: the Mac side's own ~/build/cawco-apple.
  APPLE_ROOT=
fi
ROOT=$(git rev-parse --show-toplevel)
PLATFORM=${1:-both}
COMPILE_ONLY=${2:-}
[[ -z $COMPILE_ONLY || $COMPILE_ONLY == --compile-only || $COMPILE_ONLY == --gate ]] || { echo "usage: build-both.sh [ios|macos|both] [--compile-only|--gate]" >&2; exit 2; }
BUILD=$(basename "$ROOT")
if [[ $ROOT == "$HOME/cockpit" ]]; then BUILD=main; fi
if [[ $COMPILE_ONLY == --gate ]]; then
  BUILD=gate
  COMPILE_ONLY=--compile-only
fi
[[ $BUILD =~ ^[a-zA-Z0-9._-]+$ ]] || { echo "invalid workspace name: $BUILD" >&2; exit 2; }
REMOTE=build/cawco-apple/$BUILD/apps/apple

# Every path below is the repo root's: a caller anywhere in the repo (a check
# run from apps/apple) builds the same tree.
cd "$ROOT"
[[ -f apps/apple/project.yml ]] || { echo "no apps/apple/project.yml under $ROOT" >&2; exit 2; }
case $PLATFORM in
  ios | macos | both) ;;
  *) echo "usage: build-both.sh [ios|macos]" >&2; exit 2 ;;
esac
# Mac Catalyst signs (scripts/signed.sh), --compile-only too, and signing keys
# never reach a CawCo workspace: there only the iOS Simulator builds run.
if [[ -n ${CAWCO_WORKSPACE:-} && $PLATFORM != ios ]]; then
  echo "Signed builds, device builds and TestFlight run from the orchestrator's shell, not a CawCo workspace: hand the commit to your parent. Here, build the iOS Simulator only: build-both.sh ios [--compile-only]." >&2
  exit 2
fi
# Built on this Mac, the build is a heavy run here: one of this machine's slots
# (scripts/lib/heavy-run.ts) for this shell's life. Over SSH the build is the
# Mac's, behind its build slot.
if [[ $(uname -s) == Darwin ]]; then
  # shellcheck source=../../../scripts/lib/heavy-run.sh
  source scripts/lib/heavy-run.sh
  heavy_run bash apps/apple/scripts/build-both.sh "$@"
fi

# Pass the authoritative workspace inventory from this host, never the Mac's
# copies. Fail before retirement if the inventory cannot be read. The gate's
# root is the repository's, never a spent workspace's.
LIVE=(main gate "$BUILD")
[[ -d $HOME/.worktrees ]] || { echo "missing workspace inventory: $HOME/.worktrees" >&2; exit 2; }
for workspace in "$HOME"/.worktrees/*; do
  [[ ! -d $workspace ]] || LIVE+=("$(basename "$workspace")")
done

read -r -d '' PREPARE <<'EOF' || true
set -euo pipefail
BUILD=$1
shift
ROOT=${APPLE_ROOT:-$HOME/build/cawco-apple}
mkdir -p "$ROOT/.locks"
LOCK="$ROOT/.locks/$BUILD"
command -v shlock >/dev/null || { echo "shlock is required for Apple workspace builds" >&2; exit 2; }
# The one build slot every caller shares (mac-slot.sh holds the same lock).
SLOTS="$HOME/.cawco/workspace-cache/xdg/cawco-apple/.locks"
mkdir -p "$SLOTS"
MACHINE_LOCK="$SLOTS/.machine"
MACHINE_OWNER="$SLOTS/.machine.owner"
WAIT_PID=
BUILD_PID=
GO=
# The build runs in its own process group (leader BUILD_PID): TERM the whole
# group, then KILL whatever is left after the grace period.
stop_build() {
  [[ -n $BUILD_PID ]] || return 0
  kill -TERM -- "-$BUILD_PID" 2>/dev/null || kill -TERM "$BUILD_PID" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    kill -0 -- "-$BUILD_PID" 2>/dev/null || kill -0 "$BUILD_PID" 2>/dev/null || break
    sleep 0.5
  done
  kill -KILL -- "-$BUILD_PID" 2>/dev/null || kill -KILL "$BUILD_PID" 2>/dev/null || true
  BUILD_PID=
}
release_locks() {
  stop_build
  if [[ -n $WAIT_PID ]]; then kill "$WAIT_PID" 2>/dev/null || true; fi
  # Only this shell's own: a run that leaves while waiting never frees the holder's.
  if [[ -f $LOCK && $(cat "$LOCK" 2>/dev/null) == $$ ]]; then rm -f "$LOCK"; fi
  if [[ -f $MACHINE_LOCK && $(<"$MACHINE_LOCK") == $$ ]]; then
    rm -f "$MACHINE_OWNER" "$MACHINE_LOCK"
  fi
}
trap release_locks EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
trap 'GO=1' USR1

# The caller holds stdin open for the whole run and writes a heartbeat line
# every 10 s, plus `GO <stamp>` once the sync is done: the stamp of the
# apps/apple it synced (tree-stamp.sh), kept in $ROOT/$BUILD/tree for the
# build to write beside each simulator app. EOF, or no line for 45 s, means
# the caller has left: TERM this shell, whose EXIT trap ends the build group
# and releases the locks.
(
  while IFS= read -r -t 45 line; do
    if [[ $line == "GO "* ]]; then
      printf '%s\n' "${line#GO }" >"$ROOT/$BUILD/tree"
      kill -USR1 "$$"
    fi
  done
  kill -TERM "$$"
) <&0 &
WAIT_PID=$!
# One build per build root: a second run waits its turn (two of an item's
# checks may start together; every item's gate shares the root `gate`), and
# a caller that leaves ends the wait above. The wait is a build-slot queue
# (the queue marker below), so a check's clock stands through it.
next_notice=0
waited=
until shlock -p $$ -f "$LOCK"; do
  now=$(date +%s)
  if (( now >= next_notice )); then
    echo "CAWCO-QUEUE wait build: build root $BUILD, held by process $(cat "$LOCK" 2>/dev/null || echo unknown)"
    waited=1
    next_notice=$((now + 60))
  fi
  sleep 5
done
[[ -z $waited ]] || echo "CAWCO-QUEUE held build"
next_notice=0
waited=
until shlock -p $$ -f "$MACHINE_LOCK"; do
  now=$(date +%s)
  if (( now >= next_notice )); then
    holder=unknown
    held_since=$now
    if [[ -f $MACHINE_OWNER ]]; then
      read -r held_since holder <"$MACHINE_OWNER" || true
    fi
    [[ $held_since =~ ^[0-9]+$ ]] || held_since=$now
    # The queue marker (mac-slot.sh, core harness.ts QUEUE_MARKER): a CawCo
    # check's clock stands from this line to the held line.
    echo "CAWCO-QUEUE wait build: $holder for $((now - held_since)) s"
    waited=1
    next_notice=$((now + 60))
  fi
  sleep 5
done
printf '%s %s\n' "$(date +%s)" "$BUILD build-both.sh (pid $$)" >"$MACHINE_OWNER"
[[ -z $waited ]] || echo "CAWCO-QUEUE held build"

retire() {
  local directory=$1 lock=$2 size
  [[ -e $directory && ! -L $directory ]] || return 0
  # Active old scripts have no lock: recursive mtimes protect their work too.
  [[ -z $(find "$directory" -mmin -180 -print -quit) ]] || return 0
  shlock -p $$ -f "$lock" || return 0
  size=$(du -sh "$directory" | awk '{print $1}')
  echo "RETIRED $directory ($size)"
  rm -rf -- "$directory"
  rm -f "$lock"
}
for directory in "$ROOT"/* "$ROOT"/.[!.]* "$ROOT"/..?*; do
  [[ -e $directory ]] || continue
  name=${directory##*/}
  [[ $name != .locks ]] || continue
  live=0
  for workspace in "$@"; do [[ $name != "$workspace" ]] || live=1; done
  [[ $live == 1 ]] || retire "$directory" "$ROOT/.locks/$name"
done
# The legacy dirs are the SSH side's; a run on the Mac itself (a workspace's
# boundary among them) leaves them alone.
if [[ -z ${APPLE_ROOT:-} ]]; then
  for directory in "$HOME"/build/cawco-apple-*; do
    retire "$directory" "$ROOT/.locks/legacy-${directory##*/}"
  done
fi
# Room for a whole build root before anything is synced or built, once the
# spent ones above are gone (scripts/lib/disk-room.sh): a refusal here, not
# a linker dying mid-build with errno 28.
eval "$DISK_ROOM"
disk_room "$ROOT" "build-both.sh $PLATFORM ($BUILD)"
mkdir -p "$ROOT/$BUILD/apps/apple"
rm -f "$ROOT/$BUILD/tree"
echo READY
# The same SSH process keeps the locks while the caller rsyncs; GO starts the
# build. A failed sync ends the caller, and its EOF releases the locks.
until [[ -n $GO ]]; do wait "$WAIT_PID" || true; done
perl -e 'setpgrp(0, 0); exec @ARGV or die "exec: $!\n"' \
  bash --norc -c "$BUILD_SCRIPT" build-both "$ROOT/$BUILD/apps/apple" "$PLATFORM" "$BUILD" "$COMPILE_ONLY" "$ROOT" </dev/null &
BUILD_PID=$!
status=0
wait "$BUILD_PID" || status=$?
BUILD_PID=
exit "$status"
EOF

read -r -d '' BUILD_SCRIPT <<'EOF' || true
set -euo pipefail
cd "$1"
PLATFORM=$2
BUILD=$3
COMPILE_ONLY=$4
DD="$5/$BUILD/DerivedData"
LOGS="$5/$BUILD/logs"
mkdir -p "$LOGS"
SETTLE=8
# The apps/apple synced here, as the caller stamped it with GO.
TREE=$(<"$5/$BUILD/tree")
# This build holds the Mac build slot: mac-slot.sh may take a simulator slot
# inside it.
export CAWCO_MAC_SLOT=build DD LOGS SETTLE TREE
trap 'exit 130' INT
trap 'exit 143' TERM HUP
XCODEGEN=$(command -v xcodegen || echo /opt/homebrew/bin/xcodegen)
"$XCODEGEN" generate --quiet

build() { # <destination> <label> [signed]
  # A build that signs with an identity (Mac Catalyst) runs with the CI
  # keychain unlocked, as TestFlight's do (scripts/signed.sh); a simulator's
  # needs no identity.
  # (No empty-array expansion here: the Mac's bash 3.2 calls it unbound under `set -u`.)
  local runner=env archs=
  [[ ${3:-} != signed ]] || runner=scripts/signed.sh
  # The generic simulator destination has no active arch, so Xcode builds
  # every one it supports; arm64 is the one the Mac's simulators run.
  case $1 in generic/*) archs=ARCHS=arm64 ;; esac
  # A simulator app is stamped with the apps/apple it is built from
  # (tree-stamp.sh), and only once it is: the stamp goes as the build starts.
  local stamp="$DD/Build/Products/Debug-iphonesimulator/CawCo.app.tree"
  case $1 in *"iOS Simulator"*) rm -f "$stamp" ;; *) stamp= ;; esac
  "$runner" xcodebuild -project CawCo.xcodeproj -scheme CawCo -destination "$1" \
    -derivedDataPath "$DD" -skipPackagePluginValidation ${archs:+"$archs"} build \
    >"$LOGS/build-$2.log" 2>&1 || {
    if grep -a -q -E "error:|BUILD FAILED" "$LOGS/build-$2.log"; then
      grep -a -E "error:|BUILD FAILED" "$LOGS/build-$2.log" | sort -u | head -40 || true
    else
      tail -20 "$LOGS/build-$2.log" || true
    fi
    echo "FAILED $2 (full log: mac:$LOGS/build-$2.log)"
    exit 1
  }
  [[ -z $stamp ]] || printf '%s\n' "$TREE" >"$stamp"
  echo "BUILT $2"
}

# Build for each runtime: Xcode omits Swift compatibility libraries when the
# destination OS already supplies them. Each launch builds and runs in a
# simulator slot (scripts/mac-slot.sh), whose simulator it boots and, when the
# launch ends however it ends, deletes.
ios() {
  local LABEL=${1:-iOS}
  # Compiling needs no simulator: the generic destination builds for any.
  if [[ $COMPILE_ONLY == --compile-only ]]; then
    build "generic/platform=iOS Simulator" "$LABEL"
    return
  fi
  if [[ $LABEL == 'iOS 18.5' ]]; then
    bash scripts/mac-slot.sh sim --runtime com.apple.CoreSimulator.SimRuntime.iOS-18-5 \
      --device com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro \
      -- bash --norc -c 'set -euo pipefail; ios_launch "$1"' ios-launch "$LABEL"
  else
    # The newest iPhone Pro whose runtime meets project.yml's iOS target.
    bash scripts/mac-slot.sh sim -- bash --norc -c 'set -euo pipefail; ios_launch "$1"' ios-launch "$LABEL"
  fi
}

# Runs inside the simulator slot, on CAWCO_SIM_UDID.
ios_launch() {
  local LABEL=$1 UDID=$CAWCO_SIM_UDID LOG
  build "platform=iOS Simulator,id=$UDID" "$LABEL"
  xcrun simctl install "$UDID" "$DD/Build/Products/Debug-iphonesimulator/CawCo.app"
  LOG="$LOGS/launch-$LABEL.log"
  : >"$LOG"
  if ! xcrun simctl launch --terminate-running-process \
    --stdout="$LOG" --stderr="$LOG" "$UDID" dev.cawco.app >>"$LOG" 2>&1; then
    if grep -q -E "dyld|abort|rror|Library not loaded|Reason" "$LOG"; then
      grep -E "dyld|abort|rror|Library not loaded|Reason" "$LOG" | head -20 || true
    else
      tail -20 "$LOG" || true
    fi
    echo "FAILED launch $LABEL"
    exit 1
  fi
  sleep "$SETTLE"
  if xcrun simctl spawn "$UDID" launchctl list |
    awk '$3 ~ /^UIKitApplication:dev\.cawco\.app/ && $1 ~ /^[0-9]+$/ { up = 1 } END { exit !up }'; then
    echo "LAUNCHED $LABEL"
  else
    if grep -q -E "dyld|abort|Library not loaded|Reason|Fatal" "$LOG"; then
      grep -E "dyld|abort|Library not loaded|Reason|Fatal" "$LOG" | head -20 || true
    else
      tail -20 "$LOG" || true
    fi
    find "$HOME/Library/Logs/DiagnosticReports" -name 'CawCo*.ips' -newer "$LOG" 2>/dev/null |
      head -1 | xargs -I{} grep -m3 -E '"(indicator|namespace|reasons)"' {} || true
    echo "FAILED launch $LABEL"
    exit 1
  fi
}
export -f build ios_launch

# macOS: the same UIKit app through Mac Catalyst. Start the executable
# directly, so its PID and stderr are ours.
macos() {
  build "platform=macOS,variant=Mac Catalyst" macOS signed
  if [[ $COMPILE_ONLY == --compile-only ]]; then return; fi
  LOG="$LOGS/launch-macOS.log"
  "$DD/Build/Products/Debug-maccatalyst/CawCo.app/Contents/MacOS/CawCo" >"$LOG" 2>&1 &
  PID=$!
  sleep "$SETTLE"
  # Still running: bash reaps an exited child as it exits, so one that died
  # answers no signal (setuid ps is refused inside a workspace's boundary).
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    wait "$PID" 2>/dev/null || true
    echo "LAUNCHED macOS"
  else
    wait "$PID" 2>/dev/null || true
    if grep -q -E "dyld|abort|Library not loaded|Reason|Termination" "$LOG"; then
      grep -E "dyld|abort|Library not loaded|Reason|Termination" "$LOG" | head -20 || true
    else
      tail -20 "$LOG" || true
    fi
    echo "FAILED launch macOS"
    exit 1
  fi
}

if [[ $PLATFORM != macos ]]; then ios; fi
if [[ $PLATFORM != ios ]]; then macos; fi
if [[ $PLATFORM != macos ]]; then ios 'iOS 18.5'; fi
EOF

DISK_ROOM=$(<scripts/lib/disk-room.sh)
printf -v COMMAND 'PLATFORM=%q COMPILE_ONLY=%q APPLE_ROOT=%q BUILD_SCRIPT=%q DISK_ROOM=%q CAWCO_MIN_FREE_GB=%q bash --norc -c %q --' \
  "$PLATFORM" "$COMPILE_ONLY" "$APPLE_ROOT" "$BUILD_SCRIPT" "$DISK_ROOM" "${CAWCO_MIN_FREE_GB:-}" "$PREPARE"
for argument in "$BUILD" "${LIVE[@]}"; do printf -v COMMAND '%s %q' "$COMMAND" "$argument"; done
# The ssh link's stdin and stdout are two FIFOs held on fds 3 (to the Mac)
# and 4 (from it): the Mac's /bin/bash 3.2 has no coproc and no {var}>&
# descriptors. Each FIFO is opened once and its name removed at once.
LINK=$(mktemp -d "${TMPDIR:-/tmp}/build-both.XXXXXX")
mkfifo "$LINK/in" "$LINK/out"
"${MAC[@]}" "$COMMAND" <"$LINK/in" >"$LINK/out" &
MAC_PID=$!
exec 3>"$LINK/in" 4<"$LINK/out"
rm -rf "$LINK"
# The Mac side ends its build when this heartbeat stops or stdin closes.
( exec 4<&-; while sleep 10; do printf '\n' || exit 0; done ) >&3 &
BEAT_PID=$!
release() {
  kill "$BEAT_PID" 2>/dev/null || true
  exec 3>&-
}
trap release EXIT
while IFS= read -r line <&4; do
  [[ $line != READY ]] || break
  echo "$line"
done
# The Mac side's own status when it ended before READY (3: no room on its disk).
if [[ ${line:-} != READY ]]; then wait "$MAC_PID" || exit $?; exit 1; fi
# The apps/apple this build is made from: stamped as it is synced, after the
# wait for the slot, and again once synced. An edit in between would leave
# the stamp naming other code than the app's, so the run stops instead.
TREE=$(bash apps/apple/scripts/tree-stamp.sh)
SYNC=(rsync -rlpD --checksum --delete
  --exclude .build --exclude DerivedData
  --exclude CawCo.xcodeproj --exclude CawCo/Info.plist)
if [[ -n $APPLE_ROOT ]]; then
  echo "BUILD DIRECTORY $APPLE_ROOT/$BUILD"
  "${SYNC[@]}" apps/apple/ "$APPLE_ROOT/$BUILD/apps/apple/"
else
  echo "BUILD DIRECTORY mac:~/build/cawco-apple/$BUILD"
  "${SYNC[@]}" -e "ssh -F $HOME/.ssh/config -o BatchMode=yes" apps/apple/ "mac:$REMOTE/"
fi
if [[ $(bash apps/apple/scripts/tree-stamp.sh) != "$TREE" ]]; then
  echo "FAILED sync: apps/apple changed while it was copied to the build; run build-both.sh again" >&2
  exit 1
fi
echo "GO $TREE" >&3
cat <&4
wait "$MAC_PID"

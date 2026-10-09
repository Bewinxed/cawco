#!/usr/bin/env bash
# Builds the CawCo app on the Mac for an iPhone simulator, then for the Mac
# (Mac Catalyst), and
# proves each build starts and stays up for 8 s. A launch-time abort fails it.
# Run from the repo root: bash apps/apple/scripts/build-both.sh [ios|macos] [--compile-only]
# With no argument it builds both and prints BUILT iOS, LAUNCHED iOS,
# BUILT macOS, LAUNCHED macOS, BUILT iOS 18.5, LAUNCHED iOS 18.5.
# `ios` proves both iOS runtimes; `macos` proves only macOS.
# Exits non-zero at the first failure.
#
# The builds run one after the other into one DerivedData: two xcodebuilds
# sharing it lock its build.db. -skipPackagePluginValidation lets the
# OpenAPIGenerator build plugin (CawCoAPI) run without Xcode's trust prompt.
# Each workspace owns ~/build/cawco-apple/<workspace>, including DerivedData
# and logs. Mac-side locks cover retirement, rsync and both builds;
# builds from different workspaces wait their turn.
# Only processes this script starts are stopped: the Mac-side build runs in
# its own process group, which ends (TERM, then KILL) when the SSH link drops.
set -euo pipefail

SSH=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes mac)
ROOT=$(git rev-parse --show-toplevel)
BUILD=$(basename "$ROOT")
if [[ $ROOT == "$HOME/cockpit" ]]; then BUILD=main; fi
[[ $BUILD =~ ^[a-zA-Z0-9._-]+$ ]] || { echo "invalid workspace name: $BUILD" >&2; exit 2; }
REMOTE=build/cawco-apple/$BUILD/apps/apple

[[ -f apps/apple/project.yml ]] || { echo "run from the repo root" >&2; exit 2; }
PLATFORM=${1:-both}
COMPILE_ONLY=${2:-}
[[ -z $COMPILE_ONLY || $COMPILE_ONLY == --compile-only ]] || { echo "usage: build-both.sh [ios|macos|both] [--compile-only]" >&2; exit 2; }
case $PLATFORM in
  ios | macos | both) ;;
  *) echo "usage: build-both.sh [ios|macos]" >&2; exit 2 ;;
esac

# Pass the authoritative workspace inventory from this host, never the Mac's
# copies. Fail before retirement if the inventory cannot be read.
LIVE=(main "$BUILD")
[[ -d $HOME/.worktrees ]] || { echo "missing workspace inventory: $HOME/.worktrees" >&2; exit 2; }
for workspace in "$HOME"/.worktrees/*; do
  [[ ! -d $workspace ]] || LIVE+=("$(basename "$workspace")")
done

read -r -d '' PREPARE <<'EOF' || true
set -euo pipefail
BUILD=$1
shift
ROOT="$HOME/build/cawco-apple"
mkdir -p "$ROOT/.locks"
LOCK="$ROOT/.locks/$BUILD"
command -v shlock >/dev/null || { echo "shlock is required for Apple workspace builds" >&2; exit 2; }
shlock -p $$ -f "$LOCK" || { echo "workspace $BUILD is already building (lock: $LOCK)" >&2; exit 3; }
MACHINE_LOCK="$ROOT/.locks/.machine"
MACHINE_OWNER="$ROOT/.locks/.machine.owner"
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
  rm -f "$LOCK"
  if [[ -f $MACHINE_LOCK && $(<"$MACHINE_LOCK") == $$ ]]; then
    rm -f "$MACHINE_OWNER" "$MACHINE_LOCK"
  fi
}
trap release_locks EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
trap 'GO=1' USR1

# The caller holds stdin open for the whole run and writes a heartbeat line
# every 10 s, plus GO once the sync is done. EOF, or no line for 45 s, means
# the caller has left: TERM this shell, whose EXIT trap ends the build group
# and releases the locks.
(
  while IFS= read -r -t 45 line; do
    if [[ $line == GO ]]; then kill -USR1 "$$"; fi
  done
  kill -TERM "$$"
) <&0 &
WAIT_PID=$!
next_notice=0
until shlock -p $$ -f "$MACHINE_LOCK"; do
  now=$(date +%s)
  if (( now >= next_notice )); then
    holder=unknown
    held_since=$now
    if [[ -f $MACHINE_OWNER ]]; then
      read -r holder held_since <"$MACHINE_OWNER" || true
    fi
    [[ $held_since =~ ^[0-9]+$ ]] || held_since=$now
    echo "WAITING for the Mac build slot: $holder has held it for $((now - held_since)) s"
    next_notice=$((now + 60))
  fi
  sleep 5
done
printf '%s %s\n' "$BUILD" "$(date +%s)" >"$MACHINE_OWNER"

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
for directory in "$HOME"/build/cawco-apple-*; do
  retire "$directory" "$ROOT/.locks/legacy-${directory##*/}"
done
mkdir -p "$ROOT/$BUILD/apps/apple"
echo READY
# The same SSH process keeps the locks while the caller rsyncs; GO starts the
# build. A failed sync ends the caller, and its EOF releases the locks.
until [[ -n $GO ]]; do wait "$WAIT_PID" || true; done
perl -e 'setpgrp(0, 0); exec @ARGV or die "exec: $!\n"' \
  bash --norc -c "$BUILD_SCRIPT" build-both "build/cawco-apple/$BUILD/apps/apple" "$PLATFORM" "$BUILD" "$COMPILE_ONLY" </dev/null &
BUILD_PID=$!
status=0
wait "$BUILD_PID" || status=$?
BUILD_PID=
exit "$status"
EOF

read -r -d '' BUILD_SCRIPT <<'EOF' || true
set -euo pipefail
cd "$HOME/$1"
PLATFORM=$2
BUILD=$3
COMPILE_ONLY=$4
DD="$HOME/build/cawco-apple/$BUILD/DerivedData"
LOGS="$HOME/build/cawco-apple/$BUILD/logs"
mkdir -p "$LOGS"
SETTLE=8
UDID=
end_ios() {
  [[ -n $UDID ]] || return 0
  xcrun simctl terminate "$UDID" dev.cawco.app >/dev/null 2>&1 || true
  xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
  xcrun simctl delete "$UDID"
  UDID=
}
trap end_ios EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
XCODEGEN=$(command -v xcodegen || echo /opt/homebrew/bin/xcodegen)
"$XCODEGEN" generate --quiet

build() { # <destination> <label> [signed]
  # A build that signs with an identity (Mac Catalyst) runs with the CI
  # keychain unlocked, as TestFlight's do (scripts/signed.sh); a simulator's
  # needs no identity.
  # (No empty-array expansion here: the Mac's bash 3.2 calls it unbound under `set -u`.)
  local runner=env
  [[ ${3:-} != signed ]] || runner=scripts/signed.sh
  "$runner" xcodebuild -project CawCo.xcodeproj -scheme CawCo -destination "$1" \
    -derivedDataPath "$DD" -skipPackagePluginValidation build \
    >"$LOGS/build-$2.log" 2>&1 || {
    if grep -a -q -E "error:|BUILD FAILED" "$LOGS/build-$2.log"; then
      grep -a -E "error:|BUILD FAILED" "$LOGS/build-$2.log" | sort -u | head -40 || true
    else
      tail -20 "$LOGS/build-$2.log" || true
    fi
    echo "FAILED $2 (full log: mac:$LOGS/build-$2.log)"
    exit 1
  }
  echo "BUILT $2"
}

# Build for each runtime: Xcode omits Swift compatibility libraries when the
# destination OS already supplies them. Each launch owns its simulator.
ios() {
  local LABEL=${1:-iOS} RUNTIME TYPE NAME LOG
  if [[ $LABEL == 'iOS 18.5' ]]; then
    RUNTIME=com.apple.CoreSimulator.SimRuntime.iOS-18-5
    TYPE=com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro
    NAME='iPhone 16 Pro (iOS 18.5)'
  else
  MIN_IOS=$(sed -n 's/^ *iOS: "\([0-9.]*\)"$/\1/p' project.yml | head -1)
  read -r RUNTIME TYPE NAME < <(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
need = tuple(int(p) for p in sys.argv[1].split("."))
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    m = re.search(r"\.iOS-(\d+)-(\d+)$", runtime)
    if not m or (int(m[1]), int(m[2])) < need:
        continue
    for d in devices:
        pro = re.fullmatch(r"iPhone (\d+) Pro", d["name"])
        if pro:
            key = (int(pro[1]), int(m[1]), int(m[2]))
            if best is None or key > best[0]:
                best = (key, runtime, d["deviceTypeIdentifier"], d["name"] + " (iOS " + m[1] + "." + m[2] + ")")
if best is None:
    sys.exit("no iPhone Pro simulator on iOS >= " + sys.argv[1])
print(best[1], best[2], best[3])
' "$MIN_IOS")
  fi
  UDID=$(xcrun simctl create "CawCo build $BUILD $LABEL" "$TYPE" "$RUNTIME")
  echo "iOS simulator: $NAME $UDID"
  build "platform=iOS Simulator,id=$UDID" "$LABEL"
  if [[ $COMPILE_ONLY == --compile-only ]]; then end_ios; return; fi

  xcrun simctl boot "$UDID"
  xcrun simctl bootstatus "$UDID" -b >/dev/null
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
    end_ios
    exit 1
  fi
  sleep "$SETTLE"
  if xcrun simctl spawn "$UDID" launchctl list |
    awk '$3 ~ /^UIKitApplication:dev\.cawco\.app/ && $1 ~ /^[0-9]+$/ { up = 1 } END { exit !up }'; then
    echo "LAUNCHED $LABEL"
    end_ios
  else
    if grep -q -E "dyld|abort|Library not loaded|Reason|Fatal" "$LOG"; then
      grep -E "dyld|abort|Library not loaded|Reason|Fatal" "$LOG" | head -20 || true
    else
      tail -20 "$LOG" || true
    fi
    find "$HOME/Library/Logs/DiagnosticReports" -name 'CawCo*.ips' -newer "$LOG" 2>/dev/null |
      head -1 | xargs -I{} grep -m3 -E '"(indicator|namespace|reasons)"' {} || true
    echo "FAILED launch $LABEL"
    end_ios
    exit 1
  fi
}

# macOS: the same UIKit app through Mac Catalyst. Start the executable
# directly, so its PID and stderr are ours.
macos() {
  build "platform=macOS,variant=Mac Catalyst" macOS signed
  if [[ $COMPILE_ONLY == --compile-only ]]; then return; fi
  LOG="$LOGS/launch-macOS.log"
  "$DD/Build/Products/Debug-maccatalyst/CawCo.app/Contents/MacOS/CawCo" >"$LOG" 2>&1 &
  PID=$!
  sleep "$SETTLE"
  STAT=$(ps -o stat= -p "$PID" || true)
  if [[ -n $STAT && $STAT != Z* ]]; then
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

printf -v COMMAND 'PLATFORM=%q COMPILE_ONLY=%q BUILD_SCRIPT=%q bash --norc -c %q --' \
  "$PLATFORM" "$COMPILE_ONLY" "$BUILD_SCRIPT" "$PREPARE"
for argument in "$BUILD" "${LIVE[@]}"; do printf -v COMMAND '%s %q' "$COMMAND" "$argument"; done
coproc MAC_BUILD { "${SSH[@]}" "$COMMAND"; }
MAC_PID=$MAC_BUILD_PID
exec {MAC_INPUT}>&"${MAC_BUILD[1]}" {MAC_OUTPUT}<&"${MAC_BUILD[0]}"
MAC_WRITE=${MAC_BUILD[1]}
MAC_READ=${MAC_BUILD[0]}
exec {MAC_WRITE}>&- {MAC_READ}<&-
# The Mac side ends its build when this heartbeat stops or stdin closes.
( while sleep 10; do printf '\n' || exit 0; done ) >&"$MAC_INPUT" &
BEAT_PID=$!
release() {
  kill "$BEAT_PID" 2>/dev/null || true
  exec {MAC_INPUT}>&-
}
trap release EXIT
while IFS= read -r line <&"$MAC_OUTPUT"; do
  [[ $line != READY ]] || break
  echo "$line"
done
if [[ ${line:-} != READY ]]; then wait "$MAC_PID"; exit 1; fi
echo "BUILD DIRECTORY mac:~/build/cawco-apple/$BUILD"
rsync -rlpD --checksum --delete \
  --exclude .build --exclude DerivedData \
  --exclude CawCo.xcodeproj --exclude CawCo/Info.plist \
  -e "ssh -F $HOME/.ssh/config -o BatchMode=yes" \
  apps/apple/ "mac:$REMOTE/"
echo GO >&"$MAC_INPUT"
cat <&"$MAC_OUTPUT"
wait "$MAC_PID"

#!/usr/bin/env bash
# Builds the CawCo app on the Mac for an iPhone simulator, then for the Mac
# (Mac Catalyst), and
# proves each build starts and stays up for 8 s. A launch-time abort fails it.
# Run from the repo root: bash apps/apple/scripts/build-both.sh [ios|macos]
# With no argument it builds both and prints BUILT iOS, LAUNCHED iOS,
# BUILT macOS, LAUNCHED macOS; `ios` or `macos` builds only that platform and
# prints only its two lines. Exits non-zero at the first failure.
#
# The builds run one after the other into one DerivedData: two xcodebuilds
# sharing it lock its build.db. -skipPackagePluginValidation lets the
# OpenAPIGenerator build plugin (CawCoAPI) run without Xcode's trust prompt.
# Each workspace owns ~/build/cawco-apple/<workspace>, including DerivedData
# and logs. A Mac-side lock covers retirement, rsync and both builds.
# Only processes this script starts are stopped, by PID.
set -euo pipefail

SSH=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes mac)
ROOT=$(git rev-parse --show-toplevel)
BUILD=$(basename "$ROOT")
if [[ $ROOT == "$HOME/cockpit" ]]; then BUILD=main; fi
[[ $BUILD =~ ^[a-zA-Z0-9._-]+$ ]] || { echo "invalid workspace name: $BUILD" >&2; exit 2; }
REMOTE=build/cawco-apple/$BUILD/apps/apple

[[ -f apps/apple/project.yml ]] || { echo "run from the repo root" >&2; exit 2; }
PLATFORM=${1:-both}
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
trap 'rm -f "$LOCK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

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
# The same SSH process keeps the lock while the caller rsyncs, then executes
# the build script sent on stdin. EOF on a failed sync releases the lock.
bash --norc -s -- "build/cawco-apple/$BUILD/apps/apple" "$PLATFORM" "$BUILD"
EOF
printf -v COMMAND 'PLATFORM=%q bash --norc -c %q --' "$PLATFORM" "$PREPARE"
for argument in "$BUILD" "${LIVE[@]}"; do printf -v COMMAND '%s %q' "$COMMAND" "$argument"; done
coproc MAC_BUILD { "${SSH[@]}" "$COMMAND"; }
MAC_PID=$MAC_BUILD_PID
exec {MAC_INPUT}>&"${MAC_BUILD[1]}" {MAC_OUTPUT}<&"${MAC_BUILD[0]}"
MAC_WRITE=${MAC_BUILD[1]}
MAC_READ=${MAC_BUILD[0]}
exec {MAC_WRITE}>&- {MAC_READ}<&-
release() { exec {MAC_INPUT}>&-; }
trap release EXIT
while IFS= read -r line <&"$MAC_OUTPUT"; do
  [[ $line != READY ]] || break
  echo "$line"
done
if [[ ${line:-} != READY ]]; then wait "$MAC_PID"; exit 1; fi
echo "BUILD DIRECTORY mac:~/build/cawco-apple/$BUILD"
rsync -a --delete \
  --exclude .build --exclude DerivedData \
  --exclude CawCo.xcodeproj --exclude CawCo/Info.plist \
  -e "ssh -F $HOME/.ssh/config -o BatchMode=yes" \
  apps/apple/ "mac:$REMOTE/"

cat >&"$MAC_INPUT" <<'EOF'
set -euo pipefail
cd "$HOME/$1"
PLATFORM=$2
BUILD=$3
DD="$HOME/build/cawco-apple/$BUILD/DerivedData"
LOGS="$HOME/build/cawco-apple/$BUILD/logs"
mkdir -p "$LOGS"
SETTLE=8
XCODEGEN=$(command -v xcodegen || echo /opt/homebrew/bin/xcodegen)
"$XCODEGEN" generate --quiet

build() { # <destination> <label>
  xcodebuild -project CawCo.xcodeproj -scheme CawCo -destination "$1" \
    -derivedDataPath "$DD" -skipPackagePluginValidation build \
    >"$LOGS/build-$2.log" 2>&1 || {
    grep -a -E "error:|BUILD FAILED" "$LOGS/build-$2.log" | sort -u | head -40
    echo "FAILED $2 (full log: mac:$LOGS/build-$2.log)"
    exit 1
  }
  echo "BUILT $2"
}

# iOS: the newest "iPhone N Pro" on a runtime the deployment target allows.
ios() {
  MIN_IOS=$(sed -n 's/^ *iOS: "\([0-9.]*\)"$/\1/p' project.yml | head -1)
  read -r UDID STATE NAME < <(xcrun simctl list devices available -j | python3 -c '
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
                best = (key, d["udid"], d["state"], d["name"] + " (iOS " + m[1] + "." + m[2] + ")")
if best is None:
    sys.exit("no iPhone Pro simulator on iOS >= " + sys.argv[1])
print(best[1], best[2], best[3])
' "$MIN_IOS")
  echo "iOS simulator: $NAME $UDID"
  build "platform=iOS Simulator,id=$UDID" iOS

  BOOTED_HERE=0
  if [[ $STATE != Booted ]]; then
    xcrun simctl boot "$UDID"
    BOOTED_HERE=1
  fi
  end_ios() {
    xcrun simctl terminate "$UDID" dev.cawco.app >/dev/null 2>&1 || true
    if [[ $BOOTED_HERE == 1 ]]; then xcrun simctl shutdown "$UDID" || true; fi
  }
  xcrun simctl bootstatus "$UDID" -b >/dev/null
  xcrun simctl install "$UDID" "$DD/Build/Products/Debug-iphonesimulator/CawCo.app"
  LOG="$LOGS/launch-iOS.log"
  : >"$LOG"
  if ! xcrun simctl launch --terminate-running-process \
    --stdout="$LOG" --stderr="$LOG" "$UDID" dev.cawco.app >>"$LOG" 2>&1; then
    grep -E "dyld|abort|rror|Library not loaded|Reason" "$LOG" | head -20
    echo "FAILED launch iOS"
    end_ios
    exit 1
  fi
  sleep "$SETTLE"
  if xcrun simctl spawn "$UDID" launchctl list |
    awk '$3 ~ /^UIKitApplication:dev\.cawco\.app/ && $1 ~ /^[0-9]+$/ { up = 1 } END { exit !up }'; then
    echo "LAUNCHED iOS"
    end_ios
  else
    grep -E "dyld|abort|Library not loaded|Reason|Fatal" "$LOG" | head -20
    find "$HOME/Library/Logs/DiagnosticReports" -name 'CawCo*.ips' -newer "$LOG" 2>/dev/null |
      head -1 | xargs -I{} grep -m3 -E '"(indicator|namespace|reasons)"' {} || true
    echo "FAILED launch iOS"
    end_ios
    exit 1
  fi
}

# macOS: the same UIKit app through Mac Catalyst. Start the executable
# directly, so its PID and stderr are ours.
macos() {
  build "platform=macOS,variant=Mac Catalyst" macOS
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
    grep -E "dyld|abort|Library not loaded|Reason|Termination" "$LOG" | head -20
    echo "FAILED launch macOS"
    exit 1
  fi
}

if [[ $PLATFORM != macos ]]; then ios; fi
if [[ $PLATFORM != ios ]]; then macos; fi
EOF
release
trap - EXIT
cat <&"$MAC_OUTPUT"
wait "$MAC_PID"

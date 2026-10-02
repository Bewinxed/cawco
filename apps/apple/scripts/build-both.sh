#!/usr/bin/env bash
# Builds the CawCo app on the Mac for an iPhone simulator, then for macOS, and
# proves each build starts and stays up for 8 s. A launch-time abort fails it.
# Run from the repo root: bash apps/apple/scripts/build-both.sh [ios|macos]
# With no argument it builds both and prints BUILT iOS, LAUNCHED iOS,
# BUILT macOS, LAUNCHED macOS; `ios` or `macos` builds only that platform and
# prints only its two lines. Exits non-zero at the first failure.
#
# The builds run one after the other into one DerivedData: two xcodebuilds
# sharing it lock its build.db. -skipPackagePluginValidation lets the
# OpenAPIGenerator build plugin (CawCoAPI) run without Xcode's trust prompt.
# The checkout is rsynced to ~/build/cawco-apple, never the deploy clone.
# Only processes this script starts are stopped, by PID.
set -euo pipefail

SSH=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes mac)
REMOTE=build/cawco-apple/apps/apple

[[ -f apps/apple/project.yml ]] || { echo "run from the repo root" >&2; exit 2; }
PLATFORM=${1:-both}
case $PLATFORM in
  ios | macos | both) ;;
  *) echo "usage: build-both.sh [ios|macos]" >&2; exit 2 ;;
esac

"${SSH[@]}" "mkdir -p $REMOTE"
rsync -a --delete \
  --exclude .build --exclude DerivedData \
  --exclude CawCo.xcodeproj --exclude CawCo/Info.plist \
  -e "ssh -F $HOME/.ssh/config -o BatchMode=yes" \
  apps/apple/ "mac:$REMOTE/"

"${SSH[@]}" bash -s -- "$REMOTE" "$PLATFORM" <<'EOF'
set -euo pipefail
cd "$HOME/$1"
PLATFORM=$2
DD="$HOME/build/cawco-apple/DerivedData"
SETTLE=8
XCODEGEN=$(command -v xcodegen || echo /opt/homebrew/bin/xcodegen)
"$XCODEGEN" generate --quiet

build() { # <destination> <label>
  xcodebuild -project CawCo.xcodeproj -scheme CawCo -destination "$1" \
    -derivedDataPath "$DD" -skipPackagePluginValidation build \
    >"/tmp/cawco-build-$2.log" 2>&1 || {
    grep -E "error:|BUILD FAILED" "/tmp/cawco-build-$2.log" | sort -u | head -40
    echo "FAILED $2 (full log: mac:/tmp/cawco-build-$2.log)"
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
  LOG=/tmp/cawco-launch-iOS.log
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

# macOS: start the executable directly, so its PID and stderr are ours.
macos() {
  build "generic/platform=macOS" macOS
  LOG=/tmp/cawco-launch-macOS.log
  "$DD/Build/Products/Debug/CawCo.app/Contents/MacOS/CawCo" >"$LOG" 2>&1 &
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

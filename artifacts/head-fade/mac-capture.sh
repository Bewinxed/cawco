#!/usr/bin/env bash
# The transcript's head fade on iOS, captured on the Mac: a long transcript
# scrolled to its very top (no fade, the first row sharp), then dragged up
# slowly so rows pass under the tab strip and dissolve at the top edge.
#
#   bash artifacts/head-fade/mac-capture.sh
#
# Run on the Mac, from the repo root of a checkout of this branch. It:
#  1. builds the app for the iPhone simulator (build-both.sh ios
#     --compile-only, xcodebuild into this checkout's DerivedData);
#  2. stands up a scratch fleet on loopback (seed-fleet.ts: a real hub, agent
#     and sessiond, Claude Code on the mock model) holding one session of a
#     dozen long turns;
#  3. creates a simulator of its own (the newest iPhone Pro), launches the
#     app with `-paywall-env sandbox`, pointed at that hub and opened on that
#     session;
#  4. scrolls the transcript to its top and saves, at /tmp/head-fade-ios/:
#       before-top.png      scrolled to the top: no fade
#       after-scrolled.png  ~200pt scrolled: rows under the fade
#       scroll.mp4          a slow one-finger scroll from the top down
#
# It stops only what it started: the fleet by its PID, and the simulator it
# created (deleted at the end).
set -euo pipefail

[[ $(uname -s) == Darwin ]] || { echo "run this on the Mac" >&2; exit 2; }
[[ -f apps/apple/project.yml ]] || { echo "run from the repo root" >&2; exit 2; }

AXE=/opt/homebrew/bin/axe
OUT=/tmp/head-fade-ios
rm -rf "$OUT"
mkdir -p "$OUT"

# ── 1. Build ────────────────────────────────────────────────────────────────
bun install >/dev/null
BUILD_LOG=$OUT/build.log
bash apps/apple/scripts/build-both.sh ios --compile-only | tee "$BUILD_LOG"
grep -qx "BUILT iOS" "$BUILD_LOG" || { echo "no BUILT iOS line in $BUILD_LOG" >&2; exit 1; }
# build-both.sh's DerivedData on the Mac itself (its APPLE_ROOT and BUILD).
ROOT=$(git rev-parse --show-toplevel)
BUILD=$(basename "$ROOT")
[[ $ROOT == "$HOME/cockpit" ]] && BUILD=main
APP=${XDG_CACHE_HOME:-$HOME/Library/Caches}/cawco-apple/$BUILD/DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app
[[ -d $APP ]] || { echo "no app at $APP" >&2; exit 1; }

UDID=
SEED_PID=
cleanup() {
  if [[ -n $UDID ]]; then
    xcrun simctl terminate "$UDID" dev.cawco.app >/dev/null 2>&1 || true
    xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
    xcrun simctl delete "$UDID" >/dev/null 2>&1 || true
  fi
  if [[ -n $SEED_PID ]]; then
    kill -TERM "$SEED_PID" 2>/dev/null || true
    wait "$SEED_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── 2. The fleet and its long transcript ────────────────────────────────────
SEED_LOG=$OUT/seed.log
bun artifacts/head-fade/seed-fleet.ts >"$SEED_LOG" 2>&1 &
SEED_PID=$!
for _ in $(seq 1 600); do
  grep -q '^READY ' "$SEED_LOG" && break
  kill -0 "$SEED_PID" 2>/dev/null || { cat "$SEED_LOG" >&2; exit 1; }
  sleep 1
done
read -r _ HUB SESSION < <(grep '^READY ' "$SEED_LOG")
[[ -n ${SESSION:-} ]] || { echo "the fleet never said READY" >&2; cat "$SEED_LOG" >&2; exit 1; }
echo "fleet $HUB, session $SESSION"

# ── 3. The simulator ────────────────────────────────────────────────────────
read -r RUNTIME TYPE < <(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    m = re.search(r"\.iOS-(\d+)-(\d+)$", runtime)
    if not m:
        continue
    for d in devices:
        pro = re.fullmatch(r"iPhone (\d+) Pro", d["name"])
        if pro:
            key = (int(m[1]), int(m[2]), int(pro[1]))
            if best is None or key > best[0]:
                best = (key, runtime, d["deviceTypeIdentifier"])
if best is None:
    sys.exit("no iPhone Pro simulator")
print(best[1], best[2])
')
UDID=$(xcrun simctl create "CawCo head fade" "$TYPE" "$RUNTIME")
echo "simulator $UDID"
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcrun simctl install "$UDID" "$APP"
xcrun simctl ui "$UDID" appearance light
xcrun simctl launch --terminate-running-process "$UDID" dev.cawco.app \
  -paywall-env sandbox -cawco-hub-url "$HUB" -open-session "$SESSION" >/dev/null

# The transcript's frame, once it is on screen: "x y width height" in points.
transcript_frame() {
  "$AXE" describe-ui --udid "$UDID" | python3 -c '
import json, sys
def walk(at):
    if isinstance(at, list):
        for child in at:
            found = walk(child)
            if found:
                return found
        return None
    if not isinstance(at, dict):
        return None
    if (at.get("AXLabel") or at.get("label")) == "Session transcript" and at.get("frame"):
        f = at["frame"]
        return "%d %d %d %d" % (f["x"], f["y"], f["width"], f["height"])
    return walk(at.get("children"))
found = walk(json.load(sys.stdin))
if found:
    print(found)
'
}
FRAME=
for _ in $(seq 1 120); do
  FRAME=$(transcript_frame || true)
  [[ -n $FRAME ]] && break
  sleep 1
done
[[ -n $FRAME ]] || { echo "the transcript never came on screen" >&2; exit 1; }
read -r TX TY TW TH <<<"$FRAME"
# A finger in the transcript's middle column, clear of the tab strip above it
# and the composer below.
X=$((TX + TW / 2))
LOW=$((TY + TH * 2 / 3))
# Rows still arriving settle before the scroll.
sleep 4

# ── 4. Captures ─────────────────────────────────────────────────────────────
# To the very top: one-finger flicks down (axe drag; axe swipe is multi-touch).
for _ in $(seq 1 40); do
  "$AXE" drag --start-x "$X" --start-y $((TY + 80)) --end-x "$X" --end-y "$LOW" \
    --duration 0.12 --steps 8 --udid "$UDID" >/dev/null
done
sleep 2
xcrun simctl io "$UDID" screenshot "$OUT/before-top.png" >/dev/null

xcrun simctl io "$UDID" recordVideo --codec h264 --force "$OUT/scroll.mp4" >/dev/null 2>&1 &
RECORD_PID=$!
sleep 1.5
# ~200pt up, slowly, one finger: little momentum, so it rests about there.
"$AXE" drag --start-x "$X" --start-y "$LOW" --end-x "$X" --end-y $((LOW - 200)) \
  --duration 3 --steps 90 --udid "$UDID" >/dev/null
sleep 1.5
xcrun simctl io "$UDID" screenshot "$OUT/after-scrolled.png" >/dev/null
# On down, as slowly, so the video shows rows passing under the fade.
"$AXE" drag --start-x "$X" --start-y "$LOW" --end-x "$X" --end-y $((LOW - 240)) \
  --duration 4 --steps 120 --udid "$UDID" >/dev/null
sleep 1.5
kill -INT "$RECORD_PID"
wait "$RECORD_PID" 2>/dev/null || true

ls -l "$OUT"/before-top.png "$OUT"/after-scrolled.png "$OUT"/scroll.mp4
echo "Captures: $OUT"

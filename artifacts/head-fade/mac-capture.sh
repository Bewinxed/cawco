#!/usr/bin/env bash
# The transcript's head blur on iOS, captured on the Mac: a long transcript
# scrolled to its very top (no blur, the first row sharp), then dragged up
# slowly so rows pass under the tab strip and go out of focus toward its edge.
#
#   bash artifacts/head-fade/mac-capture.sh
#
# Run on the Mac, from the repo root of a checkout of this branch. It:
#  1. builds the app for the iPhone simulator (build-both.sh ios
#     --compile-only, xcodebuild into this checkout's DerivedData);
#  2. stands up a scratch fleet on loopback (seed-fleet.ts: a real hub, agent
#     and sessiond, Claude Code on the mock model) holding one session of a
#     dozen long turns;
#  3. on each of two simulators of its own, the newest iPhone Pro and the
#     newest iPhone on an iOS 18 runtime (the deployment target; the partial
#     blur is a paused UIViewPropertyAnimator, so both are worth a look),
#     launches the app pointed at that hub and opened on that session;
#  4. saves, at /tmp/head-fade-ios/<newest|ios18>/:
#       top.png             scrolled to the very top: no blur, first row sharp
#       scrolled-light.png  ~200pt scrolled: rows under the band, light
#       scrolled-dark.png   the same, dark (the material follows appearance)
#       returned-dark.png   the same after a trip out to Settings and back
#       crop-*.png          the top 300pt of each of those, for the band
#       scroll.mp4          a slow one-finger scroll from the top, 60fps
#
# It stops only what it started: the fleet by its PID, and the simulators it
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

UDIDS=()
SEED_PID=
cleanup() {
  for udid in "${UDIDS[@]}"; do
    xcrun simctl terminate "$udid" dev.cawco.app >/dev/null 2>&1 || true
    xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true
    xcrun simctl delete "$udid" >/dev/null 2>&1 || true
  done
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

# "runtime device-type" of the newest iPhone (Pro when it has one) on a
# runtime whose major is $1, or on the newest runtime when $1 is "newest".
pick_device() {
  xcrun simctl list devices available -j | python3 -c '
import json, re, sys
want = sys.argv[1]
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    m = re.search(r"\.iOS-(\d+)-(\d+)$", runtime)
    if not m or (want != "newest" and m[1] != want):
        continue
    for d in devices:
        phone = re.fullmatch(r"iPhone (\d+)( Pro)?", d["name"])
        if phone:
            key = (int(m[1]), int(m[2]), bool(phone[2]), int(phone[1]))
            if best is None or key > best[0]:
                best = (key, runtime, d["deviceTypeIdentifier"])
if best:
    print(best[1], best[2])
' "$1"
}

# The transcript's frame, once it is on screen: "x y width height" in points.
transcript_frame() {
  "$AXE" describe-ui --udid "$1" | python3 -c '
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

# The top 300pt of a screenshot, at the screen's scale: the tab strip and the band.
crop_top() {
  local in=$1 out=$2 width height
  width=$(sips -g pixelWidth "$in" | awk '/pixelWidth/ {print $2}')
  height=$(( 300 * width / $3 ))
  sips --cropOffset 0 0 -c "$height" "$width" "$in" --out "$out" >/dev/null
}

# ── 3–4. Each simulator ─────────────────────────────────────────────────────
capture() {
  local label=$1 major=$2 runtime type udid dir frame
  read -r runtime type < <(pick_device "$major") || true
  if [[ -z ${runtime:-} ]]; then
    echo "no iPhone simulator on iOS $major: $label skipped" >&2
    return
  fi
  dir=$OUT/$label
  mkdir -p "$dir"
  udid=$(xcrun simctl create "CawCo head blur $label" "$type" "$runtime")
  UDIDS+=("$udid")
  echo "$label: simulator $udid ($runtime)"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
  xcrun simctl install "$udid" "$APP"
  xcrun simctl ui "$udid" appearance light
  xcrun simctl launch --terminate-running-process "$udid" dev.cawco.app \
    -paywall-env sandbox -cawco-hub-url "$HUB" -open-session "$SESSION" >/dev/null

  frame=
  for _ in $(seq 1 120); do
    frame=$(transcript_frame "$udid" || true)
    [[ -n $frame ]] && break
    sleep 1
  done
  [[ -n $frame ]] || { echo "$label: the transcript never came on screen" >&2; return 1; }
  read -r TX TY TW TH <<<"$frame"
  # The screen's width in points, for cropping at its scale.
  local screen_w
  screen_w=$("$AXE" describe-ui --udid "$udid" | python3 -c '
import json, sys
root = json.load(sys.stdin)
root = root[0] if isinstance(root, list) else root
print(int(root["frame"]["width"]))')
  # A finger in the transcript's middle column, clear of the tab strip above
  # it and the composer below.
  local x=$((TX + TW / 2)) low=$((TY + TH * 2 / 3))
  # Rows still arriving settle before the scroll.
  sleep 4

  # To the very top: one-finger flicks down (axe drag; axe swipe is multi-touch).
  for _ in $(seq 1 40); do
    "$AXE" drag --start-x "$x" --start-y $((TY + 80)) --end-x "$x" --end-y "$low" \
      --duration 0.12 --steps 8 --udid "$udid" >/dev/null
  done
  sleep 2
  xcrun simctl io "$udid" screenshot "$dir/top.png" >/dev/null
  crop_top "$dir/top.png" "$dir/crop-top.png" "$screen_w"

  xcrun simctl io "$udid" recordVideo --codec h264 --force "$dir/scroll-raw.mp4" >/dev/null 2>&1 &
  local record=$!
  sleep 1.5
  # ~200pt up, slowly, one finger: little momentum, so it rests about there.
  "$AXE" drag --start-x "$x" --start-y "$low" --end-x "$x" --end-y $((low - 200)) \
    --duration 3 --steps 180 --udid "$udid" >/dev/null
  sleep 1.5
  xcrun simctl io "$udid" screenshot "$dir/scrolled-light.png" >/dev/null
  # Back up to the top as slowly: the band goes as the first row comes back.
  "$AXE" drag --start-x "$x" --start-y $((low - 200)) --end-x "$x" --end-y "$low" \
    --duration 3 --steps 180 --udid "$udid" >/dev/null
  sleep 1.5
  kill -INT "$record"
  wait "$record" 2>/dev/null || true
  # Real speed, resampled to a steady 60fps (the recorder writes frames only
  # when the screen changes).
  if command -v ffmpeg >/dev/null; then
    ffmpeg -y -loglevel error -i "$dir/scroll-raw.mp4" -vf fps=60 -c:v libx264 -pix_fmt yuv420p "$dir/scroll.mp4"
    rm "$dir/scroll-raw.mp4"
  else
    mv "$dir/scroll-raw.mp4" "$dir/scroll.mp4"
    echo "$label: no ffmpeg, scroll.mp4 is the recorder's own frame rate" >&2
  fi

  # The same rest, dark.
  "$AXE" drag --start-x "$x" --start-y "$low" --end-x "$x" --end-y $((low - 200)) \
    --duration 3 --steps 180 --udid "$udid" >/dev/null
  sleep 1
  xcrun simctl ui "$udid" appearance dark
  sleep 2
  xcrun simctl io "$udid" screenshot "$dir/scrolled-dark.png" >/dev/null
  # Out to Settings and back: the held blur is built again on the scene's return.
  xcrun simctl launch "$udid" com.apple.Preferences >/dev/null
  sleep 3
  xcrun simctl launch "$udid" dev.cawco.app >/dev/null
  sleep 2
  xcrun simctl io "$udid" screenshot "$dir/returned-dark.png" >/dev/null
  crop_top "$dir/scrolled-light.png" "$dir/crop-scrolled-light.png" "$screen_w"
  crop_top "$dir/scrolled-dark.png" "$dir/crop-scrolled-dark.png" "$screen_w"
  crop_top "$dir/returned-dark.png" "$dir/crop-returned-dark.png" "$screen_w"
  ls -l "$dir"
}

capture newest newest
capture ios18 18
echo "Captures: $OUT"

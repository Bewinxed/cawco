#!/usr/bin/env bash
# Holds one of the Mac's shared slots while a command runs. Simulators and
# builds outside build-both.sh go through mac-slot.sh.
#
#   mac-slot.sh build -- <cmd...>
#   mac-slot.sh sim [--runtime <id>] [--device <type name or id>] -- <cmd...>
#
# --device takes a device type's name ("iPhone 16 Pro Max") or its
# identifier (com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max).
#
# build: the one Mac build slot, the same lock build-both.sh and TestFlight's
# archive hold, so the Mac runs at most one Xcode build at a time.
# sim: one of two simulator slots. It clones a simulator named "CawCo slot
# <n>" from a settled template (below) and boots it (by default the newest
# iPhone Pro whose runtime meets project.yml's iOS target, as build-both.sh
# picks), runs the command with CAWCO_SIM_UDID set, then shuts the simulator
# down and deletes it.
# A waiter prints "CAWCO-QUEUE wait <slot>: <who holds it, for how long>"
# every 60 s, and "CAWCO-QUEUE held <slot>" once it holds the slot: the queue
# marker (core harness.ts QUEUE_MARKER). A CawCo check's time limit stands
# between the two, for 3 h at most.
#
# Nesting: build outside, sim inside (mac-slot.sh build -- mac-slot.sh sim --
# xcodebuild test ...). The other order, or a slot inside the same kind,
# could wait forever on a slot its own caller holds, so it is refused.
#
# The locks live in one folder for every caller: workspaces, a person's or
# the orchestrator's SSH, TestFlight. A keeper process, in its own process
# group, holds the slot. The caller (this script) holds the keeper's stdin
# open; when it ends, however it ends (SIGKILL too), the keeper reads EOF,
# TERMs then KILLs the command's process group, deletes the slot's
# simulator and frees the slot.
# macOS bash 3.2: no flock, so shlock.
set -euo pipefail

LOCKS=$HOME/.cawco/workspace-cache/xdg/cawco-apple/.locks
usage() {
  echo "usage: mac-slot.sh build -- <cmd...> | mac-slot.sh sim [--runtime <id>] [--device <type name or id>] -- <cmd...>" >&2
  exit 2
}
# As called, for the heavy run below to start it again.
ARGS=("$@")
MODE=${1:-}
case $MODE in
  build | sim) shift ;;
  *) usage ;;
esac
RUNTIME=
TYPE=
while [[ $# -gt 0 && $1 != -- ]]; do
  case $1 in
    --runtime) [[ $MODE == sim && $# -ge 2 ]] || usage; RUNTIME=$2; shift 2 ;;
    --device) [[ $MODE == sim && $# -ge 2 ]] || usage; TYPE=$2; shift 2 ;;
    *) usage ;;
  esac
done
[[ ${1:-} == -- && $# -ge 2 ]] || usage
shift
case ${CAWCO_MAC_SLOT:-}:$MODE in
  :* | build:sim) ;;
  *)
    echo "mac-slot.sh $MODE inside a ${CAWCO_MAC_SLOT} slot would wait on its own caller. Take the build slot outside and the simulator inside: mac-slot.sh build -- mac-slot.sh sim -- <cmd>" >&2
    exit 2 ;;
esac
command -v shlock >/dev/null || { echo "shlock is required" >&2; exit 2; }
# Either slot is a heavy run on this Mac (core heavy-run.ts) for this
# script's life: a booted simulator loads it as a build does, and from 11:29
# to 11:57 on 2026-10-17 a second simulator beside a held build, booted by a
# probe that held no run, drove the 1-minute load past 200 on 10 cores. The
# script runs again under the installed `cawco heavy-run`, which holds the
# run until it ends; that serves a checkout and build-both.sh's copy of
# apps/apple (no scripts/lib, reached over SSH from Linux) alike. A caller
# that holds a run (build-both.sh, a probe kit run, mac-sim.ts) passes
# CAWCO_HEAVY_RUN_HELD and takes none here.
if [[ -z ${CAWCO_HEAVY_RUN_HELD:-} ]]; then
  exec "$HOME/.local/bin/cawco" heavy-run "$(printf '%q ' bash "$0" "${ARGS[@]}")"
fi
LABEL="$(basename "$PWD") $(basename "$1") (pid $$)"

read -r -d '' KEEPER <<'EOF' || true
set -u
MODE=$1
LOCKS=$2
LABEL=$3
CALLER=$4
# Only EOF on stdin (the caller gone) or TERM ends the keeper.
trap '' INT HUP PIPE
SLOT=
LOCK=
GROUP=
# Every simulator named for this slot, booted or not: one a killed keeper
# left behind goes too.
drop_sims() {
  local udid
  for udid in $(xcrun simctl list devices -j | /usr/bin/python3 -c '
import json, sys
for devices in json.load(sys.stdin)["devices"].values():
    for d in devices:
        if d["name"] == sys.argv[1]:
            print(d["udid"])
' "CawCo slot $SLOT"); do
    # Maestro's runner on it (scripts/lib/sim-touch.ts): the `xcodebuild
    # test-without-building` its `maestro hierarchy` leaves up, which nothing
    # else ends and which outlives its simulator's deletion, idle under
    # launchd (three, 1.5 days old, on 2026-10-17). In a workspace the
    # boundary's xcodebuild shim puts its flags between the two words.
    pkill -f "[x]codebuild .*test-without-building .*-destination id=$udid( |$)" || true
    xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true
    xcrun simctl delete "$udid" >/dev/null 2>&1 || true
    echo "mac-slot: deleted simulator CawCo slot $SLOT $udid" >&2
  done
}
end() {
  if [[ -n $GROUP ]]; then
    kill -TERM -- "-$GROUP" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
      kill -0 -- "-$GROUP" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL -- "-$GROUP" 2>/dev/null || true
  fi
  if [[ $MODE == sim && -n $SLOT ]]; then drop_sims; fi
  if [[ -n $LOCK && -f $LOCK && $(cat "$LOCK" 2>/dev/null) == $$ ]]; then
    rm -f "$LOCK.owner" "$LOCK"
  fi
}
trap end EXIT
trap 'exit 143' TERM
held() { # <lock>: who holds it and for how long
  local now since=0 who=unknown
  now=$(date +%s)
  if [[ -f $1.owner ]]; then read -r since who <"$1.owner" || true; fi
  [[ $since =~ ^[0-9]+$ ]] || since=$now
  echo "$who for $((now - since)) s"
}

mkdir -p "$LOCKS"
next_notice=0
waited=
while :; do
  if [[ $MODE == build ]]; then
    if shlock -p $$ -f "$LOCKS/.machine"; then SLOT=machine; LOCK=$LOCKS/.machine; fi
  else
    for n in 1 2; do
      if shlock -p $$ -f "$LOCKS/sim-$n"; then SLOT=$n; LOCK=$LOCKS/sim-$n; break; fi
    done
  fi
  [[ -z $SLOT ]] || break
  # A caller that leaves while waiting gives up its place.
  kill -0 "$CALLER" 2>/dev/null || exit 0
  now=$(date +%s)
  if ((now >= next_notice)); then
    # The queue marker (core harness.ts QUEUE_MARKER): a CawCo check's clock
    # stands from this line to the held line.
    if [[ $MODE == build ]]; then
      echo "CAWCO-QUEUE wait build: $(held "$LOCKS/.machine")" >&2
    else
      echo "CAWCO-QUEUE wait sim: $(held "$LOCKS/sim-1") and $(held "$LOCKS/sim-2")" >&2
    fi
    waited=1
    next_notice=$((now + 60))
  fi
  sleep 5
done
printf '%s %s\n' "$(date +%s)" "$LABEL" >"$LOCK.owner"
[[ -z $waited ]] || echo "CAWCO-QUEUE held $MODE" >&2
if [[ $MODE == sim ]]; then drop_sims; fi
echo "SLOT $SLOT"
exec >&2
# The caller names its command's process group, then holds stdin open until
# it ends.
while IFS= read -r line; do
  case $line in
    RUN\ *) GROUP=${line#RUN } ;;
  esac
done
EOF

# The keeper's stdin and stdout are two FIFOs on fds 3 (to it) and 4 (from
# it), as build-both.sh links to the Mac side.
LINK=$(mktemp -d "${TMPDIR:-/tmp}/mac-slot.XXXXXX")
mkfifo "$LINK/in" "$LINK/out"
perl -e 'setpgrp(0, 0); exec @ARGV or die "exec: $!\n"' \
  bash --norc -c "$KEEPER" mac-slot-keeper "$MODE" "$LOCKS" "$LABEL" $$ <"$LINK/in" >"$LINK/out" &
KEEPER_PID=$!
exec 3>"$LINK/in" 4<"$LINK/out"
rm -rf "$LINK"
finish() {
  exec 3>&-
  wait "$KEEPER_PID" 2>/dev/null || true
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

reply=
IFS= read -r reply <&4 || true
exec 4<&-
[[ $reply == SLOT\ * ]] || { echo "mac-slot: the keeper ended without a slot" >&2; exit 1; }
SLOT=${reply#SLOT }

# Commands below close fds 3 and 4: only this shell may hold the keeper's
# link, or a killed caller's EOF never reaches it.

# A slot's simulator is a clone (simctl clone) of a template of its device
# type and runtime: a device that booted once, took the settings below, sat
# through iOS's first-boot work (Photos, widgets, Spotlight and the rest:
# minutes of several cores) until its data folder stopped changing, and shut
# down. The clone carries the template's data folder, so it boots without
# that work. A template is made on first need under the template lock and
# named for its device type, runtime build and TEMPLATE_VERSION ("CawCo
# template iPhone-16-Pro 22F77 v1"): a runtime update or a new version makes a
# new one and deletes the old. While it is made it is the slot's simulator
# ("CawCo slot <n>"), so a caller that dies leaves the keeper to delete it.
# Bump TEMPLATE_VERSION when the settings change.
# Settling, as measured on iOS 18.5 (iPhone 16 Pro, 2026-10-13): the storm
# (STExtractionService, mobileassetd's asset downloads, nsurlsessiond,
# thousands of files a look) ends about 2 min after boot; a second wave
# (MobileAsset, CoreSpotlight, Avatar, dataaccessd) runs at 9 to 11 min; after
# that a trickle of 0 to 3 files a look (xpc activity plists) never stops.
TEMPLATE_VERSION=1
SETTLE_EVERY=15   # s between looks at the template's data folder
SETTLE_FLOOR=720  # s settling (after boot finishes) before a look can count as quiet: past the second wave
SETTLE_TRICKLE=3  # files written in a look that still count as quiet
SETTLE_QUIET=4    # quiet looks in a row: settled
SETTLE_LIMIT=2700 # s: a template still writing then fails the slot (iOS 27.2 took 1185 s at load 600+)
fail() {
  echo "mac-slot: $*" >&2
  exit 1
}
device_field() { # <udid> <field>: the device's field in simctl's list
  xcrun simctl list devices -j | /usr/bin/python3 -I -c '
import json, sys
for devices in json.load(sys.stdin)["devices"].values():
    for d in devices:
        if d["udid"] == sys.argv[1]:
            print(d[sys.argv[2]])
' "$1" "$2"
}
# Waits until the device's data folder (aside from its unified log store,
# which any process writes to, and tmp and var/run, which boot clears) has had
# at most SETTLE_TRICKLE files written in each of SETTLE_QUIET looks in a row,
# past SETTLE_FLOOR.
settle() { # <udid>
  local data stamp quiet=0 waited=0 written=0
  data=$(device_field "$1" dataPath) && [[ -d $data ]] || fail "no data folder for $1"
  stamp=$(mktemp "${TMPDIR:-/tmp}/mac-slot-settle.XXXXXX") || fail "mktemp failed"
  while ((quiet < SETTLE_QUIET)); do
    if ((waited >= SETTLE_LIMIT)); then
      rm -f "$stamp"
      fail "$TEMPLATE did not settle in $SETTLE_LIMIT s: $written files written in its last $SETTLE_EVERY s"
    fi
    touch "$stamp"
    sleep "$SETTLE_EVERY"
    waited=$((waited + SETTLE_EVERY))
    written=$(find "$data" -type f -newer "$stamp" ! -path "$data/var/db/diagnostics/*" ! -path "$data/var/db/uuidtext/*" ! -path "$data/tmp/*" ! -path "$data/var/run/*" 2>/dev/null | wc -l | tr -d ' ')
    if ((waited > SETTLE_FLOOR && written <= SETTLE_TRICKLE)); then quiet=$((quiet + 1)); else quiet=0; fi
    if ((waited % 60 == 0)); then
      echo "mac-slot: settling $TEMPLATE: $waited s, $written files written in the last $SETTLE_EVERY s" >&2
    fi
  done
  rm -f "$stamp"
  echo "mac-slot: $TEMPLATE settled after $waited s" >&2
}
make_template() { # the new template's UDID
  local udid
  echo "mac-slot: making $TEMPLATE: first boot, then settling (minutes)" >&2
  udid=$(xcrun simctl create "CawCo slot $SLOT" "$TYPE" "$RUNTIME") || fail "cannot create a $TYPE on $RUNTIME for $TEMPLATE"
  xcrun simctl boot "$udid" || fail "cannot boot $TEMPLATE ($udid)"
  xcrun simctl bootstatus "$udid" -b >/dev/null || fail "$TEMPLATE ($udid) did not finish booting"
  # The probes' settings: the keyboard's first-use tips ("Speed up your
  # typing…") would cover what a capture shows; light appearance.
  xcrun simctl spawn "$udid" defaults write com.apple.keyboard.preferences DidShowContinuousPathIntroduction -bool true &&
    xcrun simctl spawn "$udid" defaults write com.apple.keyboard.preferences KeyboardDidShowProductivityTutorial -bool true &&
    xcrun simctl ui "$udid" appearance light || fail "cannot write $TEMPLATE's settings"
  settle "$udid"
  xcrun simctl shutdown "$udid" || fail "cannot shut $TEMPLATE ($udid) down"
  xcrun simctl rename "$udid" "$TEMPLATE" || fail "cannot name $udid $TEMPLATE"
  echo "$udid"
}
slot_sim() { # the slot's new simulator's UDID, cloned from its template
  local template= line out now next=0 waited=
  trap '[[ $(cat "$LOCKS/template" 2>/dev/null) != $$ ]] || rm -f "$LOCKS/template.owner" "$LOCKS/template"' EXIT
  until shlock -p $$ -f "$LOCKS/template"; do
    now=$(date +%s)
    if ((now >= next)); then
      echo "CAWCO-QUEUE wait template: $(cat "$LOCKS/template.owner" 2>/dev/null || echo unknown), making a template" >&2
      waited=1
      next=$((now + 60))
    fi
    sleep 5
  done
  echo "$LABEL" >"$LOCKS/template.owner"
  [[ -z $waited ]] || echo "CAWCO-QUEUE held template" >&2
  # This template if it is ready; templates for this device type and runtime
  # from another runtime build or version, a half-made one, and those whose
  # runtime is gone, deleted.
  out=$(xcrun simctl list devices -j | /usr/bin/python3 -I -c '
import json, sys
name, runtime, kind = sys.argv[1:4]
kept = False
for rt, devices in json.load(sys.stdin)["devices"].items():
    for d in devices:
        if not d["name"].startswith("CawCo template "):
            continue
        if not kept and d["name"] == name and d["state"] == "Shutdown" and d["isAvailable"]:
            kept = True
            print("keep", d["udid"])
        elif d["name"] == name or not d["isAvailable"] or (rt == runtime and d["deviceTypeIdentifier"] == kind):
            print("drop", d["udid"])
' "$TEMPLATE" "$RUNTIME" "$TYPE") || fail "cannot list simulators"
  while read -r line; do
    case $line in
      keep\ *) template=${line#keep } ;;
      drop\ *)
        xcrun simctl delete "${line#drop }" || fail "cannot delete the old template ${line#drop }"
        echo "mac-slot: deleted old template ${line#drop }" >&2 ;;
    esac
  done <<<"$out"
  [[ -n $template ]] || template=$(make_template) || exit 1
  out=$(xcrun simctl clone "$template" "CawCo slot $SLOT" 2>&1) || fail "cannot clone $TEMPLATE ($template) for slot $SLOT: $out"
  [[ $out =~ ^[0-9A-F-]{36}$ ]] || fail "cloning $TEMPLATE ($template) for slot $SLOT gave no UDID: $out"
  echo "$out"
}

if [[ $MODE == sim ]]; then
  # --device by name or identifier: its identifier from here on.
  if [[ -n $TYPE ]]; then
    GIVEN=$TYPE
    TYPE=$(xcrun simctl list devicetypes -j 3>&- 4<&- | /usr/bin/python3 -I -c '
import json, sys
given = sys.argv[1]
for t in json.load(sys.stdin)["devicetypes"]:
    if given in (t["name"], t["identifier"]):
        print(t["identifier"])
        break
' "$TYPE") || fail "cannot list simulator device types"
    [[ -n $TYPE ]] || fail "no simulator device type is named or identified \"$GIVEN\" (xcrun simctl list devicetypes)"
  fi
  if [[ -z $RUNTIME || -z $TYPE ]]; then
    MIN_IOS=$(sed -n 's/^ *iOS: "\([0-9.]*\)"$/\1/p' "$(dirname "$0")/../project.yml" | head -1)
    PICK=$(/usr/bin/python3 -c '
import json, re, subprocess, sys
runtime, kind, minimum = sys.argv[1:4]
need = tuple(int(p) for p in minimum.split(".")) if minimum else (0,)
listed = subprocess.run(["xcrun", "simctl", "list", "devices", "available", "-j"], capture_output=True, text=True, check=True)
best = None
for rt, devices in json.loads(listed.stdout)["devices"].items():
    m = re.search(r"\.iOS-(\d+)-(\d+)$", rt)
    if not m or (runtime and rt != runtime) or (not runtime and (int(m[1]), int(m[2])) < need):
        continue
    for d in devices:
        pro = re.fullmatch(r"iPhone (\d+) Pro", d["name"])
        if (kind and d["deviceTypeIdentifier"] == kind) or (not kind and pro):
            key = (int(pro[1]) if pro else 0, int(m[1]), int(m[2]))
            if best is None or key > best[0]:
                best = (key, rt, d["deviceTypeIdentifier"])
if best is None:
    sys.exit("mac-slot: no simulator matches runtime=%s device=%s (iOS >= %s)" % (runtime or "any", kind or "iPhone Pro", minimum))
print(best[1], best[2])
' "$RUNTIME" "$TYPE" "$MIN_IOS" 3>&- 4<&-)
    read -r RUNTIME TYPE <<<"$PICK"
  fi
  BUILD=$(xcrun simctl list runtimes -j 3>&- 4<&- | /usr/bin/python3 -I -c '
import json, sys
for r in json.load(sys.stdin)["runtimes"]:
    if r["identifier"] == sys.argv[1] and r["isAvailable"]:
        print(r["buildversion"])
' "$RUNTIME") || fail "cannot list simulator runtimes"
  [[ -n $BUILD ]] || fail "runtime $RUNTIME is not installed"
  TEMPLATE="CawCo template ${TYPE#com.apple.CoreSimulator.SimDeviceType.} $BUILD v$TEMPLATE_VERSION"
  CAWCO_SIM_UDID=$(slot_sim 3>&- 4<&-) || exit 1
  xcrun simctl boot "$CAWCO_SIM_UDID" 3>&- 4<&-
  xcrun simctl bootstatus "$CAWCO_SIM_UDID" -b >/dev/null 3>&- 4<&-
  echo "SIMULATOR CawCo slot $SLOT $CAWCO_SIM_UDID ($TYPE, $RUNTIME, cloned from $TEMPLATE)" >&2
  export CAWCO_SIM_UDID
fi
export CAWCO_MAC_SLOT=$MODE
# A background command's stdin is /dev/null unless named: pass ours through.
exec 5<&0
perl -e 'setpgrp(0, 0); exec @ARGV or die "exec: $!\n"' "$@" <&5 3>&- 5<&- &
GROUP=$!
echo "RUN $GROUP" >&3
status=0
wait "$GROUP" || status=$?
exit "$status"

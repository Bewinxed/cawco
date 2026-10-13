#!/usr/bin/env bash
# Holds one of the Mac's shared slots while a command runs. Simulators and
# builds outside build-both.sh go through mac-slot.sh.
#
#   mac-slot.sh build -- <cmd...>
#   mac-slot.sh sim [--runtime <id>] [--device <type>] -- <cmd...>
#
# build: the one Mac build slot, the same lock build-both.sh and TestFlight's
# archive hold, so the Mac runs at most one Xcode build at a time.
# sim: one of two simulator slots. It creates and boots a simulator named
# "CawCo slot <n>" (by default the newest iPhone Pro whose runtime meets
# project.yml's iOS target, as build-both.sh picks), runs the command with
# CAWCO_SIM_UDID set, then shuts the simulator down and deletes it.
# A waiter prints a WAITING line every 60 s.
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
  echo "usage: mac-slot.sh build -- <cmd...> | mac-slot.sh sim [--runtime <id>] [--device <type>] -- <cmd...>" >&2
  exit 2
}
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
  echo "$who has held it for $((now - since)) s"
}

mkdir -p "$LOCKS"
next_notice=0
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
    if [[ $MODE == build ]]; then
      echo "WAITING for the Mac build slot: $(held "$LOCKS/.machine")" >&2
    else
      echo "WAITING for a simulator slot: slot 1: $(held "$LOCKS/sim-1"); slot 2: $(held "$LOCKS/sim-2")" >&2
    fi
    next_notice=$((now + 60))
  fi
  sleep 5
done
printf '%s %s\n' "$(date +%s)" "$LABEL" >"$LOCK.owner"
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
if [[ $MODE == sim ]]; then
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
  CAWCO_SIM_UDID=$(xcrun simctl create "CawCo slot $SLOT" "$TYPE" "$RUNTIME" 3>&- 4<&-)
  xcrun simctl boot "$CAWCO_SIM_UDID" 3>&- 4<&-
  xcrun simctl bootstatus "$CAWCO_SIM_UDID" -b >/dev/null 3>&- 4<&-
  echo "SIMULATOR CawCo slot $SLOT $CAWCO_SIM_UDID ($TYPE, $RUNTIME)" >&2
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

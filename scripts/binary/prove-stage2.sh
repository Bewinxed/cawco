#!/bin/bash
# Proof of the binary installer and the app-driven updater, in rootless
# containers with real systemd. Usage:
#   bun scripts/binary/build-stage2.ts /ABSOLUTE/BINARIES        # once, builds what this needs
#   bash scripts/binary/prove-stage2.sh /ABSOLUTE/FRESH/OUTPUT /ABSOLUTE/BINARIES
# Needs podman and bun on the host. Every container sits on one internal
# network with no route out: a release host (a folder served over loopback-style
# HTTP), a hub machine and a joining machine. Throwaway signing keys are
# deleted when the script ends. Each check prints one line ending in PASS or FAIL.
set -uo pipefail
[[ $# == 2 && "$1" = /* && "$2" = /* ]] || { echo "usage: $0 /absolute/fresh/output /absolute/binaries" >&2; exit 2; }
mkdir -p "$1"
out=$(realpath "$1")
bins=$(realpath "$2")
[[ "$out" != *" "* ]] || { echo "output path may not contain spaces" >&2; exit 2; }
# podman's exec with a terminal (every installer that answers prompts) makes its console socket in TMPDIR,
# $out/tmp/conmon-term.XXXXXX, and a unix socket's path holds 107 bytes: past that the exec fails with
# "crun: error opening …/conmon-term.XXXXXX: No such file or directory" (run-2, a 109-byte path).
TERM_SOCKET=/tmp/conmon-term.XXXXXX
(( ${#out} + ${#TERM_SOCKET} <= 107 )) || { echo "the output path is ${#out} characters; podman's console socket under it, $out$TERM_SOCKET, must fit 107, so it may be at most $(( 107 - ${#TERM_SOCKET} ))" >&2; exit 2; }
here=$(dirname "$(realpath "$0")")
python3 -c 'import pexpect' 2> /dev/null || { echo "python3 with pexpect is needed to answer the installer's prompts (pip install pexpect)" >&2; exit 2; }
for need in cawco-1 cawco-2 cawco-3 cawco-4 cawco-5 cawco-6 cawco-7 cawco-8 cawco-9 keys/test-release-private.pem keys/test-release-public.pem; do
  [[ -e "$bins/$need" ]] || { echo "missing $bins/$need: run build-stage2.ts first" >&2; exit 2; }
done
free_gb=$(df -BG --output=avail "$out" | tail -n 1 | tr -dc 0-9)
(( free_gb >= 15 )) || { echo "only ${free_gb}G is free where $out is; the proof needs 15G (a full disk made podman fail with 'database or disk is full' in an earlier run)" >&2; exit 2; }
mkdir -p "$out/tmp" "$out/config" "$out/cache" "$out/logs" "$out/release" "$out/shared" "$out/image-host" "$out/image-machine"
export TMPDIR="$out/tmp" XDG_CONFIG_HOME="$out/config" XDG_CACHE_HOME="$out/cache"
export REGISTRY_AUTH_FILE="$out/config/auth.json"
printf '{"auths":{}}\n' > "$REGISTRY_AUTH_FILE"
# Rootless networking cannot use a run folder under the home directory on every host.
rr="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/cawco-proof-stage2-$$"
mkdir -p "$rr"
export P="podman --root $out/storage --runroot $rr --storage-driver vfs"
export out bins here
export prefix="cawco-binary-stage2-$$"
export net="$prefix-net" hubc="$prefix-hub" joinerc="$prefix-joiner" releasec="$prefix-release" freshc="$prefix-fresh" hub2c="$prefix-hub2"
export hub_ip=10.89.77.3 joiner_ip=10.89.77.4 release_ip=10.89.77.2 fresh_ip=10.89.77.5 hub2_ip=10.89.77.6
# The migration count the hub's database really has: fixtures carry it, or no build would be newer than the data.
schema=$(bun -e "console.log(JSON.parse(await Bun.file('$(realpath "$here/../..")/packages/hub/drizzle/meta/_journal.json').text()).entries.length)")
export schema
export feed="http://$release_ip:8000/ok"
key="$bins/keys/test-release-private.pem"
fixture() { bun "$here/stage2-fixture.ts" "$@"; }
export -f fixture
export key
status=0

cleanup() {
  $P rm -f "$hubc" "$joinerc" "$releasec" "$freshc" "$hub2c" >/dev/null 2>&1 || true
  $P network rm -f "$net" >/dev/null 2>&1 || true
  $P rmi -f "localhost/$prefix-machine:latest" "localhost/$prefix-host:latest" docker.io/library/ubuntu:24.04 >/dev/null 2>&1 || true
  rm -f "$bins/keys/test-release-private.pem" "$bins/keys/test-release-public.pem"
  # Image storage is written by mapped user ids: reset it, then remove it from inside the user namespace.
  $P system reset -f >/dev/null 2>&1 || true
  podman unshare rm -rf "$out/storage" "$rr" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------- helpers

# Setup steps stop the script: a check run against a missing container proves nothing.
setup() {
  local step=$1 log=$2
  shift 2
  if ! "$@" > "$log" 2>&1; then
    echo "setup failed at: $step (log: $log)" >&2
    tail -n 20 "$log" >&2
    exit 3
  fi
}
export -f setup 2>/dev/null || true

# One check: runs the function in its own shell (so set -e applies inside it) under a time limit
# (third argument, seconds, default 600), keeps its output in a log, prints one line.
# A check that runs out of time fails and the next one runs.
declare -A VERDICT
# check NAME FUNCTION [LIMIT_SECONDS=600] [DEPENDS_ON_CHECK_NAME] [HUB_GOOD_VERSION_AFTER_PASS]
# A third verdict beside PASS and FAIL: NOT RUN, when the check it depends on did not pass.
check() {
  local name=$1 fn=$2 limit=${3:-600} needs=${4:-} good=${5:-} log rc=0
  log="$out/logs/$(echo "$name" | tr -cs 'A-Za-z0-9' '-').log"
  LAST_LOG=$log
  # PROOF_ONLY (an extended regex) runs only the checks whose names match it: a check being worked on, with the
  # checks it builds on. Every other check says SKIPPED, never PASS, so a partial run never reads as a whole one.
  if [[ -n ${PROOF_ONLY:-} ]] && ! [[ $name =~ $PROOF_ONLY ]]; then
    echo "$name: SKIPPED (PROOF_ONLY)"
    VERDICT[$name]=SKIPPED
    return
  fi
  if [[ -n $needs && ${VERDICT[$needs]:-} != PASS ]]; then
    echo "$name: NOT RUN (depends on \"$needs\", which did not pass)"
    echo "not run: depends on \"$needs\", which did not pass" > "$log"
    VERDICT[$name]=NOTRUN
    status=1
    return
  fi
  {
    echo "check: $name"
    echo "function: $fn"
    echo "time limit: ${limit}s"
    echo "started: $(date -u +%FT%TZ)"
    echo "---- trace: every command the check runs is printed after a '+', with its output below it;"
    echo "---- a command that fails prints 'ERR: exit N from: <command>'"
  } > "$log"
  # -x prints each command, the ERR trap prints each failing command's exit status (-E: inside functions too).
  PS4='+ [${FUNCNAME[0]:-main}:${LINENO}] ' timeout --kill-after=10 "$limit" \
    bash -eEx -c "trap 'echo \"ERR: exit \$? from: \$BASH_COMMAND\" >&2' ERR; $fn" >> "$log" 2>&1 < /dev/null || rc=$?
  echo "---- the check ended with exit status $rc at $(date -u +%FT%TZ)" >> "$log"
  if [[ $rc == 0 ]]; then
    echo "$name: PASS"
    VERDICT[$name]=PASS
    [[ -z $good ]] || echo "$good" > "$out/hub-good-version"
    return
  fi
  VERDICT[$name]=FAIL
  if [[ $rc == 124 || $rc == 137 ]]; then
    echo "$name: FAIL (timed out after ${limit}s, see $log)"
  else
    echo "$name: FAIL (see $log)"
  fi
  status=1
  timeout --kill-after=10 300 bash -c diagnose >> "$log" 2>&1 < /dev/null || true
  reset_hub_machine "$log"
}

# After a failed check the hub machine goes back to a known working state before the next check starts,
# so a later verdict does not depend on what an earlier failure left behind. Silent when it is already fine.
reset_hub_machine() {
  local log=$1 good used text line status_code=0
  [[ -s "$out/hub-good-version" ]] || return 0
  good=$(cat "$out/hub-good-version")
  text=$(timeout --kill-after=10 400 bash -c 'as_user "$@"' _ "$hubc" sh /shared/reset-hub.sh "$good" 2>&1 < /dev/null) || status_code=$?
  # The script ends with GOODVERSION=<the build it used>: the last good one when its directory is on disk, else the build current names.
  used=$(sed -n 's/^GOODVERSION=//p' <<< "$text" | tail -n 1)
  text=$(grep -v '^GOODVERSION=' <<< "$text" || true)
  if [[ $status_code == 0 ]]; then
    [[ -z $used ]] || echo "$used" > "$out/hub-good-version"
    [[ -z $text ]] || line="reset: the hub machine was put back on ${used:-$good} ($text)"
  else
    line="reset: the hub machine could NOT be put back on ${used:-$good}: $text"
  fi
  [[ -z ${line:-} ]] || { echo "$line"; echo "$line" >> "$log"; }
}



# What a failed check appends to its log, for every machine container that exists.
# The state listing runs in the container from /shared/diagnose-machine.sh (written below).
diagnose() {
  local c unit
  asu() { timeout 30 bash -c 'as_user "$@"' _ "$@" 2>&1; }
  echo
  echo "================ diagnostics after the failure ================"
  echo "host disk: $(df -h --output=avail "$out" | tail -n 1 | tr -d ' ') free where $out is"
  for c in "$hubc" "$joinerc" "$freshc" "$hub2c"; do
    $P container exists "$c" 2> /dev/null || continue
    echo
    echo "################ $c"
    echo "---- systemctl --user status 'cawco-*' (first 40 lines)"
    asu "$c" systemctl --user --no-pager status 'cawco-*' | head -n 40
    for unit in hub dashboard agent 'sessiond*'; do
      echo "---- journal cawco-$unit.service (last 80)"
      asu "$c" journalctl --user --no-pager -n 80 -u "cawco-$unit.service"
    done
    echo "---- update helper log, installation, trial and migration files"
    asu "$c" sh /shared/diagnose-machine.sh
  done
  if $P container exists "$hubc" 2> /dev/null; then
    echo
    echo "---- the hub's /api/binary-updates/machines"
    asu "$hubc" curl -sS --max-time 10 http://127.0.0.1:3456/api/binary-updates/machines || echo "(the hub did not answer)"
    echo
  fi
}
export -f diagnose

# A check that needs the hub starts here.
need_hub() {
  as_user "$hubc" curl -fsS --max-time 10 http://127.0.0.1:3456/health > /dev/null 2>&1 || { echo "the hub is not answering"; return 1; }
}
export -f need_hub

# Commands as the unprivileged user, inside a machine container's systemd user session.
as_user() {
  local c=$1; shift
  $P exec -i --user cawco --workdir /home/cawco --env HOME=/home/cawco \
    --env XDG_RUNTIME_DIR=/run/user/1000 --env DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    --env CAWCO_RELEASE_HOST="${FEED_OVERRIDE:-$feed}" "$c" "$@"
}
# The same with a terminal, as a person typing answers would have one.
as_user_tty() {
  local c=$1; shift
  as_user "$c" script -qec "$*" /dev/null
}
hub_api() { as_user "$hubc" curl -fsS "http://127.0.0.1:3456$1" "${@:2}"; }
json() { bun -e "const t = await Bun.stdin.text(); if (!t.trim()) process.exit(0); const d = JSON.parse(t); const v = ($1)(d); console.log(v === undefined ? '' : v)"; }
machine_id() { hub_api /api/agents | json "d => d.find(a => a.hostname === '$1')?.machineId"; }
build_version() { hub_api /api/agents | json "d => d.find(a => a.machineId === '$1')?.build?.version"; }
phase() { hub_api /api/binary-updates/machines | json "d => d.machines['$1']?.phase"; }
field() { hub_api /api/binary-updates/machines | json "d => d.machines['$1']?.$2"; }
# The keepers of earlier builds still holding something on a machine, as its update state says: `<build>:<held> ...`.
retiring() { hub_api /api/binary-updates/machines | json "d => (d.machines['$1']?.retiringKeepers ?? []).map(k => k.version + ':' + k.sessions).join(' ')"; }
wait_until() {
  local seconds=$1; shift
  local end=$((SECONDS + seconds))
  until eval "$*"; do
    (( SECONDS < end )) || { echo "timed out after ${seconds}s waiting for: $*"; return 1; }
    sleep 2
  done
}
publish() { fixture release "$out/release" "$@"; }
api_on() { local c=$1; shift; as_user "$c" curl -fsS "http://127.0.0.1:3456$1" "${@:2}"; }
# Starts a process the session keeper will hold, as a running session's process would be held.
spawn_child() {
  as_user "$1" sh -c 'printf "%s\n" "{\"type\":\"spawn\",\"commandId\":\"hold-$1\",\"procId\":\"boundary-$1\",\"spec\":{\"command\":\"sleep\",\"args\":[\"3000\"]}}" | socat -t1 - UNIX-CONNECT:/run/user/1000/cawco/sessiond.sock > /dev/null' sh "$2"
}
# Starts the in-container watcher that fires at the moment a machine's phase becomes installing (see
# stage2-during-install.ts); its output goes to the file, ending with a `done` line.
watch_install() {
  local container=$1 mode=$2 hub=$3 machine=$4 prefix=$5 file=$6
  : > "$file"
  as_user "$container" env BUN_BE_BUN=1 /home/cawco/.local/bin/cawco /shared/stage2-during-install.ts "$mode" "$hub" "$machine" "$prefix" > "$file" 2>&1 &
}
# The ids the watcher recorded as accepted while the machine was installing, one per line.
watched_ids() { sed -n 's/^accepted //p' "$1"; }
export -f watch_install watched_ids
# Asks the hub, from inside its own container, to start a session on a machine, the way the dashboard does.
start_session() { as_user "$hubc" env BUN_BE_BUN=1 /home/cawco/.local/bin/cawco /shared/stage2-start-session.ts http://127.0.0.1:3456 "$1" "$2"; }
# Keeps asking until the stop file appears. A start is written down only if the hub accepted it
# while the machine was installing, as the hub itself reported before and after.
start_loop() {
  local machine=$1 prefix=$2 accepted=$3 stop=$4 n=0 before after
  : > "$accepted"
  while [[ ! -e "$stop" ]]; do
    n=$((n + 1))
    before=$(phase "$machine" 2> /dev/null || true)
    if start_session "$machine" "$prefix-$n" > /dev/null 2>&1; then
      after=$(phase "$machine" 2> /dev/null || true)
      if [[ $before == installing && $after == installing ]]; then echo "$prefix-$n" >> "$accepted"; fi
    fi
    sleep 0.5
  done
}
# The machine's session keepers (packages/core/src/keepers.ts): each listens on an endpoint of its own beside the
# machine's, sessiond-<build>.sock (legacy-sessiond-<build>.sock for one set aside from before keepers ran side by
# side), and the machine's endpoint sessiond.sock is a symlink naming the current one, which every new start goes to.
# What the current keeper holds, read from the machine's endpoint: the first line it answers a list with.
keeper_list() { as_user "$1" sh -c 'printf "{\"type\":\"list\"}\n" | socat -t1 - UNIX-CONNECT:/run/user/1000/cawco/sessiond.sock | head -n 1'; }
# What every keeper holds, current and retiring: one listing per line, each with the endpoint it answered on.
keeper_lists() {
  as_user "$1" sh -c 'for s in /run/user/1000/cawco/sessiond-*.sock /run/user/1000/cawco/legacy-sessiond-*.sock; do
    [ -S "$s" ] || continue
    printf "{\"type\":\"list\"}\n" | socat -t1 - UNIX-CONNECT:"$s" 2> /dev/null | head -n 1 | sed "s|^{|{\"endpoint\":\"$(basename "$s")\",|"
  done'
}
# Reads JSON lines into an array for the function given.
jsonl() { bun -e "const t = await Bun.stdin.text(); const d = t.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); const v = ($1)(d); console.log(v === undefined ? '' : v)"; }
# The pids of the live children held under one id, on any keeper (one number when there is exactly one child, as there must be).
child_pids() { keeper_lists "$1" | jsonl "d => d.flatMap(k => k.procs).filter(p => p.alive && p.procId === '$2').map(p => p.pid).join(',')"; }
children_with() { keeper_lists "$1" | jsonl "d => d.flatMap(k => k.procs).filter(p => p.alive && p.procId.startsWith('$2')).length"; }
children_total() { keeper_lists "$1" | jsonl "d => d.flatMap(k => k.procs).filter(p => p.alive).length"; }
# The endpoint of the keeper holding a live child under the id (sessiond-<build>.sock), empty when none does.
holder_of() { keeper_lists "$1" | jsonl "d => d.find(k => k.procs.some(p => p.alive && p.procId === '$2'))?.endpoint"; }
# The live children one keeper holds, by its endpoint's name.
held_on() { keeper_lists "$1" | jsonl "d => d.find(k => k.endpoint === '$2')?.procs.filter(p => p.alive).length ?? 0"; }
# The current keeper's own endpoint, as the machine's endpoint names it (empty when it is a legacy keeper's own socket).
current_endpoint() { as_user "$1" sh -c 'readlink /run/user/1000/cawco/sessiond.sock || true'; }
# A build's keeper's endpoint and unit (keeperService: what a unit name cannot carry becomes _).
endpoint_of() { echo "sessiond-$1.sock"; }
unit_of() { local v=$1; echo "cawco-sessiond-${v//[^A-Za-z0-9._-]/_}.service"; }
# The current keeper's unit: its build's own, or a legacy keeper's cawco-sessiond.service.
current_unit() {
  local e
  e=$(current_endpoint "$1")
  if [[ -z $e ]]; then echo cawco-sessiond.service; return; fi
  e=${e#sessiond-}
  unit_of "${e%.sock}"
}
session_running() { [[ "$(hub_api /api/instances | json "d => d.find(r => r.id === '$1')?.status")" == running ]]; }
# Starts sessions through the hub, waits until each runs, and writes down the pid of the process holding it.
start_before() {
  local machine=$1 container=$2 file=$3; shift 3
  : > "$file"
  for id in "$@"; do
    start_session "$machine" "$id" > /dev/null
    wait_until 60 "session_running $id"
    pid=$(child_pids "$container" "$id")
    [[ -n "$pid" && "$pid" != *,* ]]
    echo "$id $pid" >> "$file"
  done
}
# A session that ran before the update: the very same process still holds it, the machine's agent took it over
# again (the hub lists it as running only when the agent reports it), and nothing else holds it.
survived() {
  local container=$1 file=$2 id pid
  while read -r id pid; do
    [[ "$(child_pids "$container" "$id")" == "$pid" ]]
    as_user "$container" kill -0 "$pid"
    wait_until 120 "session_running $id"
  done < "$file"
}
# Every start accepted during the update runs once: one child under its id, none extra on the machine.
accepted_ran_once() {
  local machine=$1 container=$2 prefix=$3 accepted=$4 id
  [[ "$(wc -l < "$accepted")" -ge 1 ]]
  wait_until 180 '[[ "$(phase '"$machine"')" != installing ]]'
  while read -r id; do
    wait_until 120 "session_running $id"
    [[ "$(child_pids "$container" "$id")" =~ ^[0-9]+$ ]]
  done < "$accepted"
  # One child per running session of this kind on the hub, and no process outside the session holder.
  [[ "$(children_with "$container" "$prefix-")" == "$(hub_api /api/instances | json "d => d.filter(r => r.id.startsWith('$prefix-') && r.status === 'running').length")" ]]
  [[ "$(as_user "$container" sh -c 'pgrep -x sleep | wc -l')" == "$(children_total "$container")" ]]
}
# The main process of a keeper's unit (the current keeper's when no unit is named).
keeper_pid() { as_user "$1" systemctl --user show -p MainPID --value "${2:-$(current_unit "$1")}"; }
# Asks the hub, from inside its own container, to stop a session, the way the dashboard does.
stop_session() { as_user "$hubc" env BUN_BE_BUN=1 /home/cawco/.local/bin/cawco /shared/stage2-stop-session.ts http://127.0.0.1:3456 "$1" "$2"; }
untouched() { as_user "$1" sh -c 'test ! -e "$HOME/.local/share/cawco" && test ! -e "$HOME/.local/bin/cawco" && echo untouched'; }
export -f as_user as_user_tty hub_api api_on spawn_child start_session stop_session start_loop keeper_list keeper_lists jsonl child_pids children_with children_total holder_of held_on current_endpoint endpoint_of unit_of current_unit session_running start_before survived accepted_ran_once keeper_pid untouched json machine_id build_version phase field retiring wait_until publish

boot() {
  local c=$1 ip=$2 name=$3 linger=${4:-linger}
  $P run -d --name "$c" --hostname "$name" --systemd=always --network "$net" --ip "$ip" \
    --mount "type=bind,src=$out/shared,dst=/shared,ro" "localhost/$prefix-machine:latest" /sbin/init > /dev/null
  wait_until 90 "[[ \$($P exec $c systemctl is-system-running 2>/dev/null) =~ ^(running|degraded)\$ ]]"
  [[ $linger == nolinger ]] && return 0
  $P exec "$c" loginctl enable-linger cawco
  wait_until 60 "$P exec $c test -S /run/user/1000/bus"
}
export -f boot

# ---------------------------------------------------------------- images, network, release host

cat > "$out/image-host/Containerfile" <<'EOF'
FROM docker.io/library/ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
EOF
# A machine with nothing CawCo uses: no git, Bun, Node or openssl. Its only package
# source is a local folder holding openssl, so the installer's own package-manager
# step runs for real with no network.
cat > "$out/image-machine/Containerfile" <<'EOF'
FROM docker.io/library/ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends systemd systemd-sysv dbus dbus-user-session curl sudo socat \
 && apt-get install -y --download-only openssl \
 && mkdir /debs && cp /var/cache/apt/archives/*.deb /debs/ \
 && apt-get install -y --no-install-recommends dpkg-dev \
 && (cd /debs && dpkg-scanpackages . > Packages) \
 && apt-get purge -y dpkg-dev && apt-get autoremove -y --purge \
 && rm -f /etc/apt/sources.list /etc/apt/sources.list.d/* \
 && echo 'deb [trusted=yes] file:/debs ./' > /etc/apt/sources.list \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb \
 && usermod -l cawco -d /home/cawco -m ubuntu && groupmod -n cawco ubuntu \
 && echo 'cawco ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/cawco
EOF
echo "building images (network on for this step only)"
setup "pull the base image" "$out/logs/pull.log" $P pull docker.io/library/ubuntu:24.04
setup "build the release host image" "$out/logs/build-host.log" $P build -t "localhost/$prefix-host:latest" "$out/image-host"
setup "build the machine image" "$out/logs/build-machine.log" $P build -t "localhost/$prefix-machine:latest" "$out/image-machine"

# Releases: a good one, and three that must be refused.
sha1111=1111111111111111111111111111111111111111
setup "write the installer" "$out/logs/fixture-installer.log" fixture installer "$bins/keys/test-release-public.pem" "$out/shared/installer.sh"
setup "publish the good release" "$out/logs/fixture-ok.log" publish ok stable 0.0.1-test.1 $sha1111 "$bins/cawco-1" "$key" 10 "$schema"
setup "publish the tampered release" "$out/logs/fixture-tampered.log" publish tampered stable 0.0.1-test.1 $sha1111 "$bins/cawco-1" "$key" 10 "$schema" tamper
setup "publish the bad-signature release" "$out/logs/fixture-badsig.log" publish badsig stable 0.0.1-test.1 $sha1111 "$bins/cawco-1" "$key" 10 "$schema" bad-signature
setup "publish the unsigned release" "$out/logs/fixture-nosig.log" publish nosig stable 0.0.1-test.1 $sha1111 "$bins/cawco-1" "$key" 10 "$schema" no-signature
setup "write the broken build" "$out/logs/fixture-broken.log" fixture broken-binary "$out/broken-cawco"
setup "write the workflow the hub keeps" "$out/logs/fixture-workflow.log" bun -e "await Bun.write('$out/shared/workflow.json', JSON.stringify({name: 'kept-through-rollback', program: 'import { z } from \"zod\"; export const inputs=z.object({name:z.string()}); export default async function(w:Workflow<typeof inputs>){await w.checkpoint(\"binary\",w.inputs);return {name:w.inputs.name};}'}))"
setup "put the session starter where the machines can read it" "$out/logs/starter.log" cp "$here/stage2-start-session.ts" "$here/stage2-stop-session.ts" "$here/stage2-during-install.ts" "$out/shared/"
cat > "$out/shared/reset-hub.sh" <<'EOF'
# Puts the hub machine back on a known working build. $1 is the last good one: used when its directory is
# still on disk, otherwise the build `current` names (provided the hub answers on it after the cleanup below).
# The last line is always GOODVERSION=<the build used>; any other output means something had to change.
good=$1
binary="$HOME/.local/share/cawco/binary"
data="$HOME/.local/share/cawco"
used="the last good build"
if [ ! -d "$binary/versions/$good" ]; then
  now="$(readlink "$binary/current" | sed 's|^versions/||')"
  if [ -n "$now" ] && [ -d "$binary/versions/$now" ]; then
    good=$now
    used="the build current names, the last good build having been removed by the product's prune"
  else
    echo "versions/$good is not there and current names no build that is"
    echo "GOODVERSION=$good"
    exit 3
  fi
fi
healthy() { curl -fsS --max-time 5 http://127.0.0.1:3456/health 2> /dev/null | grep -q "\"version\":\"$good\""; }
# The good build's keeper, and only it. A build whose keeper runs in a unit of its own has it there, on its own
# endpoint, which the machine's endpoint names; the build from before keepers ran side by side (build 1) runs it in
# cawco-sessiond.service on the machine's endpoint itself.
goodunit="cawco-sessiond-$(printf '%s' "$good" | sed 's/[^A-Za-z0-9._-]/_/g').service"
keeper_ok() {
  if [ -f "$HOME/.config/systemd/user/$goodunit" ]; then
    [ "$(readlink /run/user/1000/cawco/sessiond.sock)" = "sessiond-$good.sock" ] && [ "$(systemctl --user is-active "$goodunit")" = active ]
  else
    [ ! -L /run/user/1000/cawco/sessiond.sock ] && [ "$(systemctl --user is-active cawco-sessiond.service)" = active ]
  fi
}
clean() {
  [ ! -e "$binary/apply.lock" ] && [ ! -e "$binary/trial.json" ] && [ ! -e "$data/cawco.db.migrating" ] &&
    ! ls "$binary"/versions/*/cawco.real > /dev/null 2>&1 &&
    [ "$(readlink "$binary/current")" = "versions/$good" ] && [ "$(readlink "$binary/keeper")" = "versions/$good" ] &&
    keeper_ok &&
    grep -qE '"phase":"(none|installed|waiting-sessions|available)"' "$binary/update-state.json" 2> /dev/null
}
if healthy && clean && [ -S /run/user/1000/cawco/sessiond.sock ]; then echo "GOODVERSION=$good"; exit 0; fi
pkill -9 -f binary-apply
systemctl --user stop cawco-agent.service cawco-hub.service cawco-dashboard.service
rm -f "$binary/apply.lock" "$binary/trial.json" "$binary/update-failures.json" "$data/cawco.db.migrating"
for d in "$binary"/versions/*/; do [ -f "${d}cawco.real" ] && mv -f "${d}cawco.real" "${d}cawco"; done
ln -sfn "versions/$good" "$binary/current.reset" && mv -T "$binary/current.reset" "$binary/current"
ln -sfn "versions/$good" "$binary/keeper.reset" && mv -T "$binary/keeper.reset" "$binary/keeper"
sed -i "s/\"installedVersion\":\"[^\"]*\"/\"installedVersion\":\"$good\"/" "$binary/installation.json"
printf '{"phase":"none","installedVersion":"%s","channel":"stable","updatedAt":%s000,"unseen":false,"hostsHub":true}\n' "$good" "$(date +%s)" > "$binary/update-state.json"
# Every keeper goes, with what it holds; the good build writes its own keeper's unit, which is enabled and started.
for unit in $(systemctl --user list-unit-files --no-legend 'cawco-sessiond*.service' | awk '{print $1}'); do
  systemctl --user disable --now "$unit"
  [ "$unit" = cawco-sessiond.service ] || rm -f "$HOME/.config/systemd/user/$unit"
done
rm -f /run/user/1000/cawco/sessiond.sock /run/user/1000/cawco/sessiond-*.sock /run/user/1000/cawco/legacy-sessiond-*.sock
"$binary/versions/$good/cawco" binary-units
systemctl --user daemon-reload
systemctl --user reset-failed
if [ -f "$HOME/.config/systemd/user/$goodunit" ]; then
  rm -f "$HOME/.config/systemd/user/cawco-sessiond.service"
  systemctl --user daemon-reload
  systemctl --user enable --now "$goodunit"
  keeper_up() { [ "$(readlink /run/user/1000/cawco/sessiond.sock)" = "sessiond-$good.sock" ]; }
else
  systemctl --user enable --now cawco-sessiond.service
  keeper_up() { [ -S /run/user/1000/cawco/sessiond.sock ]; }
fi
systemctl --user start cawco-hub.service cawco-dashboard.service cawco-agent.service
n=0
until healthy; do
  n=$((n + 1))
  if [ "$n" = 45 ]; then
    # The hub does not start on its database: the copy taken before the last update goes back, newest first.
    backup=$(ls -t "$data"/cawco.db.pre-*.bak 2> /dev/null | head -n 1)
    [ -n "$backup" ] || { echo "the hub does not answer on $good"; echo "GOODVERSION=$good"; exit 4; }
    systemctl --user stop cawco-hub.service
    mv "$data/cawco.db" "$data/cawco.db.reset-aside" && rm -f "$data/cawco.db-wal" "$data/cawco.db-shm" && cp "$backup" "$data/cawco.db"
    systemctl --user restart cawco-hub.service
  fi
  [ "$n" -lt 90 ] || { echo "the hub does not answer on $good"; echo "GOODVERSION=$good"; exit 4; }
  sleep 2
done
until [ -S /run/user/1000/cawco/sessiond.sock ]; do sleep 1; done
until keeper_up; do sleep 1; done
echo "stopped any update in flight, restored current and keeper and the state files, restarted the services; used $used"
echo "GOODVERSION=$good"
EOF
# Makes a build's session keeper fail to start, or start slowly, without any hook in the product: the build's
# executable is replaced by a stub for one verb. Each build's keeper runs from its own folder in a unit of its own
# (packages/core/src/keepers.ts), so the stub reaches that build's keeper and nothing else.
cat > "$out/shared/keeper-dropin.sh" <<'EOF'
root="$HOME/.local/share/cawco/binary"
case "$1" in
  break-build|break-when-staged|slow-when-staged)
    # A build cannot run one verb because its executable is replaced by a stub that fails for that verb ($3,
    # `sessiond` by default) and runs the real program (kept as a hard link, `cawco.real`) for every other verb.
    # `slow-when-staged` instead holds its `sessiond` verb $3 seconds before running it: a keeper slow to start.
    # No unit is touched, so the verb fails (or waits) at every start, as a real build that cannot run it would.
    # The `*-when-staged` modes first wait for the update to put the build on disk (the extracted directory appears
    # whole, by rename) and stub it in a few milliseconds, long before the swap.
    v="$root/versions/$2"
    if [ "$1" != break-build ]; then
      n=0
      until [ -f "$v/cawco" ] && [ -f "$v/release.json" ]; do
        n=$((n + 1))
        [ "$n" -lt 30000 ] || exit 1
        sleep 0.02
      done
    fi
    [ -f "$v/cawco.real" ] || ln "$v/cawco" "$v/cawco.real"
    if [ "$1" = slow-when-staged ]; then
      printf '#!/bin/sh\n[ "$1" = sessiond ] && sleep %s\nexec "$(dirname "$(readlink -f "$0")")/cawco.real" "$@"\n' "$3" > "$v/cawco.stub"
    else
      printf '#!/bin/sh\n[ "$1" = %s ] && exit 1\nexec "$(dirname "$(readlink -f "$0")")/cawco.real" "$@"\n' "${3:-sessiond}" > "$v/cawco.stub"
    fi
    chmod 700 "$v/cawco.stub"
    mv "$v/cawco.stub" "$v/cawco" ;;
  remove)
    for d in "$root"/versions/*/; do
      if [ -f "${d}cawco.real" ]; then
        mv -f "${d}cawco.real" "${d}cawco"
        restart=1
      fi
    done ;;
esac
systemctl --user daemon-reload
# Services started while a stub was in place run from `cawco.real`, a path that is gone now: a running agent
# could not launch an update helper from it. Restart them (the keeper is not one of them: it runs another build,
# and the checks end its children before this), then wait until the hub answers and its agent holds the keeper.
if [ "${restart:-0}" = 1 ]; then
  systemctl --user restart cawco-hub.service cawco-dashboard.service cawco-agent.service
  cat > /tmp/agent-custody.ts <<'TS'
const rows = (await (await fetch("http://127.0.0.1:3456/api/agents")).json()) as { hostname: string; status: string; custody?: { state?: string } }[];
const row = rows.find((r) => r.hostname === process.env.HOST);
process.exit(row?.status === "online" && row?.custody?.state === "available" ? 0 : 1);
TS
  n=0
  until curl -fsS --max-time 5 http://127.0.0.1:3456/health > /dev/null 2>&1 &&
    HOST="$(hostname)" BUN_BE_BUN=1 "$HOME/.local/bin/cawco" /tmp/agent-custody.ts 2> /dev/null; do
    n=$((n + 1))
    [ "$n" -lt 60 ] || { echo "after the stub was removed the hub or its agent did not come back"; exit 1; }
    sleep 2
  done
fi
EOF
# Signs a machine in to the CawCo account $1 the way `claude auth login` in that account's dir leaves it: the dir
# ~/.cawco/accounts/$1/claude holding a credential (Linux keeps it in .credentials.json) and the account's
# oauthAccount in the dir's own .claude.json. The token is fake; the bundled Claude Code's `auth status` reads the
# dir as signed in without asking anyone, which is all a proof machine's sessions (a held `sleep`) need.
cat > "$out/shared/account-dir.sh" <<'EOF'
set -eu
dir="$HOME/.cawco/accounts/$1/claude"
mkdir -p -m 700 "$dir"
umask 077
printf '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-proof-not-a-token","refreshToken":"sk-ant-ort01-proof-not-a-token","expiresAt":4102444800000,"scopes":["user:inference","user:profile"],"subscriptionType":"max"}}\n' > "$dir/.credentials.json"
printf '{"oauthAccount":{"accountUuid":"00000000-0000-4000-8000-000000000001","emailAddress":"proof@cawco.test","organizationUuid":"00000000-0000-4000-8000-000000000002","organizationName":"CawCo proof","organizationRole":"admin"}}\n' > "$dir/.claude.json"
EOF
cat > "$out/shared/diagnose-machine.sh" <<'EOF'
binary="$HOME/.local/share/cawco/binary"
data="$HOME/.local/share/cawco"
echo "== apply.log (last 60 lines)"
tail -n 60 "$binary/apply.log" 2>&1
cd "$binary" 2> /dev/null || { echo "no $binary"; exit 0; }
for f in installation.json update-state.json trial.json apply.lock; do
  if [ -e "$f" ]; then echo "== $f"; cat "$f"; echo; else echo "== $f: absent"; fi
done
echo "== current -> $(readlink current)"
echo "== keeper -> $(readlink keeper)"
echo "== keeper endpoints (the machine's names the current one)"
ls -la /run/user/1000/cawco 2>&1
echo "== keeper units"
systemctl --user list-unit-files --no-legend 'cawco-sessiond*' 2>&1
systemctl --user list-units --all --no-legend 'cawco-sessiond*' 2>&1
grep -H 'Requires\|After\|Before\|RequiredBy' "$HOME/.config/systemd/user/cawco-agent.service" "$HOME/.config/systemd/user"/cawco-sessiond*.service 2>&1
echo "== versions/"
ls -la versions
for m in "$data"/cawco.db.migrating "$data"/cawco.db.migrated-* "$data"/cawco.db.pre-*; do
  [ -e "$m" ] || continue
  echo "== $m"
  case "$m" in *.migrating) cat "$m"; echo ;; *) ls -la "$m" ;; esac
done
EOF
setup "write the migrating build" "$out/logs/fixture-migrates.log" fixture broken-binary "$out/migrating-cawco" migrates
setup "publish the release whose setup cannot run" "$out/logs/fixture-brokeninstall.log" publish brokeninstall stable 0.0.1-test.1 $sha1111 "$out/broken-cawco" "$key" 10 "$schema"

setup "create the internal network" "$out/logs/network.log" $P network create --internal --subnet 10.89.77.0/24 "$net"
setup "start the release host" "$out/logs/release-host.log" $P run -d --name "$releasec" --network "$net" --ip "$release_ip" \
  --mount "type=bind,src=$out/release,dst=/srv/release,ro" "localhost/$prefix-host:latest" \
  python3 -m http.server 8000 --directory /srv/release --bind "$release_ip"
setup "boot the hub machine" "$out/logs/boot-hub.log" boot "$hubc" "$hub_ip" hub
setup "boot the joining machine" "$out/logs/boot-joiner.log" boot "$joinerc" "$joiner_ip" joiner
setup "boot the spare machine (no lingering)" "$out/logs/boot-fresh.log" boot "$freshc" "$fresh_ip" fresh nolinger
setup "boot the second hub machine" "$out/logs/boot-hub2.log" boot "$hub2c" "$hub2_ip" hub2
# The refusal checks compare this machine before and after a refused install, so it must already hold what the
# installer needs before it can verify anything: openssl, installed with sudo (the installer's own first step on
# a machine without it, which also writes sudo's first-use note into the home directory).
setup "give the second hub machine openssl and a first use of sudo" "$out/logs/prepare-hub2.log" as_user "$hub2c" sh -c 'sudo apt-get update > /dev/null && sudo apt-get install -y openssl > /dev/null && command -v openssl && test -e "$HOME/.sudo_as_admin_successful"'

# ---------------------------------------------------------------- installer

no_route_out() {
  # The container is up and the release host answers, so a failure to reach the live hub means no route.
  as_user "$hubc" curl -fsS --max-time 10 "$feed/stable/release.json" > /dev/null || { echo "the release host does not answer"; return 1; }
  if as_user "$hubc" curl -sS --max-time 4 http://192.168.3.100:3456/health; then
    echo "the live hub answered"
    return 1
  fi
}
export -f no_route_out
check "the containers cannot reach the live hub" no_route_out

install_hub() {
  # Pristine: no git, Bun, Node or openssl to begin with.
  as_user "$hubc" sh -c 'for tool in git bun node openssl; do if command -v $tool > /dev/null; then echo "$tool is already there"; exit 1; fi; done; echo pristine'
  as_user "$hubc" sh /shared/installer.sh
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  as_user "$hubc" curl -fsS -o /dev/null http://127.0.0.1:3000/
  [[ "$(hub_api /health | json 'd => d.build?.version')" == 0.0.1-test.1 ]]
  [[ "$(as_user "$hubc" readlink /home/cawco/.local/share/cawco/binary/current)" == versions/0.0.1-test.1 ]]
  as_user "$hubc" sh -c 'for tool in git bun node; do if command -v $tool > /dev/null; then echo "$tool appeared"; exit 1; fi; done; echo still-none'
}
export -f install_hub
check "pristine container installs the hub, and the hub answers" install_hub 600 "" 0.0.1-test.1
grep -q "command: sudo apt-get install -y openssl" "$LAST_LOG" \
  && echo "the installer showed the openssl install command and ran it: PASS" \
  || { echo "the installer showed the openssl install command and ran it: FAIL (see $LAST_LOG)"; status=1; }

join_machine() {
  need_hub
  # The hub's own install.sh, the way the app's Connect a machine hands it out; pexpect types an "n" after each prompt appears.
  as_user "$joinerc" curl -fsS "http://$hub_ip:3456/install.sh" -o /tmp/join.sh
  local rc=0
  python3 "$here/stage2-answer-prompts.py" $P exec -it --user cawco --workdir /home/cawco --env HOME=/home/cawco \
    --env XDG_RUNTIME_DIR=/run/user/1000 --env DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    --env CAWCO_RELEASE_HOST="${FEED_OVERRIDE:-$feed}" "$joinerc" sh /tmp/join.sh > "$out/join.out" || rc=$?
  cat "$out/join.out"
  [[ $rc == 0 ]]
  grep -qE 'prompts answered: [1-9]' "$out/join.out"
  [[ "$(hub_api /api/agents | json 'd => d.filter(a => a.status === "online").length')" == 2 ]]
}
export -f join_machine
check "a second container joins the hub" join_machine
export join_log=$LAST_LOG

declined() {
  grep -q "git: not installed" "$join_log"
  grep -q "git: skipped. CawCo works without it." "$join_log"
  grep -q "is installed." "$join_log"
  grep -q "cawco-install: joined as " "$join_log"
}
export -f declined
check "declining the optional tools still completes the install" declined

# The installer run against a feed that must be refused, inside the spare hub machine
# (a real systemd machine the installer gets past its service-manager check on, and which stays
# untouched: the second-hub check installs on it later). Everything is written to the check's log.
refuse() {
  local feedname=$1 phrase=$2 rc=0 diffrc=0 dir="$out/refuse-$1"
  mkdir -p "$dir"
  listing() { as_user "$hub2c" sh -c 'find "$HOME" -xdev -not -path "$HOME/.cache/*" | sort; echo "-- user units:"; systemctl --user list-unit-files "cawco-*" --no-legend || true'; }
  listing > "$dir/before.txt"
  echo "== listing before ($(wc -l < "$dir/before.txt") lines)"
  cat "$dir/before.txt"
  echo "== running the installer on $hub2c against the $feedname feed (release host $release_ip:8000/$feedname)"
  FEED_OVERRIDE="http://$release_ip:8000/$feedname" as_user "$hub2c" sh /shared/installer.sh > "$dir/installer.txt" 2>&1 || rc=$?
  echo "== the installer's full output"
  cat "$dir/installer.txt"
  echo "== the installer's exit status: $rc"
  listing > "$dir/after.txt"
  echo "== listing after ($(wc -l < "$dir/after.txt") lines)"
  cat "$dir/after.txt"
  echo "== diff before after"
  diff "$dir/before.txt" "$dir/after.txt" || diffrc=$?
  [[ $diffrc == 0 ]] && echo "(no difference)"
  echo "== assertions: exit status not 0 (was $rc); output holds '$phrase'; before and after identical (diff status $diffrc)"
  [[ $rc != 0 ]] || { echo "ASSERTION FAILED: the installer exited 0"; return 1; }
  grep -q "$phrase" "$dir/installer.txt" || { echo "ASSERTION FAILED: the output does not hold: $phrase"; return 1; }
  [[ $diffrc == 0 ]] || { echo "ASSERTION FAILED: the machine changed"; return 1; }
}
export -f refuse
check "a tampered archive is refused and nothing changes" "refuse tampered 'does not match the signed checksum'"
check "a bad signature is refused and nothing changes" "refuse badsig 'does not match CawCo.s release key'"
check "a missing signature is refused and nothing changes" "refuse nosig 'could not download'"

rerun() {
  need_hub
  local before after
  before=$(as_user "$hubc" sh -c 'cat ~/.local/share/cawco/binary/installation.json; readlink ~/.local/share/cawco/binary/current')
  as_user "$hubc" sh /shared/installer.sh | tee /dev/stderr | grep -q "Updates are installed from the CawCo app"
  after=$(as_user "$hubc" sh -c 'cat ~/.local/share/cawco/binary/installation.json; readlink ~/.local/share/cawco/binary/current')
  [[ -n "$before" && "$before" == "$after" ]]
}
export -f rerun
check "running the installer again reports the install and changes nothing" rerun

# ---------------------------------------------------------------- the install script on machines nothing is installed on

hid=$(machine_id hub)
jid=$(machine_id joiner)
export hid jid

# ---------------------------------------------------------------- Claude accounts
# A Claude session runs only on a CawCo account signed in on its machine, in that account's own dir. Until a
# machine has one, a start there is refused in the hub's words and nothing runs.
no_account_refused() {
  need_hub
  local rc=0 said
  said=$(start_session "$jid" noaccount-1 2>&1) || rc=$?
  echo "$said"
  [[ $rc != 0 ]] || { echo "ASSERTION FAILED: the start was not refused"; return 1; }
  grep -qF "No Claude account is signed in on joiner. Add one in Configure → Accounts and sign it in there." <<< "$said"
  sleep 5
  # No session row, and no child on the machine.
  [[ -z "$(hub_api /api/instances | json "d => d.find(r => r.id === 'noaccount-1')?.status")" ]]
  [[ "$(children_with "$joinerc" noaccount-)" == 0 ]]
}
export -f no_account_refused
check "on a machine with no CawCo account a session start is refused with the sentence, and nothing runs" no_account_refused

# The machines whose sessions the proof starts are set up as a real machine is: one CawCo account, made through
# the hub's API, signed in on each in its own dir. The hub records each sign-in before the first session starts.
signed_in_on() { hub_api /api/accounts | json "d => d.signins.filter(s => s.accountId === '$1' && s.state === 'signed-in').map(s => s.machineId).sort().join(' ')"; }
export -f signed_in_on
sign_in_machines() {
  need_hub
  local aid c want
  aid=$(hub_api /api/accounts -X POST -H 'content-type: application/json' -d '{"provider":"anthropic","kind":"subscription"}' | json 'd => d.id')
  [[ -n $aid ]]
  echo "$aid" > "$out/account-id"
  for c in "$hubc" "$joinerc"; do
    as_user "$c" sh /shared/account-dir.sh "$aid"
    # The agent reads its account dirs as it registers.
    as_user "$c" systemctl --user restart cawco-agent.service
  done
  want=$(printf '%s\n' "$hid" "$jid" | sort | paste -sd ' ')
  wait_until 120 '[[ "$(signed_in_on '"$aid"')" == "'"$want"'" ]]'
  hub_api /api/accounts | json "d => d.accounts.find(a => a.id === '$aid')?.email" | grep -qx proof@cawco.test
  wait_until 60 '[[ "$(hub_api /api/agents | json "d => d.filter(a => a.status === \"online\" && (a.machineId === \"$hid\" || a.machineId === \"$jid\")).length")" == 2 ]]'
}
export -f sign_in_machines
check "each machine that runs the proof's sessions is signed in to a CawCo account in its own dir" sign_in_machines

truncated_script() {
  as_user "$freshc" true
  head -n 70 "$out/shared/installer.sh" > "$out/shared/cut-middle.sh"
  sed '$d' "$out/shared/installer.sh" > "$out/shared/cut-end.sh"
  rc=0
  as_user "$freshc" sh /shared/cut-middle.sh || rc=$?
  [[ $rc != 0 ]]
  as_user "$freshc" sh /shared/cut-end.sh
  [[ "$(untouched "$freshc")" == untouched ]]
}
export -f truncated_script
check "a truncated install script changes nothing" truncated_script

no_linger_no_terminal() {
  as_user "$freshc" true
  rc=0
  result=$(as_user "$freshc" sh /shared/installer.sh 2>&1) || rc=$?
  echo "$result"
  [[ $rc != 0 ]]
  grep -q "sudo loginctl enable-linger cawco" <<< "$result"
  [[ "$(untouched "$freshc")" == untouched ]]
}
export -f no_linger_no_terminal
check "with lingering off and no terminal the install stops with the command and places nothing" no_linger_no_terminal

fails_after_placing() {
  $P exec "$freshc" loginctl enable-linger cawco
  wait_until 60 "$P exec $freshc test -S /run/user/1000/bus"
  rc=0
  result=$(FEED_OVERRIDE="http://$release_ip:8000/brokeninstall" as_user "$freshc" sh /shared/installer.sh 2>&1) || rc=$?
  echo "$result"
  [[ $rc != 0 ]]
  grep -q "installing CawCo 0.0.1-test.1 into" <<< "$result"
  [[ "$(untouched "$freshc")" == untouched ]]
  [[ "$(as_user "$freshc" sh -c 'systemctl --user list-unit-files "cawco-*" --no-legend | wc -l')" == 0 ]]
}
export -f fails_after_placing
check "an install that fails after placing files leaves nothing behind" fails_after_placing

moves_to_another_hub() {
  need_hub
  as_user "$hub2c" sh /shared/installer.sh
  as_user "$hub2c" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  as_user "$joinerc" curl -fsS "http://$hub2_ip:3456/install.sh" -o /tmp/hub2.sh
  as_user "$joinerc" sh /tmp/hub2.sh | tee /dev/stderr | grep -q "cawco-install: joined as $jid"
  wait_until 90 '[[ "$(api_on "$hub2c" /api/agents | json "d => d.find(a => a.machineId === \"$jid\")?.status")" == online ]]'
  # And back, so the rest of the proof has its fleet.
  as_user "$joinerc" curl -fsS "http://$hub_ip:3456/install.sh" -o /tmp/hub1.sh
  as_user "$joinerc" sh /tmp/hub1.sh | grep -q "cawco-install: joined as $jid"
  wait_until 90 '[[ "$(hub_api /api/agents | json "d => d.find(a => a.machineId === \"$jid\")?.status")" == online ]]'
}
export -f moves_to_another_hub
check "running a hub's install script on a machine joined elsewhere moves it" moves_to_another_hub

# ---------------------------------------------------------------- updates, all through the hub's API

put_policy() { hub_api /api/binary-updates/settings -X PUT -H 'content-type: application/json' -d "{\"channel\":\"$1\",\"autoUpdate\":$2}"; }
learn() { hub_api /api/binary-updates/check -X POST; }
install_now_request() { hub_api "/api/agents/$1/update" -X POST -H 'content-type: application/json' -d '{}'; }
export -f put_policy learn install_now_request

older_refused() {
  need_hub
  publish ok stable 0.0.1-test.0 0000000000000000000000000000000000000000 "$bins/cawco-1" "$key" 5 "$schema"
  learn
  put_policy stable true
  sleep 75
  [[ "$(build_version $hid)" == 0.0.1-test.1 ]]
  [[ "$(phase $hid)" == none ]]
  answer=$(install_now_request "$hid")
  echo "$answer"
  grep -q '"installed":false' <<< "$answer"
  [[ "$(build_version $hid)" == 0.0.1-test.1 ]]
  [[ "$(phase $hid)" == none ]]
  put_policy stable false
}
export -f older_refused
check "an older signed build is refused on the automatic path and on Install now" older_refused

waits_when_off() {
  need_hub
  publish ok stable 0.0.1-test.2 2222222222222222222222222222222222222222 "$bins/cawco-2" "$key" 20 "$schema"
  learn
  put_policy stable false
  wait_until 120 '[[ "$(phase $hid)" == available && "$(field $hid availableVersion)" == 0.0.1-test.2 ]]'
  sleep 25
  [[ "$(build_version $hid)" == 0.0.1-test.1 ]]
  [[ "$(phase $hid)" == available ]]
}
export -f waits_when_off
check "with auto-update off a newer build is reported and waits" waits_when_off

joiner_not_ahead() {
  need_hub
  # The hub still runs test.1: its release route says so, and the joined machine is offered nothing newer.
  [[ "$(hub_api /api/binary-updates/release | json 'd => d.manifest.version')" == 0.0.1-test.1 ]]
  [[ "$(phase $jid)" == none ]]
  [[ "$(build_version $jid)" == 0.0.1-test.1 ]]
}
export -f joiner_not_ahead
check "a joined machine is offered only the build its hub runs" joiner_not_ahead

install_now() {
  need_hub
  install_now_request "$hid"
  wait_until 300 '[[ "$(build_version $hid)" == 0.0.1-test.2 && "$(phase $hid)" == installed ]]'
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  [[ "$(as_user "$hubc" readlink /home/cawco/.local/share/cawco/binary/current)" == versions/0.0.1-test.2 ]]
  # Build 1's keeper, from before keepers ran side by side, is handed over to build 2's, its own unit's: the machine's
  # endpoint names it, and the legacy keeper, holding nothing, goes with its unit.
  wait_until 180 '[[ "$(current_endpoint "$hubc")" == "$(endpoint_of 0.0.1-test.2)" ]]'
  wait_until 120 'as_user "$hubc" test ! -e /home/cawco/.config/systemd/user/cawco-sessiond.service'
  [[ "$(as_user "$hubc" sh -c 'grep -c "cawco-sessiond" ~/.config/systemd/user/cawco-agent.service || true')" == 0 ]]
  wait_until 60 '[[ -z "$(retiring $hid)" && "$(field $hid sessiondVersion)" == 0.0.1-test.2 ]]'
}
export -f install_now
check "Install now applies the newer build" install_now 600 "" 0.0.1-test.2

joiner_follows() {
  need_hub
  wait_until 120 '[[ "$(phase $jid)" == available && "$(field $jid availableVersion)" == 0.0.1-test.2 ]]'
  [[ "$(build_version $jid)" == 0.0.1-test.1 ]]
}
export -f joiner_follows
check "once the hub runs the newer build its joined machine is offered it" joiner_follows 600 "Install now applies the newer build"

joiner_starts_held() {
  need_hub
  rm -f "$out/stop-joiner" "$out/accepted-joiner.txt"
  # Sessions already running on the joined machine before its update begins.
  start_before "$jid" "$joinerc" "$out/joiner-before.txt" joinerpre-1 joinerpre-2
  install_now_request "$jid" > /dev/null
  start_loop "$jid" joinerstart "$out/accepted-joiner.txt" "$out/stop-joiner" &
  loop=$!
  # The machine's sessions are held by its session keeper, which no update restarts: the new build's keeper
  # starts beside it and the update is complete, installed, when the new build runs. It is not complete while
  # the phase is installing.
  wait_until 300 '[[ "$(build_version $jid)" == 0.0.1-test.2 && "$(phase $jid)" == installed ]]'
  [[ "$(field $jid installedVersion)" == 0.0.1-test.2 ]]
  touch "$out/stop-joiner"
  wait "$loop"
  accepted_ran_once "$jid" "$joinerc" joinerstart "$out/accepted-joiner.txt"
}
export -f joiner_starts_held
check "a session start requested while the joined machine installs runs once afterwards, one child, none lost" joiner_starts_held 1200 "Install now applies the newer build"

joiner_survived() { need_hub; survived "$joinerc" "$out/joiner-before.txt"; }
export -f joiner_survived
check "a session already running on the joined machine before its update is the same process afterwards, re-attached and running" joiner_survived 600 "a session start requested while the joined machine installs runs once afterwards, one child, none lost"

# The fleet's own path. The joined machine was installed from build 1, from before keepers ran side by side: one keeper,
# cawco-sessiond.service, on the machine's endpoint itself, and an agent unit that requires it. Its update to build 2
# was applied by build 1's helper, which left the keeper where it was while it held sessions; build 2's agent then
# handed it over to build 2's keeper, beside it, with those sessions still on it.
legacy_handed_over() {
  need_hub
  local id pid
  wait_until 180 '[[ "$(current_endpoint "$joinerc")" == "$(endpoint_of 0.0.1-test.2)" ]]'
  [[ "$(as_user "$joinerc" readlink /home/cawco/.local/share/cawco/binary/keeper)" == versions/0.0.1-test.2 ]]
  # The legacy keeper's socket was set aside under its build; it holds the sessions that ran before the update.
  while read -r id pid; do
    [[ "$(holder_of "$joinerc" "$id")" == legacy-sessiond-0.0.1-test.1.sock ]]
  done < "$out/joiner-before.txt"
  # Its unit no longer starts with the machine, and the agent's unit no longer requires it: the new keeper's unit,
  # enabled, requires the agent's from its own side.
  [[ "$(as_user "$joinerc" systemctl --user is-enabled cawco-sessiond.service)" == disabled ]]
  [[ "$(as_user "$joinerc" sh -c 'grep -c "cawco-sessiond" ~/.config/systemd/user/cawco-agent.service || true')" == 0 ]]
  [[ "$(as_user "$joinerc" systemctl --user is-enabled "$(unit_of 0.0.1-test.2)")" == enabled ]]
  [[ "$(as_user "$joinerc" systemctl --user show -p RequiredBy --value "$(unit_of 0.0.1-test.2)")" == *cawco-agent.service* ]]
  # The state says installed, on build 2's keeper, with the legacy keeper handing over what it holds; nothing owed.
  wait_until 60 '[[ "$(phase $jid)" == installed && "$(field $jid sessiondVersion)" == 0.0.1-test.2 && "$(retiring $jid)" == *"0.0.1-test.1:"* ]]'
  [[ -z "$(field $jid keeperOwed)" ]]
  echo "retiring keepers: $(retiring $jid)"
}
export -f legacy_handed_over
check "a keeper from before keepers ran side by side, holding sessions, is handed over at the update: they run on there, and the new build's keeper is the machine's" legacy_handed_over 600 "a session already running on the joined machine before its update is the same process afterwards, re-attached and running"

# A session started through the hub on the keeper `keeper` names: its own process's environment, read from
# /proc/<pid>/environ of the child the keeper holds, carries only the CAWCO_* a session's tools read (core
# session-env.ts SESSION_CAWCO_ENV) and never CawCo's embedded pi dir. Neither the keeper's own runtime environment
# (its endpoint, the binary root) nor the agent's reaches it. CAWCO_INSTANCE_ID names this session, so the environment
# read is its own. The session is stopped afterwards.
session_env_clean() {
  local machine=$1 container=$2 id=$3 keeper=$4 pid env extra
  start_session "$machine" "$id" > /dev/null
  wait_until 60 "session_running $id"
  [[ "$(holder_of "$container" "$id")" == "$keeper" ]]
  pid=$(child_pids "$container" "$id")
  [[ "$pid" =~ ^[0-9]+$ ]]
  env=$(as_user "$container" cat "/proc/$pid/environ" | tr '\0' '\n')
  echo "$id, pid $pid on $keeper: $(printf '%s\n' "$env" | grep -oE '^(CAWCO_[A-Z0-9_]*|PI_PACKAGE_DIR)=' | tr -d = | sort | tr '\n' ' ')"
  printf '%s\n' "$env" | grep -qx "CAWCO_INSTANCE_ID=$id"
  ! printf '%s\n' "$env" | grep -q '^PI_PACKAGE_DIR=' || { echo "it carries PI_PACKAGE_DIR"; return 1; }
  extra=$(printf '%s\n' "$env" | grep -oE '^CAWCO_[A-Z0-9_]*' | grep -vxE 'CAWCO_HUB_URL|CAWCO_INSTANCE_ID|CAWCO_SESSION_CREDENTIAL|CAWCO_MODEL' || true)
  [[ -z $extra ]] || { echo "it carries $(echo $extra)"; return 1; }
  stop_session "$machine" "$id" > /dev/null
  wait_until 60 "[[ -z \"\$(child_pids $container $id)\" ]]"
}
sessions_env_after_handover() {
  need_hub
  session_env_clean "$jid" "$joinerc" envjoiner-1 "$(endpoint_of 0.0.1-test.2)"
  session_env_clean "$hid" "$hubc" envhub-1 "$(endpoint_of 0.0.1-test.2)"
}
export -f session_env_clean sessions_env_after_handover
check "a session started on the new build's keeper after the handover carries only the CAWCO_* its tools read, and no PI_PACKAGE_DIR, on the joined machine and the hub's" sessions_env_after_handover 600 "a keeper from before keepers ran side by side, holding sessions, is handed over at the update: they run on there, and the new build's keeper is the machine's"

one_helper() {
  need_hub
  publish ok stable 0.0.1-test.9 9999999999999999999999999999999999999999 "$out/broken-cawco" "$key" 30 "$schema"
  learn
  put_policy stable false
  wait_until 120 '[[ "$(field $hid availableVersion)" == 0.0.1-test.9 ]]'
  install_now_request "$hid" > /dev/null &
  install_now_request "$hid" > /dev/null &
  wait
  wait_until 300 '[[ "$(phase $hid)" == failed-rolled-back ]]'
  [[ "$(as_user "$hubc" grep -c "start 0.0.1-test.9" /home/cawco/.local/share/cawco/binary/apply.log)" == 1 ]]
  [[ "$(build_version $hid)" == 0.0.1-test.2 ]]
}
export -f one_helper
check "two Install now requests at once produce one helper" one_helper 600 "Install now applies the newer build"

rolled_back() {
  need_hub
  publish ok stable 0.0.1-test.10 1010101010101010101010101010101010101010 "$out/broken-cawco" "$key" 31 "$schema"
  learn
  put_policy stable true
  wait_until 300 '[[ "$(field $hid failedVersion)" == 0.0.1-test.10 && "$(phase $hid)" == failed-rolled-back ]]'
  [[ "$(build_version $hid)" == 0.0.1-test.2 ]]
  [[ -n "$(field $hid error)" ]]
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  put_policy stable false
}
export -f rolled_back
check "a build that cannot start is rolled back and the failure is recorded" rolled_back 600 "Install now applies the newer build"

migration_rolled_back() {
  need_hub
  # Data the hub holds before the update.
  # Without -f, so a refusal shows the hub's own words instead of a bare 400.
  saved=$(as_user "$hubc" curl -sS -w '\nHTTP %{http_code}' http://127.0.0.1:3456/api/workflows -X POST -H 'content-type: application/json' -d @/shared/workflow.json)
  echo "saving the workflow: $saved"
  [[ "$saved" == *"HTTP 201" ]]
  hub_api /api/workflows | grep -q kept-through-rollback
  publish ok stable 0.0.1-test.8 8888888888888888888888888888888888888888 "$out/migrating-cawco" "$key" 32 "$((schema + 1))"
  learn
  put_policy stable true
  wait_until 360 '[[ "$(field $hid failedVersion)" == 0.0.1-test.8 && "$(phase $hid)" == failed-rolled-back ]]'
  put_policy stable false
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  [[ "$(build_version $hid)" == 0.0.1-test.2 ]]
  hub_api /api/workflows | grep -q kept-through-rollback
  # The migrated file is moved aside, not deleted, and the copy it was restored from is still there.
  as_user "$hubc" sh -c 'ls ~/.local/share/cawco/cawco.db.migrated-0.0.1-test.8 ~/.local/share/cawco/cawco.db.pre-0.0.1-test.2.bak'
}
export -f migration_rolled_back
check "a build with a new migration that fails to start is rolled back and the hub opens its restored database" migration_rolled_back 600 "Install now applies the newer build"

swap_kill_recover() {
  need_hub
  local version=$1 sequence=$2 plant=$3
  publish ok stable "$version" "$sequence$sequence$sequence$sequence$sequence$sequence$sequence$sequence" "$out/broken-cawco" "$key" "$sequence" "$schema"
  learn
  put_policy stable true
  wait_until 240 '[[ "$(as_user "$hubc" readlink /home/cawco/.local/share/cawco/binary/current)" == versions/'"$version"' ]]'
  # The hub is down from the swap until the previous build is restored, so nothing here may call its API
  # before the recovery: the helper is killed first, and the policy is put back once the hub answers again.
  as_user "$hubc" pkill -9 -f "binary-apply $version"
  if [[ $plant == plant ]]; then
    # What a killed hub leaves behind: a marker naming a process id that now belongs to something else.
    live=$(keeper_pid "$hubc")
    as_user "$hubc" sh -c "printf '{\"pid\":$live,\"procStart\":\"1\",\"bootId\":\"not-this-boot\"}' > ~/.local/share/cawco/cawco.db.migrating"
  fi
  # The unit that cannot start keeps being restarted through the wrapper, which finds the trial with no helper and
  # starts one from the previous build; that helper rolls every unit back when the build is not healthy in time.
  wait_until 420 '[[ "$(as_user "$hubc" readlink /home/cawco/.local/share/cawco/binary/current)" == versions/0.0.1-test.2 ]]'
  wait_until 120 'as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q "\"version\":\"0.0.1-test.2\""'
  wait_until 120 '[[ "$(field $hid failedVersion)" == '"$version"' && "$(phase $hid)" == failed-rolled-back ]]'
  as_user "$hubc" rm -f /home/cawco/.local/share/cawco/cawco.db.migrating
  put_policy stable false
}
export -f swap_kill_recover
check "a helper killed right after the swap of a build that cannot start is recovered at the next start" "swap_kill_recover 0.0.1-test.7 33 none" 1200 "Install now applies the newer build"
check "a stale migration marker left by a killed hub does not hold a failed build in place" "swap_kill_recover 0.0.1-test.6 34 plant" 1200 "Install now applies the newer build"

channel_change() {
  need_hub
  publish ok nightly "0.0.1-nightly.3+333333333333" 3333333333333333333333333333333333333333 "$bins/cawco-3" "$key" 40 "$schema"
  put_policy nightly false
  wait_until 120 '[[ "$(field $hid channel)" == nightly && "$(phase $hid)" == available && "$(field $hid availableVersion)" == "0.0.1-nightly.3+333333333333" ]]'
  [[ "$(build_version $hid)" == 0.0.1-test.2 ]]
}
export -f channel_change
check "changing the channel takes effect" channel_change 600 "Install now applies the newer build"

auto_with_held_child() {
  need_hub
  # A child the session keeper holds, as a running session's process would be: its pid, and the keeper's pid, unit
  # and endpoint.
  spawn_child "$hubc" held
  child=$(child_pids "$hubc" boundary-held)
  keeper=$(keeper_pid "$hubc")
  [[ -n "$child" && -n "$keeper" ]]
  echo "$child $keeper $(current_unit "$hubc") $(current_endpoint "$hubc")" > "$out/held.txt"
  # Sessions already running on the hub's own machine before its update begins.
  start_before "$hid" "$hubc" "$out/hub-before.txt" hubpre-1 hubpre-2
  # Two watchers, started before the update is asked for: one asks the hub to start sessions on its own machine,
  # the other starts held children on the joined machine, each firing the moment that machine says installing.
  watch_install "$hubc" hub-start http://127.0.0.1:3456 "$hid" hubstart "$out/watch-hub.txt"
  watch_install "$joinerc" keeper-child "http://$hub_ip:3456" "$jid" during "$out/watch-joiner.txt"
  put_policy nightly true
  wait_until 300 '[[ "$(build_version $hid)" == "0.0.1-nightly.3+333333333333" ]]'
  wait_until 120 'grep -q "^done " "$out/watch-hub.txt"'
  echo "== what the hub-machine watcher sent and what came back"
  cat "$out/watch-hub.txt"
  watched_ids "$out/watch-hub.txt" > "$out/accepted-hub.txt"
}
export -f auto_with_held_child
check "with auto-update on the build is applied when the machine is idle" auto_with_held_child 600 "changing the channel takes effect" "0.0.1-nightly.3+333333333333"

hub_starts_held() {
  need_hub
  grep -q "^done " "$out/watch-hub.txt"
  accepted_ran_once "$hid" "$hubc" hubstart "$out/accepted-hub.txt"
}
export -f hub_starts_held
check "a session start requested while the hub's own machine installs runs once afterwards, one child, none lost" hub_starts_held 900 "with auto-update on the build is applied when the machine is idle"

hub_survived() { need_hub; survived "$hubc" "$out/hub-before.txt"; }
export -f hub_survived
check "a session already running on the hub's own machine before its update is the same process afterwards, re-attached and running" hub_survived 600 "with auto-update on the build is applied when the machine is idle"

held_survives() {
  need_hub
  local child keeper unit endpoint new=0.0.1-nightly.3+333333333333
  read -r child keeper unit endpoint < "$out/held.txt"
  # The child runs on, held by the very keeper process it started under, which the update did not touch.
  as_user "$hubc" kill -0 "$child"
  [[ "$(keeper_pid "$hubc" "$unit")" == "$keeper" ]]
  [[ "$(holder_of "$hubc" boundary-held)" == "$endpoint" ]]
  # The new build's keeper is the machine's: the keeper link and the machine's endpoint name it. Nothing waits: the
  # update is installed, and the state says the keeper before still holds what it holds.
  wait_until 120 '[[ "$(phase $hid)" == installed && "$(field $hid sessiondVersion)" == "'"$new"'" ]]'
  [[ "$(as_user "$hubc" readlink /home/cawco/.local/share/cawco/binary/keeper)" == "versions/$new" ]]
  [[ "$(current_endpoint "$hubc")" == "$(endpoint_of "$new")" ]]
  wait_until 60 '[[ "$(retiring $hid)" == *"0.0.1-test.2:"* ]]'
  echo "retiring keepers: $(retiring $hid)"
}
export -f held_survives
check "a child held by the session keeper survives the update on that keeper, untouched, while the new build's keeper becomes the machine's" held_survives 600 "with auto-update on the build is applied when the machine is idle"

session_during_update() {
  need_hub
  # The joined machine follows its hub to the new build. Its watcher (started in the check that updated the hub)
  # started a held child each time the hub reported the machine as installing, and recorded each answer.
  wait_until 600 '[[ "$(build_version $jid)" == "0.0.1-nightly.3+333333333333" ]]'
  wait_until 300 'grep -q "^done " "$out/watch-joiner.txt"'
  echo "== what the joined-machine watcher sent and what came back"
  cat "$out/watch-joiner.txt"
  local n id alive
  n=$(watched_ids "$out/watch-joiner.txt" | wc -l)
  [[ $n -ge 1 ]]
  # Every one the watcher recorded as accepted is still alive afterwards, on whichever keeper took it. (The keepers
  # also hold the few the watcher sent just as the hub went down or the phase moved on; those are not in the count,
  # and are not required.)
  alive=" $(keeper_lists "$joinerc" | jsonl "d => d.flatMap(k => k.procs).filter(p => p.alive).map(p => p.procId).join(' ')") "
  for id in $(watched_ids "$out/watch-joiner.txt"); do
    [[ "$alive" == *" $id "* ]] || { echo "the accepted child $id is not alive"; return 1; }
  done
}
export -f session_during_update
check "a session started while an update is installing is still alive afterwards" session_during_update 900 "with auto-update on the build is applied when the machine is idle"

keeper_advances() {
  need_hub
  local child keeper unit endpoint pid now
  read -r child keeper unit endpoint < "$out/held.txt"
  now=$(keeper_pid "$hubc")
  # Everything the keeper before holds ends, so it holds nothing.
  for pid in $(keeper_lists "$hubc" | jsonl "d => (d.find(k => k.endpoint === '$endpoint')?.procs ?? []).filter(p => p.alive).map(p => p.pid).join(' ')"); do
    as_user "$hubc" kill "$pid"
  done
  # It goes by itself once it has held nothing for 20 s: its process, its unit and its endpoint are gone, nothing
  # says it is retiring, and the machine's keeper is the same process as before.
  wait_until 180 '! as_user "$hubc" kill -0 "'"$keeper"'" 2> /dev/null'
  wait_until 60 '! as_user "$hubc" test -e "/home/cawco/.config/systemd/user/'"$unit"'"'
  wait_until 60 '! as_user "$hubc" test -e "/run/user/1000/cawco/'"$endpoint"'"'
  wait_until 60 '[[ -z "$(retiring $hid)" ]]'
  [[ "$(keeper_pid "$hubc")" == "$now" ]]
  [[ "$(phase $hid)" == installed ]]
  [[ "$(as_user "$hubc" readlink /home/cawco/.local/share/cawco/binary/keeper)" == versions/0.0.1-nightly.3+333333333333 ]]
}
export -f keeper_advances
check "the keeper before goes by itself once it holds nothing, and the machine's keeper is untouched" keeper_advances 600 "with auto-update on the build is applied when the machine is idle"

nightly_to_stable_waits() {
  need_hub
  publish ok stable 0.0.1-test.2 2222222222222222222222222222222222222222 "$bins/cawco-2" "$key" 25 "$schema"
  put_policy stable true
  wait_until 120 '[[ "$(phase $hid)" == waiting-for-channel && "$(field $hid channel)" == stable ]]'
  sleep 70
  [[ "$(build_version $hid)" == "0.0.1-nightly.3+333333333333" ]]
  [[ "$(phase $hid)" == waiting-for-channel ]]
  put_policy nightly false
}
export -f nightly_to_stable_waits
check "changing from nightly to stable waits and installs nothing older" nightly_to_stable_waits 600 "with auto-update on the build is applied when the machine is idle"

capability_report() {
  need_hub
  # A tool the machine has, and the report says so with its version.
  $P exec "$hubc" sh -c 'printf "#!/bin/sh\necho git version 2.99.0\n" > /usr/local/bin/git; chmod 755 /usr/local/bin/git'
  as_user "$hubc" systemctl --user restart cawco-agent.service
  wait_until 120 '[[ "$(hub_api /api/agents | json "d => d.find(a => a.machineId === \"$hid\")?.machineCapabilities?.items?.find(i => i.id === \"git\")?.version")" == 2.99.0 ]]'
  [[ "$(hub_api /api/agents | json "d => d.find(a => a.machineId === '$hid')?.machineCapabilities?.items?.find(i => i.id === 'service-manager')?.available")" == true ]]
  [[ "$(hub_api /api/agents | json "d => d.find(a => a.machineId === '$jid')?.machineCapabilities?.items?.find(i => i.id === 'git')?.available")" == false ]]
  [[ "$(hub_api /api/agents | json "d => d.find(a => a.machineId === '$jid')?.machineCapabilities?.items?.find(i => i.id === 'opencode')?.available")" == false ]]
}
export -f capability_report
check "the capability report lists what each container has, with versions" capability_report


# ---------------------------------------------------------------- the session keeper's own checks
# Builds 4 to 9 are healthy builds further along the nightly channel (build-stage2.ts), so each check below
# gets a full update, and with it a keeper handover, of its own. A build's keeper is made unable to start, or
# slow to start, by a stub on that build's `sessiond` verb, written by /shared/keeper-dropin.sh the moment the
# update stages the build. Each check starts from a state it makes itself (no stub, no update in flight, no
# keeper holding anything, none retiring), removes its stub on every way out, and depends only on "Install
# now applies the newer build", so one failing keeper check leaves the others to run.

nb() { printf '0.0.1-nightly.%s+%s' "$1" "$(printf "$1%.0s" {1..12})"; }
publish_nightly() { publish ok nightly "$(nb "$1")" "$(printf "$1%.0s" {1..40})" "$bins/cawco-$1" "$key" "$2" "$schema"; }
keeper_dropin() { as_user "$hubc" sh /shared/keeper-dropin.sh "$@"; }
keeper_link() { as_user "$1" readlink /home/cawco/.local/share/cawco/binary/keeper; }
current_link() { as_user "$1" readlink /home/cawco/.local/share/cawco/binary/current; }
has_file() { as_user "$1" test -e "/home/cawco/.local/share/cawco/binary/$2"; }
has_version() { as_user "$1" test -d "/home/cawco/.local/share/cawco/binary/versions/$2"; }
custody_of() { hub_api /api/agents | json "d => d.find(a => a.machineId === '$1')?.custody?.state"; }
# Ends every process every keeper on the machine holds.
end_all_sessions() {
  local pid
  for pid in $(keeper_lists "$1" | jsonl "d => d.flatMap(k => k.procs).filter(p => p.alive).map(p => p.pid).join(' ')"); do
    as_user "$1" kill "$pid"
  done
}
apply_log_count() { as_user "$hubc" sh -c "grep -c '$1' /home/cawco/.local/share/cawco/binary/apply.log || true"; }
# Puts a stub on build $1's verb $2 (sessiond: its keeper cannot start) the moment the update stages it, in the background.
stub_when_staged() { as_user "$hubc" sh -c 'rm -f /tmp/stub.done; sh /shared/keeper-dropin.sh "$1" "$2" "$3" && touch /tmp/stub.done' _ "$@" > /dev/null 2>&1 & }
# The state every keeper check starts from, made here and not left by an earlier check: nothing held, and so no
# keeper retiring, on the hub's machine.
keeper_start_state() {
  need_hub
  trap 'keeper_dropin remove > /dev/null 2>&1 || true' EXIT
  keeper_dropin remove
  end_all_sessions "$hubc"
  wait_until 60 '[[ "$(children_total "$hubc")" == 0 ]]'
  wait_until 180 '[[ "$(phase $hid)" != installing ]]'
  wait_until 120 '[[ -z "$(retiring $hid)" ]]'
  put_policy nightly true
}
export -f nb publish_nightly keeper_dropin keeper_link current_link has_file has_version custody_of end_all_sessions apply_log_count stub_when_staged keeper_start_state

full_update_keeper_cannot_start() {
  keeper_start_state
  local before
  before=$(keeper_link "$hubc")
  stub_when_staged break-when-staged "$(nb 4)" sessiond
  publish_nightly 4 41
  learn
  wait_until 400 '[[ "$(build_version $hid)" == "$(nb 4)" && "$(phase $hid)" == installed ]]'
  [[ "$(current_link "$hubc")" == "versions/$(nb 4)" ]]
  wait_until 60 '[[ "$(field $hid keeperFailedVersion)" == "$(nb 4)" ]]'
  # The keeper before is still the machine's: the keeper link and the machine's endpoint name it, and the keeper
  # that could not start left nothing behind, no unit and no endpoint.
  [[ "$(keeper_link "$hubc")" == "$before" ]]
  [[ "$(current_endpoint "$hubc")" == "$(endpoint_of "${before#versions/}")" ]]
  as_user "$hubc" test ! -e "/home/cawco/.config/systemd/user/$(unit_of "$(nb 4)")"
  as_user "$hubc" test ! -e "/run/user/1000/cawco/$(endpoint_of "$(nb 4)")"
  [[ "$(custody_of $hid)" == available ]]
  keeper_dropin remove
  start_session "$hid" keeperlive-4
  wait_until 60 'session_running keeperlive-4'
  [[ "$(holder_of "$hubc" keeperlive-4)" == "$(endpoint_of "${before#versions/}")" ]]
}
export -f full_update_keeper_cannot_start
check "in a full update a keeper that cannot start does not undo a healthy build, and the keeper before stays the machine's" full_update_keeper_cannot_start 900 "Install now applies the newer build" "$(printf '0.0.1-nightly.4+%s' 444444444444)"

trial_keeps_what_it_restores() {
  keeper_start_state
  local previous
  previous=$(current_link "$hubc")
  publish_nightly 5 42
  learn
  # While the helper decides the trial, the build it would restore is still on disk.
  wait_until 400 '[[ "$(current_link "$hubc")" == "versions/$(nb 5)" ]] && has_file "$hubc" trial.json'
  has_version "$hubc" "${previous#versions/}"
  # Once the helper has confirmed the build the trial is gone, the keeper has been handed over to it, and nothing
  # runs or names the previous build, so it is pruned.
  wait_until 400 '[[ "$(build_version $hid)" == "$(nb 5)" && "$(phase $hid)" == installed ]] && ! has_file "$hubc" trial.json'
  wait_until 120 '[[ "$(keeper_link "$hubc")" == "versions/$(nb 5)" && "$(current_endpoint "$hubc")" == "$(endpoint_of "$(nb 5)")" ]]'
  wait_until 60 '! has_version "$hubc" "${previous#versions/}"'
}
export -f trial_keeps_what_it_restores
check "the build a pending trial would restore is still on disk, and is removed after the trial is confirmed" trial_keeps_what_it_restores 900 "Install now applies the newer build" "$(printf '0.0.1-nightly.5+%s' 555555555555)"

keeper_cannot_start_with_held() {
  keeper_start_state
  local before held keeper
  before=$(keeper_link "$hubc")
  # A child the keeper holds through the update to build 6, whose keeper cannot start.
  spawn_child "$hubc" k1hold
  held=$(child_pids "$hubc" boundary-k1hold)
  keeper=$(keeper_pid "$hubc")
  [[ -n "$held" && -n "$keeper" ]]
  stub_when_staged break-when-staged "$(nb 6)" sessiond
  publish_nightly 6 43
  learn
  wait_until 400 '[[ "$(build_version $hid)" == "$(nb 6)" && "$(phase $hid)" == installed ]]'
  wait_until 60 '[[ "$(field $hid keeperFailedVersion)" == "$(nb 6)" ]]'
  # The child and its keeper are as they were, and that keeper is still the machine's.
  [[ "$(keeper_link "$hubc")" == "$before" ]]
  [[ "$(child_pids "$hubc" boundary-k1hold)" == "$held" && "$(keeper_pid "$hubc")" == "$keeper" ]]
  [[ "$(holder_of "$hubc" boundary-k1hold)" == "$(current_endpoint "$hubc")" ]]
  wait_until 60 '[[ "$(custody_of $hid)" == available ]]'
  keeper_dropin remove
  start_session "$hid" keeperlive-6
  wait_until 60 'session_running keeperlive-6'
  # Not handed over to the same build again by itself: its keeper's unit was written once, and not again in the
  # next three polls.
  [[ "$(apply_log_count "keeper $(nb 6): units")" == 1 ]]
  sleep 190
  [[ "$(apply_log_count "keeper $(nb 6): units")" == 1 ]]
  [[ "$(keeper_link "$hubc")" == "$before" ]]
}
export -f keeper_cannot_start_with_held
check "with a child held, a build whose keeper cannot start leaves the child and its keeper as they were, sessions still start, and it is not tried again" keeper_cannot_start_with_held 1500 "Install now applies the newer build" "$(printf '0.0.1-nightly.6+%s' 666666666666)"

helper_killed_mid_handover() {
  keeper_start_state
  local before held keeper
  before=$(keeper_link "$hubc")
  spawn_child "$hubc" k2hold
  held=$(child_pids "$hubc" boundary-k2hold)
  keeper=$(keeper_pid "$hubc")
  [[ -n "$held" && -n "$keeper" ]]
  # Build 7's keeper takes 30 s to start.
  stub_when_staged slow-when-staged "$(nb 7)" 30
  publish_nightly 7 44
  learn
  # The helper writes build 7's keeper unit, starts it beside the keeper before, and waits for it; it is killed
  # while it waits. Nothing has been switched: the keeper before is the machine's.
  wait_until 400 'as_user "$hubc" test -e "/home/cawco/.config/systemd/user/$(unit_of "$(nb 7)")"'
  sleep 5
  as_user "$hubc" pkill -9 -f binary-apply
  [[ "$(keeper_link "$hubc")" == "$before" ]]
  [[ "$(current_endpoint "$hubc")" == "$(endpoint_of "${before#versions/}")" ]]
  # The trial it left open is decided by a helper the agent starts: the build answers, its keeper is up by then and is
  # handed over to, the build is confirmed, and nothing is left in flight.
  wait_until 400 '[[ "$(keeper_link "$hubc")" == "versions/$(nb 7)" && "$(current_endpoint "$hubc")" == "$(endpoint_of "$(nb 7)")" ]]'
  wait_until 300 'as_user "$hubc" test ! -e /home/cawco/.local/share/cawco/binary/trial.json'
  as_user "$hubc" test ! -e /home/cawco/.local/share/cawco/binary/apply.lock
  wait_until 120 '[[ "$(phase $hid)" == installed && "$(build_version $hid)" == "$(nb 7)" ]]'
  [[ -z "$(field $hid keeperFailedVersion)" ]]
  wait_until 60 '[[ "$(custody_of $hid)" == available ]]'
  # The held child ran through all of it on the keeper before, the same process.
  [[ "$(child_pids "$hubc" boundary-k2hold)" == "$held" ]]
  [[ "$(holder_of "$hubc" boundary-k2hold)" == "$(endpoint_of "${before#versions/}")" ]]
  [[ "$(keeper_pid "$hubc" "$(unit_of "${before#versions/}")")" == "$keeper" ]]
  # A session starts, on build 7's keeper.
  start_session "$hid" keeperlive-7
  wait_until 60 'session_running keeperlive-7'
  [[ "$(holder_of "$hubc" keeperlive-7)" == "$(endpoint_of "$(nb 7)")" ]]
  keeper_dropin remove
}
export -f helper_killed_mid_handover
check "a helper killed while the keeper it hands over to is starting leaves the machine whole, and the decider that resumes finishes the handover" helper_killed_mid_handover 1200 "Install now applies the newer build" "$(printf '0.0.1-nightly.7+%s' 777777777777)"

# The brief's case: a joined machine with sessions running on its keeper installs a build. The new build's keeper
# takes a new session at once, the old sessions run on and stay answerable, through an agent restart in the middle
# of the handover too, and when they end the old keeper goes by itself.
handover_on_joined_machine() {
  keeper_start_state
  # One update at a time from here, each asked for: the hub's machine, then the joined one.
  put_policy nightly false
  sleep 15
  wait_until 300 '[[ "$(phase $hid)" != installing && "$(phase $jid)" != installing ]]'
  if [[ "$(build_version $jid)" != "$(build_version $hid)" ]]; then install_now_request "$jid" > /dev/null; fi
  wait_until 600 '[[ "$(build_version $jid)" == "$(build_version $hid)" && "$(phase $jid)" != installing ]]'
  # The joined machine holds nothing, so no earlier keeper of its is left: the one it has is the only one. Among those
  # that went is its keeper from before keepers ran side by side (see "a keeper from before keepers ran side by side
  # ..."): it went with its unit, and was killed outright, never told to drain, for a keeper of that age removes the
  # machine's endpoint, now another keeper's, when it drains.
  end_all_sessions "$joinerc"
  wait_until 180 '[[ "$(children_total "$joinerc")" == 0 && -z "$(retiring $jid)" ]]'
  wait_until 60 'as_user "$joinerc" test ! -e /home/cawco/.config/systemd/user/cawco-sessiond.service'
  [[ "$(as_user "$joinerc" sh -c 'journalctl --user --no-pager -o cat -u cawco-sessiond.service | grep -c "draining children" || true')" == 0 ]]
  local old oldend oldunit oldpid new id pid
  old=$(keeper_link "$joinerc")
  old=${old#versions/}
  oldend=$(current_endpoint "$joinerc")
  oldunit=$(current_unit "$joinerc")
  oldpid=$(keeper_pid "$joinerc")
  [[ "$oldend" == "$(endpoint_of "$old")" && -n "$oldpid" ]]
  # Three sessions running on the joined machine's keeper before its update.
  start_before "$jid" "$joinerc" "$out/handover-before.txt" handover-1 handover-2 handover-3
  # Build 8 reaches the hub's machine, then the joined machine, which installs it with its sessions running.
  publish_nightly 8 45
  learn
  install_now_request "$hid" > /dev/null
  wait_until 400 '[[ "$(build_version $hid)" == "$(nb 8)" && "$(phase $hid)" == installed ]]'
  wait_until 120 '[[ "$(field $jid availableVersion)" == "$(nb 8)" ]]'
  install_now_request "$jid" > /dev/null
  new=$(nb 8)
  wait_until 400 '[[ "$(build_version $jid)" == "'"$new"'" && "$(phase $jid)" == installed ]]'
  # The new build's keeper is the joined machine's at once: the keeper link, the machine's endpoint and the update
  # state name it, and the state says the keeper before is handing over with the three sessions it holds.
  [[ "$(keeper_link "$joinerc")" == "versions/$new" ]]
  [[ "$(current_endpoint "$joinerc")" == "$(endpoint_of "$new")" ]]
  wait_until 60 '[[ "$(field $jid sessiondVersion)" == "'"$new"'" && "$(retiring $jid)" == "'"$old"':3" ]]'
  hub_api /api/binary-updates/machines | json "d => JSON.stringify({phase: d.machines['$jid'].phase, sessiondVersion: d.machines['$jid'].sessiondVersion, retiringKeepers: d.machines['$jid'].retiringKeepers})"
  # A new session starts at once, on the new keeper.
  start_session "$jid" handover-new
  wait_until 60 'session_running handover-new'
  [[ "$(holder_of "$joinerc" handover-new)" == "$(endpoint_of "$new")" ]]
  # The old sessions run on: the same processes, still on the keeper before, which is the same process.
  survived "$joinerc" "$out/handover-before.txt"
  while read -r id pid; do
    [[ "$(holder_of "$joinerc" "$id")" == "$oldend" ]]
  done < "$out/handover-before.txt"
  [[ "$(keeper_pid "$joinerc" "$oldunit")" == "$oldpid" ]]
  # The agent restarts in the middle of the handover: it takes back the sessions on both keepers.
  as_user "$joinerc" systemctl --user restart cawco-agent.service
  wait_until 120 '[[ "$(custody_of $jid)" == available && "$(hub_api /api/agents | json "d => d.find(a => a.machineId === \"$jid\")?.status")" == online ]]'
  survived "$joinerc" "$out/handover-before.txt"
  wait_until 120 'session_running handover-new'
  [[ "$(holder_of "$joinerc" handover-new)" == "$(endpoint_of "$new")" ]]
  [[ "$(keeper_pid "$joinerc" "$oldunit")" == "$oldpid" ]]
  # An old session answers: stopped through the hub, the keeper before ends it.
  read -r id pid < "$out/handover-before.txt"
  stop_session "$jid" "$id"
  wait_until 60 '! as_user "$joinerc" kill -0 "'"$pid"'" 2> /dev/null'
  wait_until 60 '[[ "$(retiring $jid)" == "'"$old"':2" ]]'
  # The other two end; the keeper before then goes by itself, its process, unit and endpoint, and the new
  # keeper's session runs on.
  for pid in $(tail -n +2 "$out/handover-before.txt" | awk '{print $2}'); do
    as_user "$joinerc" kill "$pid"
  done
  wait_until 180 '! as_user "$joinerc" kill -0 "'"$oldpid"'" 2> /dev/null'
  wait_until 60 'as_user "$joinerc" test ! -e "/home/cawco/.config/systemd/user/'"$oldunit"'"'
  wait_until 60 'as_user "$joinerc" test ! -e "/run/user/1000/cawco/'"$oldend"'"'
  wait_until 60 '[[ -z "$(retiring $jid)" ]]'
  [[ "$(holder_of "$joinerc" handover-new)" == "$(endpoint_of "$new")" ]]
  session_running handover-new
  [[ "$(phase $jid)" == installed ]]
  # Only the new build's keeper unit is left on the machine.
  [[ "$(as_user "$joinerc" systemctl --user list-unit-files --no-legend 'cawco-sessiond*.service' | awk '{print $1}')" == "$(unit_of "$new")" ]]
}
export -f handover_on_joined_machine
check "a joined machine installs a build with sessions on its keeper: the new keeper takes a new session at once, the old sessions run on and answer through an agent restart, and the old keeper goes when they end" handover_on_joined_machine 1800 "Install now applies the newer build"

agent_cannot_start_whole_recovery() {
  keeper_start_state
  # Only the commanded update below may move the machine: an automatic one (a newer build published by an
  # earlier check) is stopped, and any that already began is waited out, before the previous build is read.
  put_policy nightly false
  sleep 15
  wait_until 300 '[[ "$(phase $hid)" != installing ]]'
  local previous
  previous=$(current_link "$hubc")
  # The build's agent verb fails and every other verb works; the stub is put on it the moment the update stages it.
  as_user "$hubc" sh -c 'rm -f /tmp/stub-9.done; sh /shared/keeper-dropin.sh break-when-staged "$1" up && touch /tmp/stub-9.done' _ "$(nb 9)" > /dev/null 2>&1 &
  publish_nightly 9 46
  learn
  install_now_request "$hid" > /dev/null
  wait_until 300 '[[ "$(current_link "$hubc")" == "versions/$(nb 9)" ]]'
  wait_until 20 'as_user "$hubc" test -e /tmp/stub-9.done'
  # Killed right after the swap: the new build's hub runs, its agent cannot stay up, and nothing is left to confirm it.
  as_user "$hubc" pkill -9 -f binary-apply
  # The agent's unit keeps restarting through the wrapper, which starts a helper from the previous build; within
  # that helper's window (180 s) plus a minute it rolls every unit back, the hub with them.
  wait_until 300 '[[ "$(current_link "$hubc")" == "'"$previous"'" ]]'
  wait_until 60 'as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q "\"version\":\"${previous#versions/}\""'
  wait_until 60 '[[ "$(hub_api /api/agents | json "d => d.find(a => a.machineId === \"$hid\")?.status")" == online ]]'
  wait_until 60 '[[ "$(custody_of $hid)" == available ]]'
  wait_until 60 '[[ "$(phase $hid)" == failed-rolled-back && "$(field $hid failedVersion)" == "$(nb 9)" ]]'
  as_user "$hubc" test ! -e /home/cawco/.local/share/cawco/binary/trial.json
  as_user "$hubc" test ! -e /home/cawco/.local/share/cawco/binary/apply.lock
  start_session "$hid" keeperlive-9
  wait_until 60 'session_running keeperlive-9'
}
export -f agent_cannot_start_whole_recovery
check "a helper killed after the swap of a build whose agent cannot start is put back whole, though its hub runs" agent_cannot_start_whole_recovery 900 "Install now applies the newer build"

# ---------------------------------------------------------------- the keeper's children cgroup
# A keeper's unit delegates the pids controller (Delegate=pids, DelegateSubgroup=keeper): systemd starts the
# keeper in …/cawco-sessiond-<build>.service/keeper, and the keeper puts every child in …/children, whose pids.max
# is the tightest task limit above it less the 64 tasks it keeps for itself (packages/sessiond/src/cgroup.ts).
#
# The limit is a known one, set before the keeper starts: TasksMax on the keepers' units, in an administrator's
# drop-in for every unit named cawco-sessiond-* (/etc/systemd/user/cawco-sessiond-.service.d), not on the user's
# whole tree (user-1000.slice or user@1000.service). The children's cap is derived from the tightest limit above
# them, and a limit on the keeper's unit binds only the keeper and its children; one on the user's tree is shared
# with the hub, the agent and the dashboard, and a forker allowed that limit less 64 would take the threads they
# need (Bun aborts when it cannot start one), leaving the machine broken for the checks after. This check runs
# last, so the limit changes nothing for the checks before it; the current keeper is restarted after the limit is
# set, holding nothing.
export KEEPER_TASKS=200
export PLACED_RE='^\[sessiond\] children run in (/sys/fs/cgroup/.+/cawco-sessiond-[^/]+\.service/children) under pids\.max ([0-9]+) \(([0-9]+), less 64 kept for the keeper\)$'
# The keeper's last word on where its children run, since a moment (unix seconds): one of the lines cgroup.ts says.
keeper_said() { as_user "$1" journalctl --user --no-pager -o cat -u "$(current_unit "$1")" --since "@$2" | grep '^\[sessiond\] ' | grep -v ' listening on \|^\[sessiond\] SIGTERM\| names this keeper$\|not the machine.s keeper' | tail -n 1; }
# Asks the keeper to start a child (container, procId, command, JSON args) and prints its ack for it. The keeper
# acks a spawn only once the child has started or been refused, after a process-table read, and its socket does
# not stay half-open: socat's shut-none keeps the request side open, and -t5 waits up to 5s for the ack.
keeper_spawn() {
  as_user "$1" sh -c 'printf "%s\n" "$1" | socat -t5 - UNIX-CONNECT:/run/user/1000/cawco/sessiond.sock,shut-none | grep -m1 "\"type\":\"ack\""' sh \
    "{\"type\":\"spawn\",\"commandId\":\"$2-$(date +%s%N)\",\"procId\":\"$2\",\"spec\":{\"command\":\"$3\",\"args\":$4}}"
}
# A process's cgroup, as /proc says it, under the container's /sys/fs/cgroup.
cgroup_of() { as_user "$1" sed -n 's/^0:://p' "/proc/$2/cgroup"; }
# The highest pids.current a cgroup shows over about ten seconds, read with the shell's own `read` so the
# reading itself forks almost nothing.
highest_pids() {
  as_user "$1" sh -c 'top=0; n=0; while [ $n -lt 200 ]; do i=0; while [ $i -lt 50 ]; do read v < "$1/pids.current"; [ "$v" -gt "$top" ] && top=$v; i=$((i + 1)); done; sleep 0.05; n=$((n + 1)); done; echo $top' sh "$2"
}
keeper_children_capped_on() {
  local c=$1 since said group max limit keeper pid forker ack top events
  echo "======== $c"
  $P exec "$c" sh -c "mkdir -p /etc/systemd/user/cawco-sessiond-.service.d && printf '[Service]\nTasksMax=%s\n' $KEEPER_TASKS > /etc/systemd/user/cawco-sessiond-.service.d/proof-tasks.conf"
  as_user "$c" systemctl --user daemon-reload
  end_all_sessions "$c"
  since=$(as_user "$c" date +%s)
  as_user "$c" systemctl --user restart "$(current_unit "$c")"
  wait_until 60 '[[ -n "$(keeper_said "$c" "$since")" ]] && as_user "$c" test -S /run/user/1000/cawco/sessiond.sock'
  # 1. The keeper says its children run in its delegated cgroup, under the limit set above less 64; any other
  # line (not delegated, could not be asked, no task limit, could not be set up) is the failure, printed.
  said=$(keeper_said "$c" "$since")
  echo "the keeper said: $said"
  [[ $said =~ $PLACED_RE ]] || { echo "FAIL: the keeper did not place its children in a capped cgroup: $said"; return 1; }
  group=${BASH_REMATCH[1]} max=${BASH_REMATCH[2]} limit=${BASH_REMATCH[3]}
  [[ $limit == "$KEEPER_TASKS" && $max == $((KEEPER_TASKS - 64)) ]] || { echo "FAIL: the cap is $max of $limit, not $((KEEPER_TASKS - 64)) of $KEEPER_TASKS"; return 1; }
  [[ "$(as_user "$c" cat "$group/pids.max")" == "$max" ]]
  # 2. A child it starts is in children; the keeper itself is in keeper.
  keeper=$(keeper_pid "$c")
  echo "keeper $keeper is in $(cgroup_of "$c" "$keeper")"
  [[ "$(cgroup_of "$c" "$keeper")" == */cawco-sessiond-*.service/keeper ]]
  ack=$(keeper_spawn "$c" cg-child sleep '["3000"]')
  echo "spawn cg-child: $ack"
  [[ $ack == *'"stage":"applied"'* ]]
  pid=$(child_pids "$c" cg-child)
  echo "child $pid is in $(cgroup_of "$c" "$pid")"
  [[ "$(cgroup_of "$c" "$pid")" == */cawco-sessiond-*.service/children && "/sys/fs/cgroup$(cgroup_of "$c" "$pid")" == "$group" ]]
  # 3. A child that forks without end stops at the cap: children never holds more than pids.max, and the kernel
  # refused its forks there (pids.events counts each refusal).
  # A forker that never gives up: dash exits at its first refused fork and bash after a few retries, and the
  # keeper then reaps the tree, emptying the group before the next spawn is tried. perl's fork() answers undef
  # at the cap and the loop goes on, holding the group full.
  ack=$(keeper_spawn "$c" cg-forker /usr/bin/perl '["-e","while (1) { my $p = fork(); if (defined $p && $p == 0) { sleep 600; exit 0 } select(undef, undef, undef, 0.01) unless defined $p }"]')
  echo "spawn cg-forker: $ack"
  [[ $ack == *'"stage":"applied"'* ]]
  forker=$(child_pids "$c" cg-forker)
  echo "forker: $forker"
  [[ -n $forker ]]
  top=$(highest_pids "$c" "$group")
  events=$(as_user "$c" cat "$group/pids.events")
  echo "children's highest pids.current over ten seconds: $top, pids.max $max; pids.events: $events"
  (( top <= max ))
  (( ${events#max } > 0 ))
  # The keeper still answers, is the same process, and refuses a further child in a sentence.
  keeper_list "$c" | json 'd => `the keeper answers list: ${d.procs.filter(p => p.alive).length} live children`'
  [[ "$(keeper_pid "$c")" == "$keeper" ]]
  ack=$(keeper_spawn "$c" cg-refused sleep '["3000"]')
  echo "spawn cg-refused: $ack"
  [[ $ack == *'"stage":"failed"'* && $ack == *'"reason":"process-limit: '* ]]
  # Once the forker and all it started are gone, a child starts again.
  as_user "$c" kill -KILL -- "-$forker"
  wait_until 60 '(( $(as_user "$c" cat "$group/pids.current") <= 2 ))'
  ack=$(keeper_spawn "$c" cg-after sleep '["3000"]')
  echo "spawn cg-after: $ack"
  [[ $ack == *'"stage":"applied"'* ]]
  [[ "$(keeper_pid "$c")" == "$keeper" ]]
  end_all_sessions "$c"
}
keeper_children_capped() {
  need_hub
  keeper_children_capped_on "$hubc"
  keeper_children_capped_on "$joinerc"
}
export -f keeper_said keeper_spawn cgroup_of highest_pids keeper_children_capped_on keeper_children_capped
check "the keeper's children run in its delegated pids cgroup, capped below the keeper's reserve" keeper_children_capped 600 "a second container joins the hub"

echo "Evidence: $out"
exit $status

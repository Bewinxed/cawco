#!/bin/bash
# The boundary handover, proved on a rig (packages/agent/src/boundary.ts
# `rearmHooks`, `handOver`, `closeIdle`):
#
#   bash artifacts/srt-eval/handover-rig.sh
#
# Run it from this checkout, on a Linux host, OUTSIDE any workspace boundary:
# the rig needs user namespaces, which a boundary refuses ("unshare: unshare
# failed: Operation not permitted"). It touches no live agent, hub or
# sessiond: its own sessiond, HOME and XDG_RUNTIME_DIR live in one scratch dir
# under $HOME, removed at the end.
#
# 1. An older-form workspace, made by the code of a commit before srt
#    (LEGACY_COMMIT, default d51a0359), with `sleep 6061 & disown` in it.
# 2. The agent's start-up pass of the last build before the fix (BASE_COMMIT,
#    default a7a370f4, Nightly C): it fails with "could not be written again:
#    ENOENT … ro/tools.sock" and replaces nothing. BASE_COMMIT=166af788
#    hands the anchor over and exits instead, so step 3 meets a boundary
#    whose agent is gone, as an agent restart leaves one.
# 3. The same pass from this checkout: no ENOENT, the hook is written, a
#    boundary of this build's form starts beside the old one, a new command
#    runs in it and cannot read ~/.claude/.credentials.json, and the sleep
#    still runs in the old namespace, whose boundary stays up.
# 4. Killing the sleep closes the old boundary, and its files go.
#
# Every command run through the executor prints its exit status, so one that
# prints nothing cannot read as a pass.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd -P)
legacy=${LEGACY_COMMIT:-d51a0359}
base=${BASE_COMMIT:-a7a370f4}
# Not under /tmp: the older form hides /tmp inside its boundary, so a state dir
# there would vanish under its own mounts (as no real HOME ever does).
rig=$(mktemp -d "$HOME/.hrig.XXXXXX")
say() { printf '\n== %s\n' "$*"; }
field() { { grep -o "\"$1\":[^,}]*" "$2" || true; } | head -1 | cut -d: -f2- | tr -d '"'; }
waitfor() { # seconds, then a test command: polls once a second
  local tries=$1
  shift
  until "$@"; do
    tries=$((tries - 1))
    [ "$tries" -gt 0 ] || return 1
    sleep 1
  done
}
# A command through the workspace's executor, then its exit status.
run() {
  local status=0
  "$state/exec" "$1" || status=$?
  echo "[exec exit $status]"
}
# A command through the executor, traced, so a silent run shows which FIFO
# it went to and what status it read: NAME.out, NAME.err (with the trace),
# and `status`.
traced() {
  status=0
  PS4='+exec: ' bash -x "$state/exec" "$2" > "$rig/$1.out" 2> "$rig/$1.err" || status=$?
  cat "$rig/$1.out"
  grep -v '^+' "$rig/$1.err" >&2 || true
  echo "[exec exit $status]"
}
went_through() {
  echo "--- the executor's trace"
  cat "$rig/$1.err"
  echo "--- boundary.json: $(cat "$state/boundary.json")"
  echo "--- the executor's $(grep -m1 '^fifo=' "$state/exec" || echo "fifo: none (an older executor: $(sed -n 2p "$state/exec"))")"
  echo "--- ro/: $(ls -l "$state/ro" | tr '\n' ' ')"
  for place in "$state"/boundaries/*/sandbox; do echo "--- $place: $(cat "$place" 2>/dev/null)"; done
  echo "--- requests left in tmp/: $(ls -A "$state/tmp" | tr '\n' ' ')"
  echo "--- the agent's log"
  cat "$rig/fixed.log"
}
# The ripgrep srt is handed in a checkout: part of the boundary's form (D3).
rg_of() {
  (cd "$1/packages/agent" && bun -e 'import { rgPath } from "@vscode/ripgrep-universal"; console.log(rgPath)') 2>/dev/null || echo "(none)"
}

say "worktrees: $legacy (older form), $base (without the fix), $here (with it)"
git -C "$here" worktree add -q --detach "$rig/old" "$legacy"
git -C "$here" worktree add -q --detach "$rig/base" "$base"
(cd "$rig/old" && bun install --frozen-lockfile >/dev/null)
(cd "$rig/base" && bun install --frozen-lockfile >/dev/null)
cp "$here/artifacts/srt-eval/rig-rearm.ts" "$rig/base/rig-rearm.ts"
sed -i 's|"../../packages/agent/src/boundary"|"./packages/agent/src/boundary"|' "$rig/base/rig-rearm.ts"
cat > "$rig/old/rig-create.ts" <<'EOF'
import { createWorkspace } from "./packages/agent/src/workspace";
console.log(JSON.stringify(await createWorkspace(process.argv[2], process.argv[3])));
process.exit(0);
EOF
rg_base=$(rg_of "$rig/base")
rg_here=$(rg_of "$here")

unset CAWCO_HUB_URL CAWCO_MACHINE_ID CAWCO_SESSION_CREDENTIAL INVOCATION_ID \
  CAWCO_SERVICE_MODE CLAUDE_CONFIG_DIR XPC_SERVICE_NAME
export IS_SANDBOX=1 HOME=$rig/home XDG_RUNTIME_DIR=$rig/run \
  CAWCO_SESSIOND_ENDPOINT=$rig/sessiond.sock \
  GIT_AUTHOR_NAME=rig GIT_AUTHOR_EMAIL=rig@rig GIT_COMMITTER_NAME=rig GIT_COMMITTER_EMAIL=rig@rig
mkdir -p "$HOME/.claude" "$rig/src"
mkdir -m 700 "$XDG_RUNTIME_DIR"
printf 'rig credential\n' > "$HOME/.claude/.credentials.json"
git -C "$rig/src" init -q -b main
printf 'rig\n' > "$rig/src/README"
git -C "$rig/src" add README
git -C "$rig/src" commit -q -m rig
# A workspace is cut only from a repository with an origin naming its default branch.
git init -q --bare -b main "$rig/origin.git"
git -C "$rig/src" remote add origin "$rig/origin.git"
git -C "$rig/src" push -q origin main

cleanup() {
  set +e
  if [ -n "${agent:-}" ]; then kill "$agent" 2>/dev/null; fi
  if [ -n "${id:-}" ] && [ -n "${clone:-}" ]; then
    (cd "$here" && bun artifacts/srt-eval/rig-workspace.ts archive "$id" "$clone" >/dev/null 2>&1)
  fi
  for proc in /proc/[0-9]*; do
    if tr '\0' ' ' < "$proc/cmdline" 2>/dev/null | grep -q sessiond &&
      tr '\0' '\n' < "$proc/environ" 2>/dev/null | grep -qx "CAWCO_SESSIOND_ENDPOINT=$CAWCO_SESSIOND_ENDPOINT"; then
      kill "${proc#/proc/}"
    fi
  done
  git -C "$here" worktree remove --force "$rig/old"
  git -C "$here" worktree remove --force "$rig/base"
  rm -rf "$rig"
}
trap cleanup EXIT

say "1. an older-form workspace, by $legacy's own code"
# The rig's sessiond, of this build, as a deploy leaves it beside older boundaries.
(cd "$here" && bun -e 'import { ensureSessiond } from "./packages/agent/src/sessiond-client"; await ensureSessiond(process.env.CAWCO_SESSIOND_ENDPOINT); process.exit(0)')
id=$(cat /proc/sys/kernel/random/uuid)
(cd "$rig/old" && bun rig-create.ts "$rig/src" "$id")
state=$HOME/.cawco/workspaces/$id
clone=$HOME/.worktrees/src-${id:0:8}
anchor=$(field pid "$state/boundary.json")
echo "boundary.json: identity=$(field identity "$state/boundary.json") pid=$anchor"
echo "state dir: $(ls "$state" | tr '\n' ' ')"
[ ! -e "$state/ro" ] && echo "no ro/ dir: the older form"
cd "$clone"
run 'head -c0 ~/.claude/.credentials.json 2>/dev/null && echo "older form: ~/.claude/.credentials.json READ" || echo "older form: ~/.claude/.credentials.json denied"'
run 'sleep 6061 >/dev/null 2>&1 & disown'
job=$(pgrep -fx 'sleep 6061')
old_ns=$(readlink "/proc/$anchor/ns/pid")
echo "job: host pid $job, in pid namespace $(readlink "/proc/$job/ns/pid"); the anchor's is $old_ns"

say "2. without the fix ($base): the start-up pass"
(cd "$rig/base" && bun rig-rearm.ts 12) 2>&1 | tee "$rig/base.log"
grep -q 'could not be written again: ENOENT.*ro/tools.sock' "$rig/base.log" &&
  echo "REPRODUCED: could not be written again: ENOENT … ro/tools.sock"
if [ -n "$(field gen "$state/boundary.json")" ] || ls "$state"/retiring-* >/dev/null 2>&1; then
  echo "UNEXPECTED: the older boundary was replaced"
else
  echo "no replacement: boundary.json still names the anchor $(field pid "$state/boundary.json")"
fi

say "3. with the fix ($(git -C "$here" rev-parse --short HEAD)): the start-up pass"
(cd "$here" && exec bun artifacts/srt-eval/rig-rearm.ts 120) > "$rig/fixed.log" 2>&1 &
agent=$!
# Between the start-up pass and the handover (the next look, 5 s on) the
# anchor still runs every command, through the executor its own build wrote.
# With BASE_COMMIT=166af788 the boundary here is the one step 2's agent
# started before it exited, as an agent restart leaves one.
armed() { grep -q 'boundary hooks written for' "$rig/fixed.log"; }
if waitfor 30 armed; then
  echo "-- a command between the start-up pass and the handover reaches its caller"
  traced between 'echo "pid namespace: $(readlink /proc/self/ns/pid)"'
  if [ "$status" -ne 0 ] || ! grep -q '^pid namespace: pid:' "$rig/between.out"; then
    echo "FAILED: the command between the start-up pass and the handover did not run; what it went through:"
    went_through between
  fi
else
  echo "FAILED: the start-up pass did not finish within 30 s"
fi
# This agent's own handover, not any record an earlier pass left.
handed() { grep -q "is handed over to" "$rig/fixed.log"; }
if waitfor 30 handed; then
  gen=$(field gen "$state/boundary.json")
  echo "handed over within 30 s: boundary.json now gen=$gen pid=$(field pid "$state/boundary.json") form=$(field form "$state/boundary.json")"
else
  echo "FAILED: no handover within 30 s"
fi
cat "$rig/fixed.log"
grep -q ENOENT "$rig/fixed.log" && echo "UNEXPECTED: ENOENT in the fixed run" || echo "no ENOENT in the fixed run"
echo "state dir: $(ls "$state" | tr '\n' ' ')"
echo "ro/: $(ls "$state/ro" | tr '\n' ' ')"
echo "boundaries/${gen:-?}/: $(ls "$state/boundaries/${gen:-none}" 2>/dev/null | tr '\n' ' ')"
echo "-- a new command runs in the new form"
traced new 'echo "pid namespace: $(readlink /proc/self/ns/pid)"; head -c0 ~/.claude/.credentials.json 2>/dev/null && echo "~/.claude/.credentials.json READ (OPEN)" || echo "~/.claude/.credentials.json denied (BLOCKED)"'
if [ "$status" -ne 0 ] || ! grep -q '^~/.claude/.credentials.json denied (BLOCKED)$' "$rig/new.out" ||
  ! grep -q '^pid namespace: pid:' "$rig/new.out" || grep -q "^pid namespace: $old_ns$" "$rig/new.out"; then
  echo "FAILED: the new command did not run in the new form; what it went through:"
  went_through new
fi
echo "-- the job runs on in the old namespace, and the old boundary with it"
sleep 12
if kill -0 "$job" 2>/dev/null; then
  echo "job $job alive, pid namespace $(readlink "/proc/$job/ns/pid")"
else
  echo "FAILED: the job is gone"
fi
kill -0 "$anchor" 2>/dev/null && echo "old anchor $anchor alive" || echo "FAILED: old anchor gone"
ls "$state"/retiring-* 2>/dev/null || echo "FAILED: no retiring record"

say "4. killing the job closes the old boundary"
kill "$job"
retired() { ! ls "$state"/retiring-*.json >/dev/null 2>&1; }
if waitfor 20 retired; then
  echo "retiring record gone"
else
  echo "FAILED: the old boundary was not closed within 20 s: $(ls "$state"/retiring-*.json | tr '\n' ' ')"
fi
# A zombie answers kill -0: gone is no longer running.
running() { kill -0 "$anchor" 2>/dev/null && [ "$(cut -d' ' -f3 "/proc/$anchor/stat" 2>/dev/null)" != Z ]; }
if waitfor 5 eval '! running'; then echo "old anchor $anchor gone"; else echo "FAILED: old anchor $anchor still alive"; fi
for left in run ssh_config.d runner.fifo; do
  [ -e "$state/$left" ] && echo "FAILED: $left still there" || echo "$left cleaned"
done
grep -E "handed over|older boundary" "$rig/fixed.log" || true

say "D3: the ripgrep srt is handed, by checkout (in the boundary's form)"
echo "$base: $rg_base"
echo "$here: $rg_here"
[ "$rg_base" = "$rg_here" ] && echo "same ripgrep: the two checkouts give one form" ||
  echo "different ripgrep: the two checkouts give two forms"

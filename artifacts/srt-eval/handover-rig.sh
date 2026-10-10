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
# under /tmp (short, for srt's 108-byte socket paths), removed at the end.
#
# 1. An older-form workspace, made by the code of a commit before srt
#    (LEGACY_COMMIT, default d51a0359), with `sleep 6061 & disown` in it.
# 2. The agent's start-up pass of the commit this one is based on
#    (BASE_COMMIT, default the merge base with origin/main): it fails with
#    "could not be written again: ENOENT … ro/tools.sock" and replaces nothing.
# 3. The same pass from this checkout: no ENOENT, the hook is written, a
#    boundary of this build's form starts beside the old one, a new command
#    runs in it and cannot read ~/.claude/.credentials.json, and the sleep
#    still runs in the old namespace, whose boundary stays up.
# 4. Killing the sleep closes the old boundary, and its files go.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd -P)
legacy=${LEGACY_COMMIT:-d51a0359}
base=${BASE_COMMIT:-$(git -C "$here" merge-base HEAD origin/main)}
rig=$(mktemp -d /tmp/hrig.XXXXXX)
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

cleanup() {
  set +e
  if [ -n "${agent:-}" ]; then kill "$agent" 2>/dev/null; fi
  if [ -n "${id:-}" ]; then
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
"$state/exec" 'head -c0 ~/.claude/.credentials.json 2>/dev/null && echo "older form: ~/.claude/.credentials.json READ" || echo "older form: ~/.claude/.credentials.json denied"'
"$state/exec" 'sleep 6061 >/dev/null 2>&1 & disown'
job=$(pgrep -fx 'sleep 6061')
echo "job: host pid $job, in pid namespace $(readlink "/proc/$job/ns/pid"); the anchor's is $(readlink "/proc/$anchor/ns/pid")"

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
if waitfor 30 grep -q '"gen"' "$state/boundary.json"; then
  gen=$(field gen "$state/boundary.json")
  echo "handed over within 30 s: boundary.json now gen=$gen pid=$(field pid "$state/boundary.json")"
else
  echo "FAILED: no handover within 30 s"
fi
cat "$rig/fixed.log"
grep -q ENOENT "$rig/fixed.log" && echo "UNEXPECTED: ENOENT in the fixed run" || echo "no ENOENT in the fixed run"
echo "state dir: $(ls "$state" | tr '\n' ' ')"
echo "ro/: $(ls "$state/ro" | tr '\n' ' ')"
echo "boundaries/${gen:-?}/: $(ls "$state/boundaries/${gen:-none}" 2>/dev/null | tr '\n' ' ')"
echo "-- a new command runs in the new form"
"$state/exec" 'echo "pid namespace: $(readlink /proc/self/ns/pid)"; head -c0 ~/.claude/.credentials.json 2>/dev/null && echo "~/.claude/.credentials.json READ (OPEN)" || echo "~/.claude/.credentials.json denied (BLOCKED)"'
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
if waitfor 20 test ! -e "$state/retiring-first.json"; then
  echo "retiring record gone"
else
  echo "FAILED: the old boundary was not closed within 20 s"
fi
kill -0 "$anchor" 2>/dev/null && echo "FAILED: old anchor $anchor still alive" || echo "old anchor $anchor gone"
for left in run ssh_config.d runner.fifo; do
  [ -e "$state/$left" ] && echo "FAILED: $left still there" || echo "$left cleaned"
done
grep -E "handed over|older boundary" "$rig/fixed.log" || true

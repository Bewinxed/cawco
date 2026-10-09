#!/bin/bash
# Prototype stand-in for sessiond holding a workspace's boundary:
#   runner-start.sh CLONE STATE SETTINGS
# Starts `srt --settings SETTINGS -c runner.sh` in CLONE (srt resolves its
# protected paths against its working directory), waits for the ready line,
# and records srt's pid, the runner's host pid, the sandbox to kill (Linux) and
# the clone for runner-exec.sh.
set -eu
clone=$1 state=$2 settings=$3
srt=${SRT:-srt}
here=$(cd "$(dirname "$0")" && pwd)
parent_of() { ps -o ppid= -p "$1" 2>/dev/null | tr -d ' ' || echo 1; }
args_of() { ps -ww -o args= -p "$1" 2>/dev/null; }
# Stop a runner already there: its sandbox first, so srt exits on its own and cleans up.
"$here/runner-stop.sh" "$state"
# ro/: what a command reads (srt-config.ts allows it read-only); tmp/ and cache/
# are its writable siblings; the rest of STATE is the host's own.
ro=$state/ro
mkdir -p "$state/tmp" "$state/cache" "$ro/git-template"
cp "$here/runner.sh" "$ro/runner.sh"
printf '%s\n' "$clone" > "$state/clone"
rm -f "$ro/runner.fifo" "$state/runner.hostpid"
mkfifo "$ro/runner.fifo"
cd "$clone"
# Linux: srt's own temp dir (its bridge socket), the one under the denied /tmp
# and /run that srt-config.ts re-allows. The command's TMPDIR is CLAUDE_CODE_TMPDIR.
srt_tmp=${TMPDIR:-/tmp}
if [ -s "$state/srt-host-tmp" ]; then srt_tmp=$(cat "$state/srt-host-tmp"); mkdir -p "$srt_tmp"; fi
# CAWCO_WORKSPACE: the marker every process of the workspace inherits, which is
# how macOS (no pid namespace) finds them all to stop them (boundary.ts killMarked).
TMPDIR=$srt_tmp CAWCO_WORKSPACE=$state CLAUDE_CODE_TMPDIR=$state/tmp XDG_CACHE_HOME=$state/cache BUN_INSTALL_CACHE_DIR=$state/cache/bun npm_config_cache=$state/cache/npm \
  nohup "$srt" --settings "$settings" -c "$ro/runner.sh $ro/runner.fifo" > "$state/runner.log" 2>&1 &
echo $! > "$state/srt.pid"
for _ in $(seq 600); do
  if grep -q cawco-boundary-ready "$state/runner.log" 2>/dev/null; then
    # The runner as the host sees it: the runner.sh process under this srt.
    pid=$(pgrep -f "^/bin/bash $ro/runner.sh $ro/runner.fifo" | while read -r p; do
      a=$p
      while [ "${a:-1}" -gt 1 ]; do
        [ "$a" = "$(cat "$state/srt.pid")" ] && { echo "$p"; break; }
        a=$(parent_of "$a")
      done
    done | head -1)
    [ -n "$pid" ] && echo "$pid" > "$state/runner.hostpid"
    # Linux: the outer bwrap. Killing it takes the sandbox's pid 1
    # (--die-with-parent) and with it every process inside. Killing srt does
    # not: its `sh -c bwrap` child outlives it and keeps bwrap's parent alive.
    a=${pid:-1}
    while [ "${a:-1}" -gt 1 ]; do
      parent=$(parent_of "$a")
      if args_of "$a" | grep -q '^bwrap ' && ! args_of "$parent" | grep -q '^bwrap '; then
        echo "$a" > "$state/sandbox.pid"
        break
      fi
      a=$parent
    done
    echo "runner up: srt $(cat "$state/srt.pid"), sandbox $(cat "$state/sandbox.pid" 2>/dev/null || echo none), runner ${pid:-unknown}"
    exit 0
  fi
  if ! kill -0 "$(cat "$state/srt.pid")" 2>/dev/null; then break; fi
  sleep 0.1
done
cat "$state/runner.log" >&2
exit 1

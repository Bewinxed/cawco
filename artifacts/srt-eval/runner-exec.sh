#!/bin/bash
# Prototype: the executor for the runner model — boundary.ts darwinExec, made
# platform-neutral. runner-exec.sh STATE SCRATCH [--cwd-out FILE] COMMAND
# STATE holds ro/runner.fifo, srt.pid, runner.hostpid and clone (runner-start.sh).
# Hands COMMAND, the caller's directory and environment to the workspace's
# runner over its FIFO and streams the output back; exits with its status.
state=$1 scratch=$2
shift 2
fifo=$state/ro/runner.fifo
if ! [ -p "$fifo" ]; then
  echo "cawco: this workspace's boundary is not running, so this command did not run." >&2
  exit 126
fi
cwd_out=
if [ "${1:-}" = --cwd-out ]; then cwd_out=$2; shift 2; fi
# Linux: srt protects .git/config and .git/hooks with read-only binds, and the
# kernel detaches such a bind when the host renames or unlinks its target (a
# host-side `git config` does: lock, then rename). Before every command the
# runner's own mount table must still hold both; when it does not, the whole
# sandbox is killed (background processes too) and the command refused.
if [ "$(uname)" = Linux ]; then
  if ! [ -s "$state/runner.hostpid" ]; then
    echo "cawco: this workspace's boundary has no runner on record, so this command did not run." >&2
    exit 126
  fi
  clone=$(cat "$state/clone")
  table=/proc/$(cat "$state/runner.hostpid")/mountinfo
  for protected in "$clone/.git/config" "$clone/.git/hooks"; do
    if ! awk -v p="$protected" '$5 == p { found = 1 } END { exit !found }' "$table" 2>/dev/null; then
      # srt sees its sandbox exit and cleans up after itself (its host proxy and socat bridge).
      kill -KILL "$(cat "$state/sandbox.pid")" 2>/dev/null
      rm -f "$fifo"
      echo "cawco: $protected lost its protection in this workspace's boundary (changed on the host), so the boundary was stopped and this command did not run. The workspace's next session starts it again." >&2
      exit 126
    fi
  done
fi
# The workspace's own caches: nothing the host runs is ever written by a command.
export XDG_CACHE_HOME=$state/cache BUN_INSTALL_CACHE_DIR=$state/cache/bun npm_config_cache=$state/cache/npm
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}
# srt denies writes under every **/.git/hooks (macOS glob; Linux by scan), so a
# `git clone` inside (SwiftPM checkouts, git dependencies) fails copying git's
# template hooks. An empty template dir means a clone copies none.
export GIT_TEMPLATE_DIR=$state/ro/git-template
if [ -z "${GH_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  token=$(gh auth token 2>/dev/null) && [ -n "$token" ] && GH_TOKEN=$token && export GH_TOKEN
fi
req=$(mktemp -d "$scratch/.run.XXXXXX") || exit 126
printf '%s' "$1" > "$req/cmd"
pwd -P > "$req/cwd"
export -p > "$req/env"
mkfifo "$req/out" "$req/err"
trap 'kill -TERM -- "-$(cat "$req/pid" 2>/dev/null)" 2>/dev/null; rm -rf "$req"; exit 143' TERM INT HUP
printf '%s\n' "$req" > "$fifo"
cat "$req/out" & out=$!
cat "$req/err" >&2 & err=$!
wait "$out" "$err"
until [ -s "$req/status" ]; do sleep 0.01; done
status=$(cat "$req/status")
if [ -n "$cwd_out" ] && [ -s "$req/cwd-out" ]; then cp "$req/cwd-out" "$cwd_out"; fi
rm -rf "$req"
exit "$status"

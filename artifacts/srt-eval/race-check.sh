#!/bin/bash
# Prototype check: does a process already running inside the sandbox win the
# race against the host-side watch (watch-protected.ts) when the host rewrites
# the clone's .git/config? Runs TRIALS rounds; each starts a fresh runner, starts
# a loop inside that tries `git config core.hooksPath` without pause, then has
# the host write the config once.
#   race-check.sh CLONE STATE SETTINGS TRIALS
set -u
clone=$1 state=$2 settings=$3 trials=$4
here=$(cd "$(dirname "$0")" && pwd)
won=0
for trial in $(seq "$trials"); do
  "$here/runner-start.sh" "$clone" "$state" "$settings" >/dev/null || exit 1
  bun "$here/watch-protected.ts" "$clone" "$state" > "$state/watch.log" 2>&1 &
  watcher=$!
  sleep 0.5
  (cd "$clone" && "$here/runner-exec.sh" "$state" "$state/tmp" 'nohup bash -c "while :; do git config core.hooksPath /tmp/srt-eval-pwn 2>/dev/null; done" >/dev/null 2>&1 & disown')
  sleep 0.5
  git -C "$clone" config --local cawco.hostwrite "$trial"
  wait "$watcher"
  sleep 0.3
  if [ -n "$(git -C "$clone" config --get core.hooksPath)" ]; then
    won=$((won + 1))
    git -C "$clone" config --unset core.hooksPath
    echo "trial $trial: the process inside set core.hooksPath before the kill"
  else
    echo "trial $trial: killed first ($(tail -1 "$state/watch.log"))"
  fi
  git -C "$clone" config --unset cawco.hostwrite
done
echo "inside won $won of $trials"

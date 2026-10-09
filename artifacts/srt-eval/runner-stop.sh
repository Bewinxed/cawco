#!/bin/bash
# Prototype: stops a workspace's runner and everything it started.
#   runner-stop.sh STATE
# Linux: SIGKILL to the outer bwrap takes the whole pid namespace; srt then
# sees its child exit and removes its proxy, socat bridge and mount points.
# macOS: Seatbelt has no pid namespace, so every process carrying the
# workspace's marker is killed (as boundary.ts killMarked does today), then srt.
set -u
state=$1
if [ -f "$state/sandbox.pid" ]; then kill -KILL "$(cat "$state/sandbox.pid")" 2>/dev/null; fi
if [ "$(uname)" = Darwin ]; then
  ps -axwwE -o pid=,command= | grep -F "CAWCO_WORKSPACE=$state " | awk '{ print $1 }' | while read -r p; do
    [ "$p" != "$$" ] && kill -KILL "$p" 2>/dev/null
  done
fi
if [ -f "$state/srt.pid" ]; then
  for _ in $(seq 30); do kill -0 "$(cat "$state/srt.pid")" 2>/dev/null || break; sleep 0.1; done
  kill -KILL "$(cat "$state/srt.pid")" 2>/dev/null
fi
rm -f "$state/sandbox.pid" "$state/srt.pid" "$state/runner.hostpid"
# srt's own temp dir (Linux): the sockets srt leaves behind go with it.
if [ -s "$state/srt-host-tmp" ]; then rm -rf "$(cat "$state/srt-host-tmp")"; fi
exit 0

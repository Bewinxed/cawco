#!/bin/bash
# Prototype measurement: wall time of N runs of `true` through each executor.
#   overhead.sh N SETTINGS STATE SCRATCH
# Prints median and p90 per executor in milliseconds.
set -u
n=$1 settings=$2 state=$3 scratch=$4
here=$(cd "$(dirname "$0")" && pwd)
measure() {
  local label=$1
  shift
  local times=()
  for _ in $(seq "$n"); do
    local start end
    start=$(date +%s%N)
    "$@" >/dev/null 2>&1
    end=$(date +%s%N)
    times+=($(((end - start) / 1000000)))
  done
  printf '%s\n' "${times[@]}" | sort -n | awk -v label="$label" '{ a[NR] = $1 } END { printf "%-28s median %4d ms   p90 %4d ms   (n=%d)\n", label, a[int((NR + 1) / 2)], a[int(NR * 0.9 + 0.5)], NR }'
}
measure "bare bash -c true" bash -c true
measure "srt per command" env SCRATCH="$scratch" "$here/srt-exec.sh" "$settings" true
measure "srt runner (FIFO)" "$here/runner-exec.sh" "$state" "$scratch" true

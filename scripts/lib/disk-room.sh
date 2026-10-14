# Sourced (or eval'd, as build-both.sh's Mac side does): defines
#   disk_room <dir> <what>
# the precondition every heavy run (scripts/lib/heavy-run.ts) and every Apple
# build (apps/apple/scripts/build-both.sh) checks before it starts: the
# filesystem holding <dir> has at least CAWCO_MIN_FREE_GB GB free (10 unless
# set). Below that it prints one sentence on stderr, naming the free space
# and the biggest folders under CawCo's workspace roots on this machine, and
# returns 3; the caller starts nothing. Bash 3.2 (the Mac's) runs it.
#
# Why 10 GB: a full Apple build root (the synced apps/apple, DerivedData for
# the simulator and Catalyst builds, logs) is ~5 GB, and a build writes it
# from empty; the other 5 GB is room for what the machine's other workspaces
# write meanwhile (a clone with its node_modules is ~2 GB, a dashboard build
# and a scratch fleet ~1 GB). On 2026-10-14 the Mac's Catalyst link died at
# 120 MB free (`ld: write() failed, errno=28`) instead of refusing up front.
disk_room() {
  local dir=$1 what=$2 min=${CAWCO_MIN_FREE_GB:-10} free_kb mount free biggest
  if ! [[ $min =~ ^[0-9]+$ ]]; then
    echo "CAWCO_MIN_FREE_GB is the free space in GB a heavy run needs to start, a whole number; it is \"$min\"" >&2
    return 2
  fi
  free_kb=$(df -Pk "$dir" | awk 'NR == 2 { print $4 }')
  mount=$(df -Pk "$dir" | awk 'NR == 2 { print $6 }')
  if ! [[ $free_kb =~ ^[0-9]+$ ]]; then
    echo "$what did not start: df could not read the free space of $dir" >&2
    return 2
  fi
  if (( free_kb * 1024 >= min * 1000000000 )); then
    return 0
  fi
  free=$(awk -v kb="$free_kb" 'BEGIN { printf "%.1f", kb * 1024 / 1e9 }')
  # Folders a boundary hides from its workspace are left out (du cannot read them).
  biggest=$(du -sk "$HOME"/.worktrees/* "$HOME"/.cawco/workspace-cache/xdg/cawco-apple/* \
    "$HOME"/.cawco/workspace-cache/DerivedData/* "$HOME"/.cawco/tmp/* "$HOME"/build/cawco-apple/* 2>/dev/null |
    sort -rn | head -5 |
    awk -v home="$HOME" '{ path = $2; if (index(path, home) == 1) path = "~" substr(path, length(home) + 1); printf "%s%s (%.1f GB)", (NR > 1 ? ", " : ""), path, $1 * 1024 / 1e9 }') || true
  echo "$what did not start: $mount has $free GB free, under the $min GB a heavy run or Apple build needs to start (CAWCO_MIN_FREE_GB); the biggest folders under CawCo's workspace roots here are ${biggest:-none this shell can read}." >&2
  return 3
}

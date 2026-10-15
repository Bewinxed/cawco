#!/bin/bash
# Usage: proof-sweep.sh [--stale] [DIR...]
# Ends what a container proof left behind under each DIR (a podman instance's run dir, its storage, a release's
# staging): every process whose command line names a path under DIR, with all it started (conmon and its container,
# pasta and aardvark-dns of the instance's rootless netns, a podman client), then every mount under DIR in podman's
# rootless mount namespace (a container's userdata/shm, the instance's rootless-netns), then DIR itself, removed from
# inside the user namespace that wrote its files. --stale adds every `$XDG_RUNTIME_DIR/cawco-proof-<name>-<pid>` run
# dir whose owner pid is not a live prove-stage script (the pid is gone, or reused by something else). One line per
# thing ended. Only processes and mounts that name one of these dirs are touched: no other podman container of the
# host is, and a live proof's run dir is never taken with --stale.
set -euo pipefail
dirs=()
if [[ ${1:-} == --stale ]]; then
  shift
  shopt -s nullglob
  for run in "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"/cawco-proof-*-*; do
    pid=${run##*-}
    [[ $pid =~ ^[0-9]+$ ]] || continue
    # The owner is alive only while that pid is still the prove-stage script that named the dir.
    if [[ -r /proc/$pid/cmdline ]] && tr '\0' ' ' < "/proc/$pid/cmdline" 2> /dev/null | grep -q 'prove-stage'; then
      continue
    fi
    dirs+=("$run")
  done
fi
for dir in "$@"; do
  [[ $dir = /* && $dir != / ]] || { echo "proof-sweep: $dir is not an absolute directory" >&2; exit 2; }
  dirs+=("${dir%/}")
done
(( ${#dirs[@]} > 0 )) || exit 0

# Every process naming a dir (an argument that is the dir or a path under it), and all of its descendants; never this
# sweep, what it runs (its command line, and ps and awk's here, name the dirs too) or what runs it.
procs=$(ps -eww -o pid=,ppid=,args= | awk -v self="$$" -v list="$(printf '%s\n' "${dirs[@]}")" '
  BEGIN { n = split(list, dir, "\n") }
  {
    pid = $1; ppid = $2; $1 = ""; $2 = ""; args = substr($0, 3)
    parent[pid] = ppid; cmd[pid] = args
    for (i = 1; i <= n; i++) {
      d = dir[i]
      if (index(" " args " ", " " d " ") || index(args, d "/")) { named[pid] = d; break }
    }
  }
  END {
    for (p = self; p in parent && p + 0 > 1; p = parent[p]) runsme[p] = 1
    for (pid in cmd) {
      if (pid in runsme) continue
      by = ""; under_self = 0
      for (p = pid; p in parent && p + 0 > 1; p = parent[p]) {
        if (p == self) under_self = 1
        if (by == "" && (p in named)) by = named[p]
      }
      if (by != "" && !under_self) print pid "\t" by "\t" substr(cmd[pid], 1, 160)
    }
  }')
if [[ -n $procs ]]; then
  pids=()
  while IFS=$'\t' read -r pid dir args; do
    echo "proof-sweep: ended pid $pid ($args), named by $dir"
    pids+=("$pid")
  done <<< "$procs"
  # In the user namespace: a container's processes run as mapped ids the host user cannot signal from outside it.
  podman unshare kill -KILL "${pids[@]}" 2> /dev/null || true
  for _ in $(seq 100); do
    left=$(ps -o pid=,stat= -p "$(IFS=,; echo "${pids[*]}")" 2> /dev/null | awk '$2 !~ /^Z/ { print $1 }' || true)
    [[ -n $left ]] || break
    sleep 0.1
  done
  [[ -z $left ]] || { echo "proof-sweep: still running after SIGKILL: $left" >&2; exit 1; }
fi

existing=()
for dir in "${dirs[@]}"; do [[ -e $dir ]] && existing+=("$dir"); done
(( ${#existing[@]} > 0 )) || exit 0
# Mount points (field 5 of mountinfo) under a dir, deepest first, in podman's rootless mount namespace.
mounts=$(podman unshare cat /proc/self/mountinfo | awk -v list="$(printf '%s\n' "${existing[@]}")" '
  BEGIN { n = split(list, dir, "\n") }
  { for (i = 1; i <= n; i++) if ($5 == dir[i] || index($5, dir[i] "/") == 1) { print $5; break } }' | sort -r)
if [[ -n $mounts ]]; then
  mapfile -t points <<< "$mounts"
  podman unshare umount -l "${points[@]}"
  printf 'proof-sweep: unmounted %s\n' "${points[@]}"
fi
podman unshare rm -rf -- "${existing[@]}"
printf 'proof-sweep: removed %s\n' "${existing[@]}"

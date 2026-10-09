#!/bin/bash
# Prototype: the review's escapes, tried from wherever this runs (inside today's
# boundary, or inside the srt sandbox). Never prints the content of anything it
# reads.
#
#   escape-checks.sh inside CLONE OTHER_REPO_ENV HOST_PID TOKEN
#     tries each escape; write probes are left in place, named with TOKEN,
#     because a write that "succeeds" inside may land in a sandbox-private
#     tmpfs and never reach the host.
#   escape-checks.sh host CLONE TOKEN
#     run on the host afterwards: reports which probes reached the host's
#     files, then removes them.
#
# A read counts as OPEN only when it returns content (today's boundary masks
# some sign-ins with an empty file).
set -u
mode=$1
result() { printf '%-30s %s\n' "$1" "$2"; }
source_repo() { # the repository the clone borrows its objects from
  local objects
  objects=$(head -1 "$1/.git/objects/info/alternates" 2>/dev/null) || return
  dirname "$(dirname "$objects")"
}
probes() { # name and path of every write probe, for a clone and a token
  local clone=$1 token=$2 source
  source=$(source_repo "$clone")
  printf '%s\n' \
    "write ~/.bun/bin|$HOME/.bun/bin/.srt-eval-$token" \
    "write ~/.cache (host runs it)|$HOME/.cache/.srt-eval-$token" \
    "plant .git/hooks|$clone/.git/hooks/post-commit-$token" \
    "write .git/modules/*/config|$clone/.git/modules/srt-eval-$token/config" \
    "plant source repo hook|${source:-/nonexistent}/.git/hooks/.srt-eval-$token" \
    "write .claude/settings.local.json|$clone/.claude/settings.local.json" \
    "write opencode.jsonc|$clone/opencode.jsonc"
}

if [ "$mode" = host ]; then
  clone=$2 token=$3
  while IFS='|' read -r name path; do
    # The probe's own content, not mere existence: srt leaves an empty
    # read-only placeholder at a protected name that does not exist yet.
    if [ -f "$path" ] && grep -qx probe "$path" 2>/dev/null; then
      result "$name" "OPEN (reached the host)"
      rm -f "$path"
      rmdir "$(dirname "$path")" 2>/dev/null || true
    else
      result "$name" BLOCKED
    fi
  done < <(probes "$clone" "$token")
  if [ "$(git -C "$clone" config --get core.hooksPath)" = "/tmp/srt-eval-$token" ]; then
    result "set core.hooksPath" "OPEN (reached the host)"
    git -C "$clone" config --unset core.hooksPath
  else
    result "set core.hooksPath" BLOCKED
  fi
  exit 0
fi

clone=$2 other_env=$3 host_pid=$4 token=$5
runtime=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}
try() { # name, then a command that succeeds only when the escape is open
  local name=$1
  shift
  if "$@" >/dev/null 2>&1; then result "$name" OPEN; else result "$name" BLOCKED; fi
}
reads() { [ -s "$1" ] && cat "$1" >/dev/null; }
lists() { [ -n "$(ls -A "$1" 2>/dev/null)" ]; }

while IFS='|' read -r _ path; do
  mkdir -p "$(dirname "$path")" 2>/dev/null
  printf 'probe\n' > "$path" 2>/dev/null
done < <(probes "$clone" "$token")
git -C "$clone" config core.hooksPath "/tmp/srt-eval-$token" >/dev/null 2>&1
try "read ~/.cawco/accounts" lists "$HOME/.cawco/accounts"
try "read claude sign-in" reads "$HOME/.claude/.credentials.json"
try "read other repo .env" reads "$other_env"
try "read ~/.ssh key" reads "$HOME/.ssh/id_ed25519"
connects() { # a Unix socket that accepts a connect (nothing is sent)
  local sock
  for sock in "$@"; do
    [ -S "$sock" ] && python3 -c 'import socket, sys; s = socket.socket(socket.AF_UNIX); s.settimeout(3); s.connect(sys.argv[1])' "$sock" && return 0
  done
  return 1
}
try "user bus socket" connects "$runtime/bus"
try "sessiond socket" connects "$runtime/cawco/sessiond.sock" "$HOME/.cawco/sessiond.sock"
try "signal process outside" kill -0 "$host_pid"
try "ssh to the Mac" timeout 15 ssh -F "$HOME/.ssh/config" -o BatchMode=yes -o ConnectTimeout=8 mac true

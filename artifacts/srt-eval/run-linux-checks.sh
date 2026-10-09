#!/bin/bash
# Prototype: the Linux half of the checks, against a scratch clone.
#   run-linux-checks.sh CLONE STATE OTHER_REPO_ENV
# Needs SRT (path to the srt CLI) and the clone's dependencies' playwright-core.
# Generates STATE/srt.json, starts the runner, and runs every check through it.
set -u
clone=$1 state=$2 other_env=$3
A=$(cd "$(dirname "$0")" && pwd)
r() { "$A/runner-exec.sh" "$state" "$state/tmp" "$@"; }
step() { printf '\n== %s\n' "$1"; }
timed() { local s e; s=$(date +%s); "$@"; local status=$?; e=$(date +%s); echo "exit=$status wall=$((e - s))s"; }

"$A/prepare-clone.sh" "$clone"
bun "$A/srt-config.ts" "$clone" "$state" "$state/srt.json" >/dev/null
"$A/runner-start.sh" "$clone" "$state" "$state/srt.json" || exit 1
cd "$clone" || exit 1

step "bun install (workspace's own cache, through srt's proxy)"
timed r 'set -o pipefail; bun install 2>&1 | tail -1'
step "dashboard build"
timed r 'set -o pipefail; cd apps/dashboard && bun run build 2>&1 | tail -1'
step "git add -A and commit"
timed r 'date +%s%N > srt-probe-linux.txt && git add -A && git commit -qm "srt eval probe" && git log --oneline -1'
step "playwright: Chromium from ~/.cache/ms-playwright, page served by the same command"
mkdir -p node_modules/.srt-eval && cp "$A/playwright-check.mjs" node_modules/.srt-eval/check.mjs
timed r 'set -o pipefail; node node_modules/.srt-eval/check.mjs 2>&1 | tail -2'
step "a server one command starts, reached and stopped by the next"
r 'nohup python3 -m http.server 8779 --bind 127.0.0.1 >/dev/null 2>&1 & disown'
sleep 1
r 'curl -s -o /dev/null -w "next command: %{http_code}\n" --max-time 3 http://127.0.0.1:8779/; pkill -f "http.server 8779" && echo "stopped by a later command"'
step "escape checks (reads and sockets from inside; writes verified on the host)"
cp "$A/escape-checks.sh" "$state/ro/escape-checks.sh"
r "$state/ro/escape-checks.sh inside $clone $other_env $(cat "$state/srt.pid") lx"
"$state/ro/escape-checks.sh" host "$clone" lx
step "host unix sockets a command can connect to"
cp "$A/socket-checks.sh" "$state/ro/socket-checks.sh"
r "$state/ro/socket-checks.sh"
step "the host's own loopback services (the agent/hub API on 3456), forced through srt's proxy"
r 'curl -s -o /dev/null -w "host 127.0.0.1:3456 via proxy: %{http_code}\n" --max-time 5 --noproxy "" --proxy "$HTTP_PROXY" http://127.0.0.1:3456/; curl -s -o /dev/null -w "host 127.0.0.1:3456 direct: %{http_code}\n" --max-time 3 http://127.0.0.1:3456/'
step "host /tmp and /tmp/claude"
r 'ls -A /tmp 2>&1 | head -3; echo "tmp entries visible: $(ls -A /tmp 2>/dev/null | wc -l)"; touch /tmp/claude/.srt-eval 2>&1 | head -1'
step "overhead"
SCRATCH=$state/tmp "$A/overhead.sh" 20 "$state/srt.json" "$state" "$state/tmp"
"$A/runner-stop.sh" "$state"
uptime

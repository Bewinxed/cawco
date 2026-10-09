#!/bin/bash
# Prototype: the Mac half of the checks, run on the Mac against a scratch clone.
#   run-mac-checks.sh SCRATCH OTHER_REPO_ENV
# SCRATCH holds node_modules/.bin/srt, artifacts/ (these scripts), ws/ (the
# clone) and state/ (its state dir, srt.json already generated).
set -u
S=$1 other_env=$2
export PATH=/opt/homebrew/bin:$HOME/.bun/bin:$PATH
export SRT=$S/node_modules/.bin/srt
A=$S/artifacts
r() { "$A/runner-exec.sh" "$S/state" "$S/state/tmp" "$@"; }
step() { printf '\n== %s\n' "$1"; }
timed() { local s e; s=$(date +%s); "$@"; local status=$?; e=$(date +%s); echo "exit=$status wall=$((e - s))s"; }

"$A/runner-start.sh" "$S/ws" "$S/state" "$S/state/srt.json" || exit 1
cd "$S/ws" || exit 1

step "bun install (workspace's own cache, through srt's proxy)"
timed r 'set -o pipefail; bun install 2>&1 | tail -2'
step "bun run build:core"
timed r 'set -o pipefail; bun run build:core 2>&1 | tail -3'
step "git add -A and commit"
timed r 'date +%s > srt-probe.txt && git add -A && git commit -qm "srt eval probe" && git log --oneline -1'
step "playwright: Chromium from ~/Library/Caches/ms-playwright"
cp "$A/playwright-check.mjs" "$S/state/tmp/pw-check.mjs" 2>/dev/null
timed r 'set -o pipefail; mkdir -p "$TMPDIR/pw" && cd "$TMPDIR/pw" && { [ -f package.json ] || echo "{}" > package.json; } && bun add playwright-core@1.63.0 >/dev/null 2>&1 && cp "$TMPDIR/pw-check.mjs" . && PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright node pw-check.mjs 2>&1 | tail -4'
step "escape checks"
cp "$A/escape-checks.sh" "$S/state/ro/escape-checks.sh"
r "$S/state/ro/escape-checks.sh inside $S/ws $other_env $(cat "$S/state/srt.pid") mac1"
"$S/state/ro/escape-checks.sh" host "$S/ws" mac1
step "overhead"
SCRATCH=$S/state/tmp "$A/overhead.sh" 15 "$S/state/srt.json" "$S/state" "$S/state/tmp"
uptime

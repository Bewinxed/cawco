#!/bin/bash
# What must keep working inside a Linux workspace's boundary, run from inside
# a workspace's clone (a delegate's shell, or `exec` in the clone):
#   bash artifacts/srt-eval/run-linux-works.sh
# Each step prints its own result line and exit status. The push goes to a
# secret gist made for it and deleted after (a scratch remote over https).
set -u
clone=$(pwd -P)
step() { printf '\n== %s\n' "$1"; }
timed() { local s e status; s=$(date +%s%N); "$@"; status=$?; e=$(date +%s%N); echo "exit=$status wall=$(((e - s) / 1000000))ms"; }

step "bun install (the workspaces' shared cache, through srt's proxy)"
echo "BUN_INSTALL_CACHE_DIR=$BUN_INSTALL_CACHE_DIR"
timed bash -c 'set -o pipefail; bun install 2>&1 | tail -1'

step "dashboard vite build"
timed bash -c 'set -o pipefail; cd apps/dashboard && bun run build 2>&1 | tail -1'

step "git add -A and commit, from the root"
timed bash -c 'date +%s%N > srt-works-root.txt && git add -A && git commit -qm "srt works probe (root)" && git log --oneline -1'
step "git add -A and commit, from a subdirectory"
timed bash -c 'cd packages/agent && date +%s%N > srt-works-sub.txt && git add -A && git commit -qm "srt works probe (subdir)" && git log --oneline -1'
git reset -q --hard HEAD~2

step "gh api user (GH_TOKEN through srt's proxy; Go's TLS)"
timed bash -c 'gh api user --jq .login'

step "git push over https to a scratch remote"
gist=$(echo "srt works probe $(date +%s)" | gh gist create --filename srt-probe.txt - 2>/dev/null | tail -1)
echo "scratch remote: ${gist:-none}"
if [ -n "$gist" ]; then
  work=$(mktemp -d)
  timed bash -c "git clone -q '$gist.git' '$work/g' && cd '$work/g' && date +%s%N >> srt-probe.txt && git commit -qam push-probe && git push -q origin HEAD 2>&1 && git log --oneline -1"
  gh gist delete "${gist##*/}" --yes && echo "scratch remote deleted"
  rm -rf "$work"
fi

step "Playwright Chromium, a page this command serves"
mkdir -p "$TMPDIR/pw"
cat > "$TMPDIR/pw/check.mjs" <<'JS'
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright-core";
const server = createServer((_req, res) => { res.setHeader("content-type", "text/html"); res.end("<h1 id=ok>inside srt</h1>"); });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
const text = await page.textContent("#ok");
await page.screenshot({ path: join(process.env.TMPDIR, "srt-works.png") });
await browser.close();
server.close();
console.log(JSON.stringify({ text, browsers: process.env.PLAYWRIGHT_BROWSERS_PATH }));
JS
cp "$TMPDIR/pw/check.mjs" "$clone/packages/agent/.srt-works-check.mjs"
timed bash -c "cd '$clone/packages/agent' && bun .srt-works-check.mjs 2>&1 | tail -2"
rm -f "$clone/packages/agent/.srt-works-check.mjs"

step "a server one command starts, reached and stopped by the next"
echo "(run by the caller as separate commands: see the report)"

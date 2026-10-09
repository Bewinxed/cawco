#!/bin/bash
# The macOS workspace boundary's checks, against the Seatbelt profile this
# checkout generates from the workspace policy (packages/agent/src/boundary-policy.ts).
# Run on the Mac from an UNSANDBOXED shell in a checkout of this branch: a
# shell inside a CawCo workspace is itself under Seatbelt, which does not nest
# (srt #67: "sandbox_apply: Operation not permitted").
#
#   bash artifacts/srt-eval/run-mac-checks.sh SOURCE_REPO OTHER_REPO_ENV [SWIFT_PACKAGE] [XCODE_DIR XCODE_SCHEME]
#
# SOURCE_REPO is a git repository to cut the workspace from (~/anbar), and
# OTHER_REPO_ENV a secret file of another repository. SWIFT_PACKAGE (a dir
# in the clone, e.g. AnbarKit) gets `swift build`; XCODE_DIR and XCODE_SCHEME
# (a dir in the clone and a scheme) get a simulator `xcodebuild build`.
# It starts its own sessiond on a scratch socket, creates one workspace through
# the product code (rig-workspace.ts), runs everything through the workspace's
# executor, then archives the workspace and stops what it started.
set -u
source_repo=$1 other_env=$2 swift_package=${3:-} xcode_dir=${4:-} xcode_scheme=${5:-}
here=$(cd "$(dirname "$0")" && pwd)
checkout=$(cd "$here/../.." && pwd)
export PATH=/opt/homebrew/bin:$HOME/.bun/bin:$PATH
scratch=$(mktemp -d)
export CAWCO_SESSIOND_ENDPOINT=$scratch/sessiond.sock
open=0
row() { printf '%-50s %s\n' "$1" "$2"; [ "$2" = OPEN ] && open=$((open + 1)); return 0; }
step() { printf '\n== %s\n' "$1"; }
timed() { local s e status; s=$(date +%s); "$@"; status=$?; e=$(date +%s); echo "exit=$status wall=$((e - s))s"; }

(cd "$checkout" && exec bun packages/cli/src/cli.ts sessiond > "$scratch/sessiond.log" 2>&1) &
sessiond=$!
for _ in $(seq 100); do [ -S "$CAWCO_SESSIOND_ENDPOINT" ] && break; sleep 0.1; done
id=$(uuidgen | tr 'A-Z' 'a-z')
created=$(cd "$checkout" && bun artifacts/srt-eval/rig-workspace.ts create "$source_repo" "$id") || { echo "the workspace did not start"; kill "$sessiond"; exit 1; }
clone=$(printf '%s' "$created" | sed -n 's/.*"path":"\([^"]*\)".*/\1/p')
state=$HOME/.cawco/workspaces/$id
echo "workspace $id: $clone"
r() { (cd "$clone" && "$state/exec" "$@"); }

step "the generated profile (first lines)"
head -12 "$state/boundary.sb"

step "escapes (writes verified here, outside the sandbox)"
r "head -c0 \"\$(ls -d ~/.cawco/accounts/*/claude/.credentials.json 2>/dev/null | head -1)\" 2>/dev/null" && row "read ~/.cawco/accounts" OPEN || row "read ~/.cawco/accounts" BLOCKED
r 'test -n "$(ls -A ~/.cawco/accounts 2>/dev/null)"' && row "list ~/.cawco/accounts" OPEN || row "list ~/.cawco/accounts" BLOCKED
r 'head -c0 ~/.claude.json 2>/dev/null' && row "read ~/.claude.json" OPEN || row "read ~/.claude.json" BLOCKED
r "head -c0 '$other_env' 2>/dev/null" && row "read another repo's secret file" OPEN || row "read another repo's secret file" BLOCKED
r 'head -c0 ~/.ssh/id_ed25519 2>/dev/null' && row "read ~/.ssh key" OPEN || row "read ~/.ssh key" BLOCKED
r 'head -c0 ~/Library/Keychains/login.keychain-db 2>/dev/null' && row "read the login keychain" OPEN || row "read the login keychain" BLOCKED
r 'test -n "${SSH_AUTH_SOCK:-}"' && row "SSH_AUTH_SOCK set" OPEN || row "SSH_AUTH_SOCK set" BLOCKED
r "python3 -c 'import socket,sys; s=socket.socket(socket.AF_UNIX); s.settimeout(3); s.connect(sys.argv[1])' '$CAWCO_SESSIOND_ENDPOINT' 2>/dev/null" && row "connect sessiond" OPEN || row "connect sessiond" BLOCKED
agent_sock=$(ls -d /private/tmp/com.apple.launchd.*/Listeners 2>/dev/null | head -1)
if [ -n "$agent_sock" ]; then r "python3 -c 'import socket,sys; s=socket.socket(socket.AF_UNIX); s.settimeout(3); s.connect(sys.argv[1])' '$agent_sock' 2>/dev/null" && row "connect launchd's ssh-agent" OPEN || row "connect launchd's ssh-agent" BLOCKED; fi
r "kill -0 $$ 2>/dev/null" && row "signal a process outside" OPEN || row "signal a process outside" BLOCKED
r '/bin/launchctl print gui/$(id -u) >/dev/null 2>&1' && row "launchctl" OPEN || row "launchctl" BLOCKED
source_hooks=$(cd "$source_repo" && git rev-parse --path-format=absolute --git-path hooks)
probe=srt-mac-check-$id
for target in "$HOME/.bun/bin/.$probe" "$HOME/Library/Caches/.$probe" "$clone/.git/hooks/post-commit-$probe" "$clone/.git/modules/$probe/config" "$source_hooks/$probe" "$clone/.claude/settings.local.json" "$clone/opencode.jsonc"; do
  existed=no; [ -e "$target" ] && existed=yes
  r "mkdir -p \"\$(dirname '$target')\" 2>/dev/null; printf probe > '$target' 2>/dev/null"
  if [ "$existed" = no ] && [ -e "$target" ]; then row "write ${target/#$HOME/~}" OPEN; rm -f "$target"; else row "write ${target/#$HOME/~}" BLOCKED; fi
done
r 'git config core.hooksPath /nonexistent/srt-check 2>/dev/null'
if [ "$(git -C "$clone" config --get core.hooksPath)" = /nonexistent/srt-check ]; then row "set core.hooksPath" OPEN; git -C "$clone" config --unset core.hooksPath; else row "set core.hooksPath" BLOCKED; fi

step "still working"
timed r 'set -o pipefail; date +%s > srt-mac-probe.txt && git add -A && git commit -qm "srt mac probe" && git log --oneline -1'
if [ -n "$swift_package" ]; then
  timed r "set -o pipefail; cd '$swift_package' && swift build 2>&1 | tail -3"
fi
if [ -n "$xcode_dir" ]; then
  timed r "set -o pipefail; cd '$xcode_dir' && xcodebuild -scheme '$xcode_scheme' -destination 'generic/platform=iOS Simulator' build 2>&1 | tail -3"
fi
cat > "$state/tmp/pw-check.mjs" <<'JS'
import { createServer } from "node:http";
import { chromium } from "playwright-core";
const server = createServer((_req, res) => { res.setHeader("content-type", "text/html"); res.end("<h1 id=ok>inside the boundary</h1>"); });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
console.log(JSON.stringify({ text: await page.textContent("#ok") }));
await browser.close();
server.close();
JS
timed r 'set -o pipefail; mkdir -p "$TMPDIR/pw" && cd "$TMPDIR/pw" && { [ -f package.json ] || echo "{}" > package.json; } && bun add playwright-core@1.63.0 >/dev/null 2>&1 && cp "$TMPDIR/pw-check.mjs" . && bun pw-check.mjs 2>&1 | tail -3'

step "overhead (exec true, n=20)"
for _ in $(seq 20); do s=$(perl -MTime::HiRes=time -e 'printf "%d", time*1000'); r true; e=$(perl -MTime::HiRes=time -e 'printf "%d", time*1000'); echo $((e - s)); done | sort -n | awk '{ a[NR] = $1 } END { printf "median %d ms   p90 %d ms   (n=%d)\n", a[int((NR + 1) / 2)], a[int(NR * 0.9 + 0.5)], NR }'
uptime

step "archive"
(cd "$checkout" && bun artifacts/srt-eval/rig-workspace.ts archive "$id" "$clone")
kill "$sessiond" 2>/dev/null
rm -rf "$scratch"
echo
if [ "$open" -eq 0 ]; then echo "every escape row BLOCKED"; else echo "$open escape row(s) OPEN"; exit 1; fi

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
# The agent service's PATH has these first (packages/cli/src/service.ts `servicePath`).
export PATH=$HOME/.local/bin:$HOME/.bun/bin:/opt/homebrew/bin:$PATH
# A workspace's gh and git get their token from the executor alone.
unset GH_TOKEN GITHUB_TOKEN
scratch=$(mktemp -d)
export CAWCO_SESSIOND_ENDPOINT=$scratch/sessiond.sock
open=0
fail=0
row() { printf '%-50s %s\n' "$1" "$2"; [ "$2" = OPEN ] && open=$((open + 1)); return 0; }
works() { printf '%-50s %s\n' "$1" "$2"; [ "${2%% *}" = FAIL ] && fail=$((fail + 1)); return 0; }
# The first command in a PATH dir under home whose real path matches the glob $1.
landing_cmd() {
  local dir file real
  for dir in $(printf '%s' "$PATH" | tr ':' '\n' | grep "^$HOME/"); do
    for file in "$dir"/*; do
      real=$(perl -MCwd=abs_path -e 'print abs_path($ARGV[0]) // ""' "$file" 2>/dev/null)
      # shellcheck disable=SC2254
      case "$real" in $1) basename "$file"; return 0 ;; esac
    done
  done
  return 1
}
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

step "the generated profile (whole in $checkout/macos-boundary.sb; first lines)"
cp "$state/boundary.sb" "$checkout/macos-boundary.sb"
head -12 "$state/boundary.sb"

step "gh and git push, with no GH_TOKEN in the caller"
# No cache: the executor asks gh for its token on the host, outside Seatbelt.
rm -f "$state/gh-token"
login=$(r 'gh api user -q .login' 2>"$scratch/gh.err")
if [ -n "$login" ]; then works "gh api user (token read on the host)" "PASS ($login)"; else works "gh api user (token read on the host)" FAIL; sed 's/^/    /' "$scratch/gh.err"; fi
[ -s "$state/gh-token" ] && works "the executor wrote its gh-token cache" PASS || works "the executor wrote its gh-token cache" FAIL
login=$(r 'gh api user -q .login' 2>"$scratch/gh.err")
if [ -n "$login" ]; then works "gh api user (token from the cache)" "PASS ($login)"; else works "gh api user (token from the cache)" FAIL; sed 's/^/    /' "$scratch/gh.err"; fi
origin=$(git -C "$clone" remote get-url origin)
if r "git push --dry-run origin HEAD:refs/heads/cawco-mac-check-$id" > "$scratch/push.out" 2>&1; then
  works "git push --dry-run to $origin" PASS
else
  works "git push --dry-run to $origin" FAIL
  tail -5 "$scratch/push.out" | sed 's/^/    /'
fi

step "home toolchains"
echo "tool trees the policy reads back beyond the PATH dirs:"
(cd "$checkout" && bun artifacts/srt-eval/home-toolchains.ts) | sed 's/^/    /'
if command -v uv >/dev/null; then
  r 'uv --version' > "$scratch/tool.out" 2>&1 && works "uv --version ($(command -v uv))" PASS || { works "uv --version ($(command -v uv))" FAIL; tail -3 "$scratch/tool.out" | sed 's/^/    /'; }
else
  works "uv --version" "FAIL (no uv on PATH)"
fi
for kind in '*/pipx/venvs/*' '*/uv/tools/*' '*/.local/share/claude/*'; do
  cmd=$(landing_cmd "$kind")
  if [ -z "$cmd" ]; then
    echo "no command on a home PATH dir lands in $kind"
    [ "$kind" = '*/pipx/venvs/*' ] && works "a pipx command" "FAIL (none installed)"
    continue
  fi
  r "$cmd --version >/dev/null 2>&1 || $cmd --help >/dev/null 2>&1" > "$scratch/tool.out" 2>&1 && works "$cmd (lands in $kind)" PASS || { works "$cmd (lands in $kind)" FAIL; r "$cmd --version" 2>&1 | tail -3 | sed 's/^/    /'; }
done

step "escapes (writes verified here, outside the sandbox)"
for gh_file in hosts.yml config.yml; do
  if [ -e "$HOME/.config/gh/$gh_file" ]; then
    r "cat ~/.config/gh/$gh_file >/dev/null 2>&1" && row "cat ~/.config/gh/$gh_file" OPEN || row "cat ~/.config/gh/$gh_file" BLOCKED
  else
    echo "(no ~/.config/gh/$gh_file on this Mac to read)"
  fi
done
r "cat '$state/gh-token' >/dev/null 2>&1" && row "cat the gh-token cache" OPEN || row "cat the gh-token cache" BLOCKED
# uv's credentials store, inside the uv tree the policy now reads back: a probe
# file put there on the host, never the owner's own credentials.
uv_credentials=${UV_CREDENTIALS_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/uv/credentials}
made_uv_dir=no; [ -d "$uv_credentials" ] || { mkdir -p "$uv_credentials" && made_uv_dir=yes; }
printf probe > "$uv_credentials/.cawco-probe-$id"
r "cat '$uv_credentials/.cawco-probe-$id' >/dev/null 2>&1" && row "read uv's credentials store" OPEN || row "read uv's credentials store" BLOCKED
rm -f "$uv_credentials/.cawco-probe-$id"; [ "$made_uv_dir" = yes ] && rmdir "$uv_credentials" 2>/dev/null
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
noise=$(r 'pwd -P >/dev/null; cd .. && cd - >/dev/null' 2>&1 | grep -c "getcwd\|shell-init\|error retrieving current directory")
echo "a command's shell reads its directory: $noise getcwd line(s)"
[ "$noise" -eq 0 ] || { echo "a command's shell cannot read its directory"; open=$((open + 1)); }
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
if [ "$open" -eq 0 ]; then echo "every escape row BLOCKED"; else echo "$open escape row(s) OPEN"; fi
[ "$fail" -eq 0 ] || echo "$fail working row(s) FAIL"
status=0; [ "$open" -eq 0 ] && [ "$fail" -eq 0 ] || status=1
echo "EXIT $status"
exit "$status"

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
# (a dir in the clone and a scheme, or `auto` for the dir's first scheme) get
# a simulator `xcodebuild build`. Each of those, git push and Playwright is a
# working row: a failure fails the run, as an OPEN escape row does.
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
# A working row this machine's state keeps from running (its reason said).
skipped=0
skip() { printf '%-50s %s\n' "$1" "SKIP ($2)"; skipped=$((skipped + 1)); }
# The first command in a PATH dir under home whose real path matches the glob $1.
# Every one, as "NAME<tab>REAL PATH" lines.
landing_cmds() {
  local dir file real
  for dir in $(printf '%s' "$PATH" | tr ':' '\n' | grep "^$HOME/"); do
    for file in "$dir"/*; do
      real=$(perl -MCwd=abs_path -e 'print abs_path($ARGV[0]) // ""' "$file" 2>/dev/null)
      # shellcheck disable=SC2254
      case "$real" in $1) printf '%s\t%s\n' "$(basename "$file")" "$real" ;; esac
    done
  done
}
# Where the code of a tool installed editable lives, for a command at real
# path $1 in a venv's bin: the dir its direct_url.json names (PEP 610,
# "dir_info": {"editable": true}). Nothing for any other command.
editable_source() {
  local venv=${1%/bin/*}
  [ -f "$venv/pyvenv.cfg" ] || return 0
  perl -MJSON::PP -0777 -ne 'my $j = eval { decode_json($_) } or next; if ($j->{dir_info}{editable}) { (my $u = $j->{url}) =~ s{^file://}{}; print "$u\n"; exit }' "$venv"/lib/python*/site-packages/*.dist-info/direct_url.json 2>/dev/null
}
step() { printf '\n== %s\n' "$1"; }
# A working row: runs the command, shows its output, PASS on exit 0.
checked() {
  local label=$1 s e status
  shift
  s=$(date +%s); "$@"; status=$?; e=$(date +%s)
  if [ "$status" -eq 0 ]; then works "$label ($((e - s))s)" PASS; else works "$label ($((e - s))s)" "FAIL (exit $status)"; fi
}
# bootstrap_look_up of the mach service $1 from this process: prints the
# kern_return_t, exits 0 when the service was reached (1100 is a sandbox
# refusal, 1102 a service this macOS does not have).
MACH_PROBE='import ctypes, sys
libc = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
port = ctypes.c_uint(0)
kr = libc.bootstrap_look_up(ctypes.c_uint.in_dll(libc, "bootstrap_port"), sys.argv[1].encode(), ctypes.byref(port))
print(kr)
sys.exit(0 if kr == 0 else 1)'

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
profile=$(ls "$state"/boundaries/*/boundary.sb 2>/dev/null | head -1)
cp "$profile" "$checkout/macos-boundary.sb"
head -12 "$profile"
grep -A12 '^(deny mach-lookup' "$profile"

step "gh and git push, with no GH_TOKEN in the caller"
# The rows that need a token need the host's own gh login: one that is not
# signed in, or whose token GitHub refuses, is the machine's state, not the
# product's, and those rows are SKIPped with that reason.
echo "the host's gh login (gh auth status, outside the boundary):"
gh auth status --hostname github.com 2>&1 | sed 's/^/    /'
no_login=
gh auth status --hostname github.com >/dev/null 2>&1 || no_login="host gh not signed in"
# No cache: the executor asks gh for its token on the host, outside Seatbelt.
rm -f "$state/gh-token"
if [ -n "$no_login" ]; then
  skip "gh api user (token read on the host)" "$no_login"
  skip "the executor wrote its gh-token cache" "$no_login"
  skip "gh api user (token from the cache)" "$no_login"
else
  login=$(r 'gh api user -q .login' 2>"$scratch/gh.err")
  if [ -n "$login" ]; then works "gh api user (token read on the host)" "PASS ($login)"; else works "gh api user (token read on the host)" FAIL; sed 's/^/    /' "$scratch/gh.err"; fi
  [ -s "$state/gh-token" ] && works "the executor wrote its gh-token cache" PASS || works "the executor wrote its gh-token cache" FAIL
  login=$(r 'gh api user -q .login' 2>"$scratch/gh.err")
  if [ -n "$login" ]; then works "gh api user (token from the cache)" "PASS ($login)"; else works "gh api user (token from the cache)" FAIL; sed 's/^/    /' "$scratch/gh.err"; fi
fi
helpers=$(r "git config --show-origin --get-regexp '^credential\..*helper\$'" 2>&1)
echo "git's credential helpers inside:"; printf '%s\n' "$helpers" | sed 's/^/    /'
# Which helpers a GitHub login runs inside (git's trace names every helper it
# starts): gh's, and never osxkeychain; with a login, gh's answers.
r 'printf "protocol=https\nhost=github.com\n\n" | GIT_TERMINAL_PROMPT=0 GIT_TRACE=1 git credential fill' > "$scratch/fill.out" 2> "$scratch/fill.trace"
grep "run_command" "$scratch/fill.trace" | sed 's/.*run_command: /    runs: /' | head -5
if grep -q 'auth git-credential' "$scratch/fill.trace" && ! grep -q osxkeychain "$scratch/fill.trace"; then
  works "a GitHub login runs gh's helper, no osxkeychain" PASS
else
  works "a GitHub login runs gh's helper, no osxkeychain" FAIL
fi
if [ -n "$no_login" ]; then
  skip "gh's helper answers a GitHub login" "$no_login"
else
  grep -q '^password=.' "$scratch/fill.out" && works "gh's helper answers a GitHub login" PASS || works "gh's helper answers a GitHub login" FAIL
fi
rm -f "$scratch/fill.out"
trustd_kr=$(r "/usr/bin/python3 -c '$MACH_PROBE' com.apple.trustd.agent" 2>/dev/null)
[ "$trustd_kr" = 0 ] && works "mach-lookup com.apple.trustd.agent (TLS)" PASS || works "mach-lookup com.apple.trustd.agent (TLS)" "FAIL (kr $trustd_kr)"
# A dry run sends nothing, but asks the remote for push access with the login.
push_url=${PUSH_URL:-$(git -C "$clone" remote get-url origin)}
case "$push_url" in
  https://github.com/*)
    if [ -n "$no_login" ]; then
      skip "git push --dry-run to $push_url" "$no_login"
    elif r "git push --dry-run '$push_url' HEAD:refs/heads/cawco-mac-check-$id" > "$scratch/push.out" 2>&1; then
      works "git push --dry-run to $push_url" PASS
    else
      works "git push --dry-run to $push_url" FAIL
      tail -5 "$scratch/push.out" | sed 's/^/    /'
    fi
    ;;
  *) works "git push --dry-run" "FAIL (no https GitHub remote to push to: $push_url; set PUSH_URL)" ;;
esac

step "home toolchains"
echo "tool trees the policy reads back beyond the PATH dirs:"
(cd "$checkout" && bun artifacts/srt-eval/home-toolchains.ts) | sed 's/^/    /'
if command -v uv >/dev/null; then
  r 'uv --version' > "$scratch/tool.out" 2>&1 && works "uv --version ($(command -v uv))" PASS || { works "uv --version ($(command -v uv))" FAIL; tail -3 "$scratch/tool.out" | sed 's/^/    /'; }
else
  works "uv --version" "FAIL (no uv on PATH)"
fi
for kind in '*/pipx/venvs/*' '*/uv/tools/*' '*/.local/share/claude/*'; do
  # The first command of the kind that is not installed editable. One that is
  # runs its code from a clone of its own, another repository, which the
  # boundary refuses by design; it is named, never run.
  cmd=
  while IFS=$'\t' read -r name real; do
    source_dir=$(editable_source "$real")
    if [ -n "$source_dir" ]; then
      echo "$name: installed editable, its code in $source_dir (another repository: refused by design, not run)"
    elif [ -z "$cmd" ]; then
      cmd=$name
    fi
  done < <(landing_cmds "$kind")
  if [ -z "$cmd" ]; then
    echo "no command on a home PATH dir lands in $kind but editable ones"
    [ "$kind" = '*/pipx/venvs/*' ] && works "a pipx command" "FAIL (none installed but editable ones)"
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
# The keychain through securityd, which reads the login keychain past the file
# deny. "host:" is the same ask outside the boundary, for comparison; over ssh
# the login keychain may be locked, so the mach rows below are the proof that
# holds whatever its state.
gh_ask='printf "protocol=https\nhost=github.com\n\n" | git credential-osxkeychain get'
host_has=$(cd "$clone" && /bin/bash -c "$gh_ask" 2>/dev/null | grep -c '^password=.')
r "$gh_ask" > "$scratch/kc.out" 2>&1; kc=$?
if [ "$kc" -ne 0 ] || ! grep -q '^password=.' "$scratch/kc.out"; then row "git credential-osxkeychain get (host: $host_has password)" BLOCKED; else row "git credential-osxkeychain get (host: $host_has password)" OPEN; fi
for kind in generic internet; do
  host_found=no; security "find-$kind-password" -s github.com >/dev/null 2>&1 && host_found=yes
  r "security find-$kind-password -s github.com" > "$scratch/kc.out" 2>&1; kc=$?
  if [ "$kc" -ne 0 ] || [ ! -s "$scratch/kc.out" ]; then row "security find-$kind-password -s github.com (host found: $host_found)" BLOCKED; else row "security find-$kind-password -s github.com (host found: $host_found)" OPEN; sed 's/^/    /' "$scratch/kc.out" | head -3; fi
done
# Every keychain service the profile denies, looked up from inside.
for service in $(sed -n '/^(deny mach-lookup/,/^)/s/.*(global-name "\([^"]*\)").*/\1/p' "$profile"); do
  host_kr=$(/usr/bin/python3 -c "$MACH_PROBE" "$service" 2>/dev/null)
  inside_kr=$(r "/usr/bin/python3 -c '$MACH_PROBE' '$service'" 2>/dev/null)
  if [ "$inside_kr" = 0 ]; then row "mach-lookup $service (host $host_kr, inside $inside_kr)" OPEN; else row "mach-lookup $service (host $host_kr, inside $inside_kr)" BLOCKED; fi
done
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
checked "git commit in the clone" r 'set -o pipefail; date +%s > srt-mac-probe.txt && git add -A && git commit -qm "srt mac probe" && git log --oneline -1'
if [ -n "$swift_package" ]; then
  checked "swift build ($swift_package)" r "set -o pipefail; cd '$swift_package' && swift build 2>&1 | tail -3"
fi
if [ -n "$xcode_dir" ]; then
  if [ "$xcode_scheme" = auto ]; then
    xcode_scheme=$(r "cd '$xcode_dir' && xcodebuild -list -json 2>/dev/null" | perl -MJSON::PP -0777 -ne 'my $j = eval { decode_json($_) } or exit; my $s = ($j->{workspace} // $j->{project} // {})->{schemes} // []; print $s->[0] // ""')
    echo "xcodebuild scheme in $xcode_dir: ${xcode_scheme:-none found}"
  fi
  checked "xcodebuild simulator build ($xcode_dir, ${xcode_scheme:-no scheme})" r "set -o pipefail; cd '$xcode_dir' && xcodebuild -scheme '$xcode_scheme' -destination 'generic/platform=iOS Simulator' build 2>&1 | tail -3"
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
checked "Playwright Chromium loads a page" r 'set -o pipefail; mkdir -p "$TMPDIR/pw" && cd "$TMPDIR/pw" && { [ -f package.json ] || echo "{}" > package.json; } && bun add playwright-core@1.63.0 >/dev/null 2>&1 && cp "$TMPDIR/pw-check.mjs" . && bun pw-check.mjs 2>&1 | tail -3'

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
[ "$skipped" -eq 0 ] || echo "$skipped working row(s) SKIPped for this machine's state (see each row's reason)"
status=0; [ "$open" -eq 0 ] && [ "$fail" -eq 0 ] || status=1
echo "EXIT $status"
exit "$status"

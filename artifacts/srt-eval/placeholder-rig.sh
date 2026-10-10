#!/bin/bash
# Clone-side deny stand-ins, proved on a rig (boundary-host.ts `standIn`,
# packages/agent/src/stand-ins.ts, boundary.ts `rearmHooks`, `ensure`,
# `restartStubbed`, `closeBoundary`):
#
#   bash artifacts/srt-eval/placeholder-rig.sh
#
# Run it from this checkout, on a Linux host, OUTSIDE any workspace boundary:
# the rig needs user namespaces, which a boundary refuses. It touches no live
# agent, hub or sessiond: its own sessiond, HOME and XDG_RUNTIME_DIR live in
# one scratch dir under $HOME, removed at the end. It runs the host's own
# `opencode` (on PATH) as a headless server, one per check, since a server
# keeps a directory's failed instance.
#
# 1. Before any stand-ins (BASE_COMMIT, default 71c00e89): a workspace's
#    sandbox leaves srt's empty read-only mount points at the harness paths,
#    and the host's opencode answers 500 for the clone (ENOTDIR).
# 2. This checkout's start-up pass over that workspace, its sandbox running a
#    `sleep`: the file mount points hold valid config on the host, same
#    inode, and stay unwritable inside; `.opencode`, a file the sandbox
#    holds, stays, and no boundary starts beside it (its form is older).
#    Once the sleep is gone the boundary is replaced, `.opencode` is a dir,
#    and the host's opencode answers 200.
# 3. A fresh workspace of this checkout: each stand-in in its form, `git
#    status` empty, every write to them refused inside, opencode 200, and no
#    srt `/dev/null` mount left in the clone.
# 4. closeBoundary with the clone kept: no stand-in left, `git status` empty.
# 5. info/exclude: a clone as the fixed-names build left it (those names,
#    OpenCode's rewrites of its `{}` stand-ins, a `.opencode` OpenCode
#    filled) and the user's own `.mcp.json` and `.vscode/`: once the agent
#    lists the stand-ins, CawCo's block names only its own, the fixed names
#    are gone, and git status shows the user's two files alone. Then the
#    archive.
#
# `.gitmodules` rows: before the stand-ins, srt's `/dev/null` sits on a nodev
# mount, which no one can open, so `git fetch` and `git submodule status`
# warn "unable to access .gitmodules: Permission denied"; with a readable
# empty stand-in they are quiet, and writing it is still refused.
#
# CawCo's block in info/exclude is printed at each step.
#
# Every command run through the executor prints its exit status, so one that
# prints nothing cannot read as a pass.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd -P)
base=${BASE_COMMIT:-71c00e89}
opencode=$(command -v opencode)
rig=$(mktemp -d "$HOME/.prig.XXXXXX")
say() { printf '\n== %s\n' "$*"; }
field() { { grep -o "\"$1\":[^,}]*" "$2" || true; } | head -1 | cut -d: -f2- | tr -d '"'; }
waitfor() { # seconds, then a test command: polls once a second
  local tries=$1
  shift
  until "$@"; do
    tries=$((tries - 1))
    [ "$tries" -gt 0 ] || return 1
    sleep 1
  done
}
# A command through the workspace's executor, in the clone, then its exit status.
run() {
  local status=0
  (cd "$clone" && "$state/exec" "$1") 2>&1 || status=$?
  echo "[exec exit $status]"
}
# Inside the sandbox: reading .gitmodules, `git fetch` and `git submodule
# status`, which read it, and writing it. EXPECT is "warns" or "quiet".
gitmodules_rows() { # EXPECT
  local out=$rig/gitmodules-$1.out
  run 'stat -c "%F mode=%a" .gitmodules; cat .gitmodules > /dev/null; echo "read .gitmodules: $?"; git fetch -q origin; echo "git fetch: $?"; git submodule status; echo "git submodule status: $?"' | tee "$out"
  if grep -q 'warning: unable to access' "$out"; then
    [ "$1" = warns ] && echo "REPRODUCED: git warns it cannot read .gitmodules" || echo "FAILED: git warns it cannot read .gitmodules"
  else
    [ "$1" = quiet ] && echo "no warning: .gitmodules reads inside" || echo "UNEXPECTED: no warning before the stand-ins"
  fi
  run 'echo "[submodule]" > .gitmodules; echo "write .gitmodules: $?"'
}
# The clone's info/exclude, CawCo's block marked.
exclude_of() { sed 's/^/    /' "$clone/.git/info/exclude"; }
# Each harness path in the clone, as the host sees it: kind, size, mode, inode, content.
paths() {
  local p
  for p in .opencode opencode.json opencode.jsonc .mcp.json .claude .claude/settings.json \
    .claude/settings.local.json .claude/hooks .claude/commands .claude/agents; do
    if [ -e "$clone/$p" ]; then
      printf '  %-28s %s' "$p" "$(stat -c '%F size=%s mode=%a inode=%i' "$clone/$p")"
      [ -f "$clone/$p" ] && [ -s "$clone/$p" ] && printf '  %s' "$(tr -d '\n' < "$clone/$p")"
      echo
    else
      printf '  %-28s absent\n' "$p"
    fi
  done
}
# The host's opencode, headless, loading DIR: its project and its config.
oc_check() { # NAME DIR PORT
  local log=$rig/oc-$1.log pid
  (cd "$rig" && exec "$opencode" serve --hostname 127.0.0.1 --port "$3" --print-logs --log-level INFO) > "$log" 2>&1 &
  pid=$!
  curl -s --retry 40 --retry-connrefused --retry-delay 1 -o /dev/null "http://127.0.0.1:$3/path" || true
  local ep
  for ep in project/current config; do
    curl -s -m 60 -o "$rig/oc-$1.${ep//\//_}.json" \
      -w "  opencode GET /$ep?directory=$2 -> HTTP %{http_code}\n" \
      "http://127.0.0.1:$3/$ep?directory=$2" || echo "  opencode GET /$ep: no answer"
  done
  echo "  /config: $(head -c 300 "$rig/oc-$1.config.json")"
  grep -m1 -o "ENOTDIR[^\"]*" "$log" | sed 's/^/  log: /' || echo "  log: no ENOTDIR"
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}
inner_of() { cut -d' ' -f2 "$state"/boundaries/*/sandbox 2>/dev/null | head -1; }
# What the running sandbox mounts at each harness path: the bind's source root (/null for srt's mount point).
mounts() {
  local inner
  inner=$(inner_of)
  echo "  sandbox init $inner mounts at the harness paths (root -> mount point):"
  awk -v c="$clone" '$5 ~ ("^" c "/(\\.opencode|opencode\\.jsonc?|\\.mcp\\.json|\\.claude)") { print "   ", $4, "->", $5 }' "/proc/$inner/mountinfo"
}

say "worktree of $base (before the fix); this checkout $(git -C "$here" rev-parse --short HEAD); host opencode $("$opencode" --version)"
git -C "$here" worktree add -q --detach "$rig/base" "$base"
(cd "$rig/base" && bun install --frozen-lockfile > /dev/null)
cat > "$rig/base/rig-create.ts" << 'EOF'
import { createWorkspace } from "./packages/agent/src/workspace";
console.log(JSON.stringify(await createWorkspace(process.argv[2], process.argv[3])));
process.exit(0);
EOF

unset CAWCO_HUB_URL CAWCO_MACHINE_ID CAWCO_SESSION_CREDENTIAL INVOCATION_ID \
  CAWCO_SERVICE_MODE CLAUDE_CONFIG_DIR XPC_SERVICE_NAME
export IS_SANDBOX=1 HOME=$rig/home XDG_RUNTIME_DIR=$rig/run \
  CAWCO_SESSIOND_ENDPOINT=$rig/sessiond.sock OPENCODE_DISABLE_AUTOUPDATE=1 \
  GIT_AUTHOR_NAME=rig GIT_AUTHOR_EMAIL=rig@rig GIT_COMMITTER_NAME=rig GIT_COMMITTER_EMAIL=rig@rig
mkdir -p "$HOME" "$rig/src"
mkdir -m 700 "$XDG_RUNTIME_DIR"
git -C "$rig/src" init -q -b main
printf 'rig\n' > "$rig/src/README"
git -C "$rig/src" add README
git -C "$rig/src" commit -q -m rig
git init -q --bare -b main "$rig/origin.git"
git -C "$rig/src" remote add origin "$rig/origin.git"
git -C "$rig/src" push -q origin main

cleanup() {
  set +e
  if [ -n "${agent:-}" ]; then kill "$agent" 2>/dev/null; fi
  for one in "${id1:-}:${clone1:-}" "${id2:-}:${clone2:-}"; do
    if [ "$one" != ":" ]; then
      (cd "$here" && bun artifacts/srt-eval/rig-workspace.ts archive "${one%%:*}" "${one#*:}" > /dev/null 2>&1)
    fi
  done
  for proc in /proc/[0-9]*; do
    if tr '\0' ' ' 2> /dev/null < "$proc/cmdline" | grep -q sessiond &&
      tr '\0' '\n' 2> /dev/null < "$proc/environ" | grep -qx "CAWCO_SESSIOND_ENDPOINT=$CAWCO_SESSIOND_ENDPOINT"; then
      kill "${proc#/proc/}"
    fi
  done
  git -C "$here" worktree remove --force "$rig/base"
  rm -rf "$rig"
}
trap cleanup EXIT

(cd "$here" && bun -e 'import { ensureSessiond } from "./packages/agent/src/sessiond-client"; await ensureSessiond(process.env.CAWCO_SESSIOND_ENDPOINT); process.exit(0)')

say "1. before the fix ($base): a workspace and its running sandbox"
id1=$(cat /proc/sys/kernel/random/uuid)
(cd "$rig/base" && bun rig-create.ts "$rig/src" "$id1")
state=$HOME/.cawco/workspaces/$id1
clone1=$HOME/.worktrees/src-${id1:0:8}
clone=$clone1
echo "the clone's harness paths, on the host:"
paths
echo "git status --porcelain (host): [$(git -C "$clone" status --porcelain | tr '\n' ' ')]"
echo "the host's opencode on the clone:"
oc_check before "$clone" 47591
echo ".gitmodules inside, srt's /dev/null on a nodev mount:"
gitmodules_rows warns
echo "info/exclude, the fixed names:"
exclude_of

say "2. this checkout's start-up pass, a sleep running in the sandbox"
run 'sleep 6062 > /dev/null 2>&1 & disown'
job=$(pgrep -fx 'sleep 6062')
old_pid=$(field pid "$state/boundary.json")
inode_before=$(stat -c %i "$clone/opencode.json")
(cd "$here" && exec bun artifacts/srt-eval/rig-rearm.ts 90) > "$rig/rearm.log" 2>&1 &
agent=$!
written() { grep -q 'boundary hooks written for' "$rig/rearm.log"; }
waitfor 60 written || echo "FAILED: the start-up pass did not finish within 60 s"
sleep 6
echo "after the pass, the sleep still running (boundary $(field pid "$state/boundary.json"), was $old_pid):"
if ls "$state"/retiring-*.json > /dev/null 2>&1; then
  echo "FAILED: a boundary started beside the one holding .opencode"
else
  echo "no boundary started beside it"
fi
paths
[ "$(stat -c %i "$clone/opencode.json")" = "$inode_before" ] &&
  echo "opencode.json keeps its inode $inode_before: the sandbox's bind on it stays" ||
  echo "FAILED: opencode.json has a new inode"
mounts
echo "inside the running sandbox, each still refused:"
run 'echo x > opencode.json; echo "write opencode.json: $?"; cat opencode.json | wc -c | sed "s/^/opencode.json bytes seen inside: /"'
run 'echo {} > .mcp.json; echo "write .mcp.json: $?"'
run 'mkdir .opencode 2>&1; rm -f .opencode 2>&1; echo "replace .opencode: $?"'
run 'mkdir .claude/hooks 2>&1; echo "mkdir .claude/hooks: $?"; ls -A .claude | wc -l | sed "s/^/entries in .claude seen inside: /"'
kill "$job"
replaced() { grep -q 'is replaced by' "$rig/rearm.log"; }
if waitfor 30 replaced; then
  echo "once the sleep is gone: $(grep 'is replaced by' "$rig/rearm.log")"
else
  echo "FAILED: the boundary was not replaced within 30 s"
fi
cat "$rig/rearm.log"
echo "the clone's harness paths now:"
paths
mounts
echo "git status --porcelain (host): [$(git -C "$clone" status --porcelain | tr '\n' ' ')]"
echo "info/exclude after the pass: the fixed names gone, CawCo's block listing its stand-ins:"
exclude_of
grep -qx '.vscode' "$clone/.git/info/exclude" && echo "FAILED: a fixed name is still there" || echo "no fixed name left"
echo "inside the new sandbox:"
run 'mkdir .opencode/x 2>&1; echo "mkdir .opencode/x: $?"; echo x > opencode.json; echo "write opencode.json: $?"; git status --porcelain | wc -l | sed "s/^/git status lines inside: /"'
echo "the host's opencode on the clone, a fresh server:"
oc_check after "$clone" 47592
kill "$agent" 2>/dev/null || true
agent=

say "3. a fresh workspace of this checkout"
id2=$(cat /proc/sys/kernel/random/uuid)
(cd "$here" && bun artifacts/srt-eval/rig-workspace.ts create "$rig/src" "$id2")
state=$HOME/.cawco/workspaces/$id2
clone2=$HOME/.worktrees/src-${id2:0:8}
clone=$clone2
echo "the clone's harness paths, the sandbox running:"
paths
mounts
echo "git status --porcelain (host): [$(git -C "$clone" status --porcelain | tr '\n' ' ')]"
echo "info/exclude, one anchored line per stand-in in CawCo's block:"
exclude_of
echo "inside the sandbox, each refused:"
run 'echo x > opencode.json; echo "echo x > opencode.json: $?"'
run 'mkdir .opencode/x; echo "mkdir .opencode/x: $?"'
run 'echo {} > .mcp.json; echo "echo {} > .mcp.json: $?"'
run 'echo x > .claude/settings.json; echo "write .claude/settings.json: $?"; echo x > .claude/settings.local.json; echo "write .claude/settings.local.json: $?"'
run 'touch .claude/hooks/x .claude/commands/x .claude/agents/x; echo "touch in .claude/{hooks,commands,agents}: $?"'
run 'rm -rf .opencode opencode.jsonc; echo "rm .opencode opencode.jsonc: $?"'
run 'git add -A && git status --porcelain | wc -l | sed "s/^/git add -A, then status lines: /"'
echo ".gitmodules inside, its stand-in a readable empty file:"
gitmodules_rows quiet
echo "the host's opencode on the clone:"
oc_check fresh "$clone" 47593
echo "srt mount points left in the clone (empty, no write bits), then srt's /dev/null mounts in it (none expected):"
find "$clone" -maxdepth 3 -type f -size 0 ! -perm /222 -not -path '*/node_modules/*' -printf '  left: %P\n'
awk -v c="$clone" '$4 == "/null" && index($5, c) == 1 { print "  /dev/null ->", $5 }' "/proc/$(inner_of)/mountinfo"
echo "  (end)"

say "4. closeBoundary, the clone kept"
(cd "$here" && bun -e "import { closeBoundary } from './packages/agent/src/boundary'; await closeBoundary({ id: '$id2', path: '$clone2' }); process.exit(0)")
echo "the clone's harness paths after it:"
paths
echo "anything else at the clone's root: $(ls -A "$clone" | tr '\n' ' ')"
echo "git status --porcelain (host): [$(git -C "$clone" status --porcelain | tr '\n' ' ')]"
echo "info/exclude after it (no CawCo block left):"
exclude_of

say "5. info/exclude: a live clone of the fixed-names build migrates, a user's own files show"
# As a clone of 4fbde79e stands: the fixed names, `{}` stand-ins OpenCode
# rewrote with its $schema, a `.opencode` OpenCode filled; and the user's own
# untracked `.mcp.json` and `.vscode/settings.json`.
printf '.gitconfig\n.gitmodules\n.mcp.json\n.vscode\n.idea\n/opencode.json\n/opencode.jsonc\n/.opencode\n' >> "$clone/.git/info/exclude"
printf '{\n  "$schema": "https://opencode.ai/config.json",}\n' > "$clone/opencode.json"
printf '{}\n' > "$clone/opencode.jsonc"
mkdir -p "$clone/.opencode" "$clone/.vscode"
printf 'node_modules\n' > "$clone/.opencode/.gitignore"
printf '{"dependencies":{}}\n' > "$clone/.opencode/package.json"
printf '{"mcpServers":{"mine":{"command":"x"}}}\n' > "$clone/.mcp.json"
printf '{"editor.tabSize":2}\n' > "$clone/.vscode/settings.json"
echo "git status before, the fixed names hiding the user's files: [$(git -C "$clone" status --porcelain | tr '\n' ' ')]"
(cd "$here" && bun -e "import { listStandIns } from './packages/agent/src/stand-ins'; await listStandIns({ id: '$id2', path: '$clone2' }, false); process.exit(0)")
echo "info/exclude after the agent lists the stand-ins:"
exclude_of
status=$(git -C "$clone" status --porcelain | tr '\n' ' ')
echo "git status after: [$status]"
[ "$status" = "?? .mcp.json ?? .vscode/ " ] && echo "only the user's own files show" || echo "FAILED: expected the user's .mcp.json and .vscode/ alone"
(cd "$here" && bun artifacts/srt-eval/rig-workspace.ts archive "$id2" "$clone2")
[ -e "$clone2" ] && echo "FAILED: the clone is still there" || echo "archived: the clone is gone"
id2=

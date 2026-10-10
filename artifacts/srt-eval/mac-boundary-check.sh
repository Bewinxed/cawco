#!/bin/bash
# The macOS boundary's checks for one commit, driven from obelisk. Run from an
# UNSANDBOXED shell on obelisk, in a checkout that has the commit:
#
#   bash artifacts/srt-eval/mac-boundary-check.sh [COMMIT]   # default HEAD
#
# Prints the tool trees under home the workspace policy reads back on obelisk
# (for this shell's PATH), ships COMMIT to the Mac as a tree (`git archive`
# over `ssh mac`) into ~/.worktrees/cawco-mac-check-<sha>, installs it, and runs
# run-mac-checks.sh there against ~/anbar-ios-fix (which has an origin;
# swift build and a simulator xcodebuild of its AnbarKit package), with
# GH_TOKEN unset in the caller. That script ends with "every escape row
# BLOCKED" and "EXIT 0" when every escape row is BLOCKED and every working row
# passes. The tree on the Mac is removed afterwards.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
checkout=$(cd "$here/../.." && pwd)
commit=$(git -C "$checkout" rev-parse "${1:-HEAD}^{commit}")
dir=.worktrees/cawco-mac-check-${commit:0:12}

echo "== obelisk: tool trees the policy reads back beyond the PATH dirs"
(cd "$checkout" && bun artifacts/srt-eval/home-toolchains.ts) | sed 's/^/    /'

echo
echo "== the Mac: $commit into ~/$dir"
git -C "$checkout" archive --format=tar "$commit" |
  ssh mac "rm -rf ~/$dir && mkdir -p ~/$dir && tar -x -C ~/$dir"
set +e
ssh mac "env -u GH_TOKEN -u GITHUB_TOKEN bash -lc 'cd ~/$dir && export PATH=\$HOME/.local/bin:\$HOME/.bun/bin:/opt/homebrew/bin:\$PATH && bun install --frozen-lockfile >/dev/null && bash artifacts/srt-eval/run-mac-checks.sh ~/anbar-ios-fix ~/firecrawl/.env apps/ios/AnbarKit apps/ios/AnbarKit auto'"
status=$?
ssh mac "rm -rf ~/$dir"
exit "$status"

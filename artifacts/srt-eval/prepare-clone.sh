#!/bin/sh
# Prototype: what CawCo writes into a workspace clone before its boundary starts.
# srt protects files that do not exist yet by mounting a read-only placeholder
# at their name for as long as the sandbox runs (README, "Mandatory Deny
# Paths"); inside the sandbox they show as untracked files and make
# `git add -A` fail ("can only add regular files"). The clone's own
# info/exclude keeps them out of git, as checkout-exclude.ts does for other
# files CawCo puts in a checkout. srt's own names are unanchored (a command
# run in a subdirectory gets placeholders there); the harness config
# srt-config.ts denies is anchored at the clone's root. Each line is added once.
# Names: srt sandbox-utils.ts DANGEROUS_FILES and getDangerousDirectories().
set -eu
clone=$1
exclude=$(git -C "$clone" rev-parse --path-format=absolute --git-path info/exclude)
mkdir -p "$(dirname "$exclude")"
touch "$exclude"
for name in .gitconfig .gitmodules .bashrc .bash_profile .zshrc .zprofile .profile .ripgreprc .mcp.json .vscode .idea .claude/commands .claude/agents \
  /.claude/settings.json /.claude/settings.local.json /opencode.json /opencode.jsonc /.opencode; do
  grep -qxF "$name" "$exclude" || echo "$name" >> "$exclude"
done

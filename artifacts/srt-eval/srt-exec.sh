#!/bin/bash
# Prototype of a workspace executor on srt, the shape boundary.ts linuxExec/darwinExec
# take today: srt-exec.sh SETTINGS [--cwd-out FILE] COMMAND
# Runs COMMAND in the caller's directory under the workspace's srt settings, and
# writes the directory COMMAND ended in to FILE, so a session's cd follows.
set -u
settings=$1
shift
cwd_out=
if [ "${1:-}" = --cwd-out ]; then cwd_out=$2; shift 2; fi
srt=${SRT:-srt}
# gh's keyring is outside the sandbox: read the token on the host side, as today.
if [ -z "${GH_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  token=$(gh auth token 2>/dev/null) && [ -n "$token" ] && GH_TOKEN=$token && export GH_TOKEN
fi
# The scratch dir is the command's TMPDIR (srt reads CLAUDE_CODE_TMPDIR for it).
export CLAUDE_CODE_TMPDIR=${SCRATCH:?SCRATCH is the workspace scratch dir}
exec "$srt" --settings "$settings" -c "eval $(printf '%q' "$1"); __s=\$?; [ -z $(printf '%q' "$cwd_out") ] || pwd -P > $(printf '%q' "$cwd_out"); exit \$__s"

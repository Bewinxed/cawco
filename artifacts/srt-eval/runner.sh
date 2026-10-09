#!/bin/bash
# Prototype: one workspace's runner, started once per workspace as
#   srt --settings <ws>.srt.json -c 'runner.sh <fifo>'
# and held by sessiond, as boundary.ts holds its anchor (Linux) and runner (macOS)
# today. Every command of the workspace runs inside this one srt sandbox: one
# network namespace (a dev server one command starts is reachable from the
# next), one pid namespace on Linux, one proxy, and background processes outlive
# the command that started them. This is boundary.ts RUNNER, unchanged in shape.
fifo=$1
# srt's own plumbing for this sandbox (proxy, TMPDIR, git safe.directory):
# re-applied over each request's environment so a caller's env cannot drop it.
srt_env=$(export -p | grep -E '^declare -x (HTTPS?_PROXY|https?_proxy|ALL_PROXY|all_proxy|NO_PROXY|no_proxy|GIT_SSH_COMMAND|SANDBOX_RUNTIME|TMPDIR|JAVA_TOOL_OPTIONS|GIT_CONFIG_[A-Z0-9_]+|DOCKER_HTTP_PROXY|DOCKER_HTTPS_PROXY|CLOUDSDK_PROXY_[A-Z_]+|GRPC_PROXY|grpc_proxy|RSYNC_PROXY|FTP_PROXY|ftp_proxy|CLAUDE_CODE_HOST_[A-Z_]+)=')
export SRT_RUNNER_ENV=$srt_env
echo cawco-boundary-ready
while :; do
  while IFS= read -r req; do
    (
      /usr/bin/perl -e 'setpgrp(0, 0); exec @ARGV' /bin/bash --norc --noprofile -c '. "$1/env" >/dev/null 2>&1; eval "$SRT_RUNNER_ENV"; cd "$(cat "$1/cwd")" || exit 1; eval "$(cat "$1/cmd")"; status=$?; pwd -P > "$1/cwd-out"; exit $status' cawco "$req" > "$req/out" 2> "$req/err" < /dev/null &
      echo $! > "$req/pid"
      wait $!
      echo $? > "$req/status"
    ) &
  done < "$fifo"
done

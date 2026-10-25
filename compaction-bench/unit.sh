#!/bin/bash
# unit.sh <unit> <session-acct> <summarizer-acct> <judge-acct> <script> [args...]: one bench step as a host systemd
# user unit, from the bench's own directory. The accounts are ids under ~/.cawco/accounts (a step that needs one
# of them only may pass anything for the others).
set -e
unit=$1 s=$2 z=$3 j=$4; shift 4
A=$HOME/.cawco/accounts
cd "$(dirname "$(readlink -f "$0")")"
systemctl --user reset-failed "$unit" 2>/dev/null || true
exec systemd-run --user --same-dir --unit "$unit" -E PATH="$PATH" -E CLAUDE_CONFIG_DIR=$A/$s/claude \
  -E BENCH_SUMMARIZER_CONFIG_DIR=$A/$z/claude -E BENCH_JUDGE_CONFIG_DIR=$A/$j/claude \
  -E OPENCODE_ACCOUNT_DIR=$A/ca27819a-59b3-4585-9c5a-61cea4214dd7 -E PI_ACCOUNT_DIR=$A/257c55fd-16e8-451a-84f8-a03be9eb59d1 \
  python3 -I "$@"

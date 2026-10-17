#!/usr/bin/env bash
# The infinite-chat measurement on Claude: every builder, answerer and judge call is
# `claude -p --model claude-sonnet-5-5 --output-format json`, no tools, safe mode.
#
#   ./run-claude.sh plan    what remains, re-estimated from out/ledger.jsonl, for every scope; spends nothing
#   ./run-claude.sh probe [--answer]   3 real merge calls (5 with --answer) testing the tree prompt; out/probe/ only
#   ./run-claude.sh run --scope decision   prints the plan, then runs; resumable (finished results are skipped)
#   ./run-claude.sh run --phases answer,judge,report    a subset of phases
#   ./run-claude.sh report --scope decision   rewrites out/report.md from what is on disk
# Scopes (which runs get answered and judged): full, end, decision, minimal, incremental; default full.
#
# The tree filed as the chat goes (scope incremental): design A, the agent files it in its own resumed
# session; design B, the hub files each turn against a cached view. Within the $40 budget:
#   ./run-claude.sh plan --scope incremental --a-turns 89   prints the estimate; spends nothing
#   ./run-claude.sh run --scope incremental --a-turns 89    B built over the whole chat, answered and judged
#                                                           beside the batch tree and cc-real+C-filed; A built
#                                                           over the first 89 turns, for its cost only
# run exits 2 without a call when what this measurement already spent plus the plan is over EVAL_BUDGET
# (default 40), and no call starts once the reported spend reaches it (exit 75; rerun the same command).
#
# Writes everything under infinite-chat-eval/out/ (EVAL_OUT overrides):
#   build/   every summary generation, 2b, the tree (nodes.jsonl, pending.jsonl, view.txt, stats.json),
#            inc-A/ and inc-B/ (the incremental trees, with state.json for a resume)
#   answers/<run>/<probe>.json   judge/<scope>/<group>/<probe>-<n>.json   probe/
#   ledger.jsonl (one line per call attempt: tokens, cost, models), run.log, plan.txt, report.md
# At most 4 calls at once (EVAL_PARALLEL lowers it). Uses the `claude` on PATH, or CLAUDE_BIN,
# with its own login (CLAUDE_CONFIG_DIR picks the account, as for any claude run).
# Exit: 0 complete; 75 stopped on a login, usage or budget limit (rerun to resume); 1 incomplete; 2 not run (over budget).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${CLAUDE_BIN:-}" ] && ! command -v claude >/dev/null 2>&1; then
  if [ -x "$HOME/.local/bin/claude" ]; then export CLAUDE_BIN="$HOME/.local/bin/claude"
  else echo "run-claude.sh: no claude on PATH; set CLAUDE_BIN" >&2; exit 1; fi
fi
exec python3 -I "$here/infinite-chat-eval/pipeline.py" "${@:-plan}"

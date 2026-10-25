# compaction-bench

Replays real CawCo cut points through each compaction arm, continues the real next turn in a sandbox where nothing real
is touched, and writes the decision table of the design's Part B (`out/report.md`). The design is
`fable-design.md` (Part B is the spec; §A2 and §A7 define what the summary arms produce).

Everything here is stdlib Python 3 plus `bun` for the product's own TypeScript. Nothing is installed.

## Layout

```
compaction-bench/              beside ../infinite-chat-eval (imported, never copied)
  cuts.py        cut points from cawco.db + transcripts → cuts.json (--fixture: the synthetic one)
  sandbox.py     the envelope per (cut, arm, run); the probe that proves it; transcript placement; one Claude Code turn
  standin_mcp.py stdio MCP server "cawco": every tool the hub lists, each call recorded, nothing sent
  arms.py        A0–A7g: how state X is made; one whole run
  llm.py         a no-tool model call (claude_call.py's command, env, slots, ledger) and the A7 drivers
  run.py         the driver (runs only; --dry --fixture runs the whole pipeline)
  pace.py        the real run on a shared host: one run.py per (cut, arm) as a systemd unit, started when the load
                 and an account's 5-hour window both have room (the hub's live readings); every launch in pace.jsonl
  judge.py       anchors, engine readings, pairwise both orders, 0–5, probes; Opus 5.5 and Sonnet 5.5
  cost.py        each request priced on its own by the product; C_make, C_between, C_turn1, C_horizon; window %
  e5.py          warm-compaction window cost from the DB (no model calls)
  arith.py       the cost of whole, native /compact and a Sonnet summary per situation and band, by arithmetic
  report.py      out/report.md, and with --paper the Results section of PAPER.md
  PAPER.md       the paper draft: method, related work, the sandbox, threats, decisions log; Results from report.py
  tools_dump.py  the stand-in's tool list from `cawco tools`
  sim.py         the dry run's model
  harness/cockpit.ts            the product's pricing, forecast, sentRow and COMPACT_FOCUS, from --cockpit-root
  harness/opencode_summarize.ts A7d: OpenCode on an opencode-go account, as the agent runs it
  harness/pi_summarize.ts       A7g: pi on an openai-codex account, as the agent runs it
  fixtures/      make_fixture.py and what it writes: session.jsonl (60 turns, two compact_boundary records),
                 continued-a/b.jsonl, cawco.sql (the synthetic DB; *.db is gitignored, so it is built at run time),
                 tools.json
```

`cuts.py` and `e5.py` read every transcript under the account dirs (13.5 GB of JSONL on the first real run). A file is
parsed only when its bytes hold a `compact_boundary`, or when a candidate names it, and parsed files are kept for the
last 8 only: keeping every parsed file took 25.5 GiB resident on the first real draw (2.3 GB peak since).

`methods.py` and `pipeline.py` read the 13-hour chat's data at import (`data/messages.jsonl`, `data/probes.json`).
The bench never uses that chat, so `common.eval_modules` answers those two reads with a one-line stand-in. Every
other read (prompts/cc_compact.txt, prompts/unii_system.txt) is the real file. `EVAL_OUT` is set to the bench's out
dir before `claude_call` is imported, so every call is a row of `out/ledger.jsonl`.

## The arms

| arm | state X | runs on |
|---|---|---|
| A0 | the pre-cut transcript resumed whole (`--resume` of the placed copy) | every cut (chained: at the second cut) |
| A1 | resumed whole, then `/compact <focus>` on the session's model; no new manual `compact_boundary` stops the run | every cut |
| A2 | CawCo summary, Sonnet 5.5, today's extract (`methods.cawco_extract` → `cawco_prompt`) | every cut |
| A3 | as A2 on Haiku 5.5 | non-chained |
| A4 | CawCo shape, Sonnet, full-clipped input (`methods.render_conv` of the part before the tail) | non-chained |
| A5 | Claude Code's compaction prompt (`methods.cc_input`), Sonnet, A4's input | non-chained |
| A6 | Factory anchored merge (`methods.factory_prompt`), Sonnet | chained only |
| A7d | A4's prompt written by OpenCode, `opencode-go/deepseek-v4-pro` | non-chained |
| A7g | A4's prompt written by pi, `openai-codex/<--gpt-model>` | non-chained |

`<focus>` is `COMPACT_FOCUS` from the cockpit's `packages/hub/src/open-items.ts` without its last sentence (§A1).
Every summary arm opens a fresh conversation on the session's own model. The opening is `methods.cawco_opening`:
header, summary, artifact index, last turns. Its header names the sandbox's directory, so the agent works there and
not in the real repo. The opening is a turn of its own, as in the product, and the real next message is the turn
after it. Only the summary differs across A2–A7. Chained cuts run A0, A1, A2 and A6. Between the two cuts the real
user messages are replayed onto the arm's own session (teacher forcing).

**A7d (OpenCode).** The driver does what the agent's `OpencodeHarness` does for an account. It starts its own
`opencode serve --hostname=127.0.0.1 --port=<p>` on scratch XDG data, config and state homes, with
`OPENCODE_CONFIG_CONTENT` denying every tool. It puts the account's credential on that server the way
`#putCredential` does: `readHeld` and `opencodeCredentialOf` from the agent's `provider-accounts.ts`,
`POST /api/credential` with `activate`, then `POST /api/credential/<id>/activate`. It sends the prompt with
`opencode run --server <url> -m <model> --format json` on stdin, and reads the answer, tokens and cost back from
`GET /api/session/<id>/message`. An opencode-go credential is a key, so it is never refreshed and nothing is written
back to the account. The command lines, with the credential as a variable:

```
opencode serve --hostname=127.0.0.1 --port=<p>   # env: XDG_{DATA,CONFIG,STATE}_HOME=<run>/make1.opencode/{data,config,state} OPENCODE_DISABLE_AUTOUPDATE=1 OPENCODE_SERVER_PASSWORD=<random> OPENCODE_CONFIG_CONTENT=<deny every tool>
POST http://127.0.0.1:<p>/api/credential  { integrationID, value } = opencodeCredentialOf(readHeld(basename($OPENCODE_ACCOUNT_DIR)))   # $OPENCODE_ACCOUNT_DIR/credential.json; then POST /api/credential/<id>/activate
opencode run --server http://127.0.0.1:<p> -m opencode-go/deepseek-v4-pro --format json < <run>/make1.opencode/prompt.txt
GET http://127.0.0.1:<p>/api/session/<sessionID>/message?order=asc
```

**A7g (pi).** The driver uses the agent's own `accountRuntime(<account>)` from `harnesses/pi-accounts.ts`. It reads
the account's `credential.json` and never writes it: when pi wants a refresh, the store asks the agent
(`POST /accounts/<id>/fresh` on its gateway) and reads the file again. The bench never holds a copy of the grant,
because refresh tokens rotate and a copy would sign the account out. The model is
`runtime.getModel("openai-codex", <--gpt-model>)`. The session has no tools, no extensions, skills, templates or
context files, an in-memory session, and pi's default system prompt. `PI_CODING_AGENT_DIR` is a scratch dir, so
pi's own store is never read.

```
PI_CODING_AGENT_DIR=<run>/make1.pi/agent bun run harness/pi_summarize.ts --cockpit-root <cockpit> --account-dir $PI_ACCOUNT_DIR --gpt-model <model> --prompt-file <run>/make1.pi/prompt.txt --scratch <run>/make1.pi
accountRuntime(basename($PI_ACCOUNT_DIR))   # reads $PI_ACCOUNT_DIR/credential.json; refreshes through the agent's gateway
createAgentSession({ model: runtime.getModel("openai-codex", "<model>"), noTools: "all", sessionManager: SessionManager.inMemory(...), resourceLoader: no extensions/skills/templates/context files }).prompt(<prompt>)
```

Both drivers refuse an `--account-dir` outside the agent's accounts root (`~/.cawco/accounts`), because `readHeld` and
`accountRuntime` read only there.

## The sandbox envelope

Each (cut, arm, run) gets `<sandbox-root>/<cut>-<arm>-<run>/` (default root `~/.worktrees/bench`):

- **Repo.** `git clone --shared --no-checkout` of the session's repo, checked out at the last commit before the cut on
  the session's branch. It is a clone, not `git worktree add`: a worktree shares the source repo's config, so
  `git remote remove origin` in it would remove the real repo's origin. Every remote is removed, and
  `core.hooksPath` points at a `pre-push` hook that records the push and exits 1. `GIT_SSH_COMMAND=/bin/false`.
- **PATH shims** for `ssh scp systemctl cawco gh curl`, plus `sftp rsync wget tailscale` of the same kind. Each
  records its call in `calls.jsonl` and exits 1 with "blocked by benchmark".
- **Environment** built from a short list (USER, LANG, TERM, SHELL, TZ). No SSH agent, no tokens, no `CAWCO_*`, no API
  key.
- **HOME is the run's own**, `<run>/home`. It holds one `.gitconfig` with the session repo's `user.name`/`user.email`
  (bench values when unset); `core.hooksPath` stays in the clone's config. The owner's rc files prepend `~/.local/bin`
  (which holds `cawco`) and zerobrew's prefix (which holds a `curl`). Any rc-sourced shell would resolve those past the
  shims, and Claude Code's Bash snapshot sources rc files; the first real preflight stopped on exactly that. claude runs
  by its real path, and PATH holds the shims, the real dirs of python3, git, node and bun, then the system's. srt.json
  and the deny rules stay keyed on the real home, since absolute paths still reach it. Also set: `DISABLE_AUTO_COMPACT=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` and
  `CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK=1`.
- **Claude Code flags.** `--strict-mcp-config --mcp-config standin.json` (only the stand-in `cawco`) and
  `--disallowedTools WebFetch,WebSearch`. `--settings bench-settings.json` holds `"hooks": {}`,
  `"disableAllHooks": true`, and deny rules: the blocked commands, `git push`, edits anywhere in the source repo, and
  reads of the credential files.
- **`--dangerously-skip-permissions` is used only inside this envelope**: no remote, no ssh, no systemctl, no real MCP
  server. Deny rules still apply in that mode (code.claude.com/docs/en/permissions: "Rules are evaluated in order:
  deny, then ask, then allow").
- **Probe before the first turn.** A `git push` to a scratch bare repo and an `ssh` must each leave a blocked line in
  `calls.jsonl`. A login shell and an interactive shell (`bash -l -c`, `bash -i -c`, sourcing the same rc files the
  Bash tool's shell snapshot sources) must resolve every blocked name to its shim. Any failure stops the run, so an
  rc file that puts `~/.local/bin` ahead of the shims stops it before a turn.
- **Checks on every turn.** The stream's `init` must name the placed session id and show exactly one MCP server,
  `cawco`, connected. Any `hook_started`/`hook_response` frame stops the run.
- **The sandbox runtime.** Every process that has tools runs inside @anthropic-ai/sandbox-runtime: each turn (A0–A7,
  the openings, the chained replays) and A1's `/compact`, and with them the stand-in MCP server and every Bash child.
  Shims and deny rules match command text only. Claude Code's docs: the Bash sandbox doesn't cover file tools or MCP
  servers; "To put the tools, processes, and commands in this section behind one boundary, run the Claude Code
  process itself in a container, virtual machine, or the sandbox runtime". A turn runs as
  `srt --settings <run>/srt.json -- /usr/bin/env TMPDIR=<run>/tmp claude -p …`. srt starts with an allowlisted
  environment: HOME, USER, LOGNAME, LANG, TERM, SHELL, TZ, PATH (the shims, then the dirs of claude, python3, git,
  node, bun and srt, then the system's), `CLAUDE_CONFIG_DIR`, the bench's own variables, and srt's own `TMPDIR` under
  `/run/user/<uid>/bench-srt/<8 hex>` (its proxy socket is there; a socket path is capped at 108 bytes). Nothing
  named `CAWCO_*`, no tokens, no SSH agent. `srt.json` follows CawCo's own boundary (agent `boundary-policy.ts`
  `srtSettings`):
  - network: `api.anthropic.com` plus each `--allow-domain`, no name resolving into 10/8, 172.16/12, 192.168/16,
    100.64/10 (the tailnet) or fc00::/7, local binding allowed. `allowAllUnixSockets` because srt's seccomp helper
    can't start on this host (srt #428/#429); sockets are hidden by path instead, and abstract ones are cut off by
    srt's network namespace;
  - reads denied: `/tmp`, `/run/user/<uid>`, `/run/podman`, `/run/tailscale`, `~/.ssh`, `~/.config/cawco`, `~/.cawco`;
    read back: srt's temp dir, the resolver files, this run's account dir, the run dir, the bench and the tools file;
  - writes only in the run dir and this run's account dir; `/tmp/claude` write-denied; `ripgrep` is `--rg`.
- **Preflight, once per run, inside that exact envelope** (`preflight.sh` → `preflight.json`). These must fail:
  - `curl` (by its real path, past the shim) to `http://127.0.0.1:3456`, with and without `--noproxy '*'`;
  - the same two to `--hub-url`;
  - `touch ~/srt-probe` (if it appears on the host it is removed, and the run stops);
  - `systemctl --user is-system-running`, and `systemctl --user show-environment` (`is-system-running` also exits
    non-zero on a merely degraded manager, so its failure alone proves nothing). Both name the bus explicitly
    (`XDG_RUNTIME_DIR=/run/user/<uid>`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/<uid>/bus`): srt's allowlisted
    environment has neither, and without them systemctl fails on "$XDG_RUNTIME_DIR not defined" before it tries the
    bus. With them it fails on "Failed to connect to user scope bus via local transport: No such file or directory",
    where the same command on the host answers `running`;
  - a connect to `--git-credential-socket` (`preflight.json` also records whether that socket exists on the host);
  - a read of one real file in `~/.ssh` (`config` when it exists), opened with `head -c 0` so no content can ever be
    copied out.

  Three directories are checked by what a listing shows inside. On Linux srt masks a denied directory with an empty
  mount and binds allowed children back, so the listing works and must show only what the run may see. Each is
  compared with the host's own listing, which the bench takes outside the sandbox:
  - `~/.ssh` must show none of the host's entries;
  - `~/.cawco/accounts` must show exactly this run's account;
  - `<account>/projects` must show exactly this run's project dir.

  `preflight.json` records the inside listings and, for the host side, counts only. A listing counts as exercised
  only where the host has something else to hide.

  These must work: a write in the run dir, and an HTTPS answer from `api.anthropic.com` (any status: 401 proves the
  path). Any other outcome stops the run, with srt's stderr.
- **Calls outside srt have no tools, and the code checks it.** Summarisers and judges run outside the sandbox only
  because they can run nothing:
  - claude: `--tools "" --strict-mcp-config --safe-mode --disable-slash-commands`. An init frame listing any tool or
    MCP server, or any `tool_use` in the stream, stops the run;
  - OpenCode (A7d): `OPENCODE_CONFIG_CONTENT` denies every action. Any `tool` part in its messages stops the run;
  - pi (A7g): `noTools: "all"`, no extensions. Any active tool name or `toolCall` stops the run.
- **One cwd, one project dir.** Every claude process of a run starts in the same cwd: the session's real cwd moved into
  the clone, subfolders included, resolved through symlinks. Its encoding is the account's `projects/<dir>`
  (`Sandbox.project_dir`). That one value is used by placement, srt.json's allowRead and allowWrite, the preflight's
  `own-project-read` and `own-project-write`, and teardown. It needs its own allowWrite because it sits under the
  read-denied projects dir: srt binds an allowRead child back read-only, and the account dir's write grant does not
  reach it. The first real smoke failed there with `EROFS`. A turn that leaves nothing in its transcript stops the
  run.
- **Placement.** The pre-cut records are copied with every `cwd` rewritten to the sandbox and `sessionId` set to a
  new uuid, into `$CLAUDE_CONFIG_DIR/projects/<encoded sandbox dir>/<uuid>.jsonl`. The encoding is Claude Code's:
  every character that is not a letter or digit becomes `-`. Once the run ends, `teardown` removes those files and
  the session's leftovers (tasks, file-history, session-env, uploads, debug, todos) from the config dir, then the
  sandbox (`--keep-sandboxes` keeps it).

**Hooks: `"hooks": {}` alone does not stop user-scope hooks.** Tested on Claude Code 2.1.301 with a scratch config
dir holding a user `settings.json` with a SessionStart and a UserPromptSubmit hook. With `--settings` of
`{"hooks":{}}`, both hooks fired. With `{"hooks":{},"disableAllHooks":true}`, neither fired. So the settings file sets
both, and every turn's stream is checked as well.

**What srt adds, and what is left.** The shims and deny rules still catch the usual command text, but srt is the
boundary. A program called by absolute path or through an interpreter still meets srt's network allowlist and its
read-only filesystem outside the run dir and the account dir. Two things are left:
- Inside the account dir the session can read and write that account's other transcripts.
- Claude Code records the sandbox directory in that account's `.claude.json` project list.

If Claude's sign-in refresh needs a host besides `api.anthropic.com`, the run stops with srt's output. Add that host
with `--allow-domain`. Nothing is ever retried outside the sandbox.

## Run order (the orchestrator, on the host, from the worktree root)

`--cockpit-root` is a cockpit checkout. Pricing, forecast, `sentRow`, `harnessNoteOf`, `COMPACT_FOCUS` and the
agent's account code all run from it. The run pins one: a detached worktree of origin/main with its dependencies
installed (`bun install --frozen-lockfile`), so the shared checkout can move during a run of many hours without
changing what the bench imports. The 2026-10-25 run used f6b63dc6. `--gpt-model` is A7g's model on openai-codex: the
ChatGPT account refuses gpt-6.1-sol, gpt-6-sol, gpt-6-astra and gpt-5.6-sol ("not supported when using Codex with a
ChatGPT account") and accepts gpt-5.6-terra (the fleet's own model on that account) and gpt-6-luna; the run uses
gpt-5.6-terra. `python3 -I` is used throughout; `python -I` is the same where `python` exists.

The DB is never opened for writing: every step reads a copy taken with
`sqlite3 -readonly ~/.local/share/cawco/cawco.db "VACUUM INTO '<out>/cawco.db'"` (never `.backup` or `cp`).

The transcripts are read the same way. The draw scans the live account dirs once, then copies every transcript a cut
reads (its pre-cut transcript and its real horizon) into `out/transcripts/` and points the cut at the copy, each
checked to hold its cut (record count, the cut's uuid). Runs, judgments, prices and the arithmetic read only those
copies. The live files cannot be read twice: CawCo moves a session's files to the account the session moves to, and
appends to them while it runs. On 2026-10-25 c24's 460 MB transcript moved accounts mid-run, and a run that read the
drawn path placed an empty transcript ("No conversation found"). `cuts.py --snapshot` takes the copies for an
existing cuts.json; a draw, `--replace-chained` and `--add-cuts` take them themselves.

```bash
# from compaction-bench/, everything under out/ (gitignored)
COCKPIT=$HOME/.worktrees/compaction-bench-cockpit            # git worktree add --detach … origin/main; bun install
sqlite3 -readonly ~/.local/share/cawco/cawco.db "VACUUM INTO '$PWD/out/cawco.db'"
# ./unit.sh <unit> <session-acct> <summarizer-acct> <judge-acct> <script> [args]: one step as a host systemd user
#   unit, with CLAUDE_CONFIG_DIR / BENCH_SUMMARIZER_CONFIG_DIR / BENCH_JUDGE_CONFIG_DIR from the three account ids and
#   OPENCODE_ACCOUNT_DIR (ca27819a…, opencode-go) / PI_ACCOUNT_DIR (257c55fd…, openai-codex)
# the envelope: srt, a real ripgrep for it, the hub the preflight must not reach, A7g's model
BOX="--cockpit-root $COCKPIT --tools out/tools.json --srt /home/bewinxed/.nvm/versions/node/v26.10.0/bin/srt --rg $HOME/.cache/cawco-orchestrator/bench-bin/rg --hub-url http://192.168.3.100:3456 --gpt-model gpt-5.6-terra"
#   add --allow-domain <host> (repeatable) if a run stops on a sign-in refresh to another host

# 0. the stand-in's tools, once per role, from a live session of that role
python3 -I tools_dump.py --role orchestrator --session <orchestrator instance> --out out/tools.json
python3 -I tools_dump.py --role delegate --session <delegate instance> --out out/tools.json
# 0a. draw the cuts (DB copy and transcripts; no model calls)
python3 -I cuts.py --db out/cawco.db --accounts ~/.cawco/accounts --cockpit-root $COCKPIT --out out/cuts.json --n 24 --seed 1 --explain
#    --explain: exclusions by kind and reason with 3 examples each, then the pool and the draw by band, kind,
#    next message (person / agent / resume), role, and same- vs cross-org moves
# 0b. E5 data pass
python3 -I e5.py --db out/cawco.db --accounts ~/.cawco/accounts --cockpit-root $COCKPIT --out out/e5.md
# 0c. preflight only: one cut, one arm, the envelope built and probed inside srt, no turn (→ out/runs/<id>/A0/1/preflight.json);
#     run once per hub address the fleet uses (the tailnet's and the LAN's)
./unit.sh bench-preflight $S $Z $J run.py --cuts out/cuts.json $BOX --only-cut <id> --arms A0 --runs 1 --preflight-only
# 1. smoke: one cut, every arm, one run (proves /compact via -p --resume inside srt, the placement and the A7 hand-offs)
./unit.sh bench-smoke $S $Z $J run.py --cuts out/cuts.json $BOX --only-cut <id> --runs 1
# 2-3. the noise floor (A0 ×5 at the floor cuts) and the run (3 runs per arm per cut), paced on the shared host, arm
#      by arm; what holds each start is a line of out/pace.jsonl:
systemd-run --user --same-dir --unit bench-pace -E PATH="$PATH" python3 -I pace.py --cuts out/cuts.json \
    --accounts <id,id,…> --arms A0,A1,A2,A3,A4,A5,A6 --max-units 9 --per-account 2 --start-load 25 --start-gap 90 \
    --retry-stopped --retry-match "session limit|rate_limit|usage limit" -- $BOX
#    the cross-harness arms when their accounts answer (same command, --arms A7d,A7g, with OPENCODE_ACCOUNT_DIR and
#    PI_ACCOUNT_DIR in its environment)
# 4. judge, cost, the arithmetic, report
./unit.sh bench-judge $S $Z $J judge.py --runs out/runs          # model calls; --engine-only: the engine readings alone
python3 -I cost.py --runs out/runs --cockpit-root $COCKPIT --db out/cawco.db
python3 -I arith.py --out out --cockpit-root $COCKPIT          # no model call: every situation × band × method
python3 -I report.py --out out --paper PAPER.md --eval-report <the eval's out/report.md>
```

`arith.py` prices whole, native `/compact` and a Sonnet summary for every drawn cut in the three situations from
token counts alone: the cut's context, the real session's next 20 turns, and the compaction and summary sizes measured
on the real boundaries (e5.json) and the finished runs. Its docstring gives every formula. It is what §7b of the
report and the "by cost alone" rows of the decision table read. On 2026-10-25 the owner stopped the model runs after
57 had finished ("the cost side is arithmetic"), before any judge call, so those rows carry the decisions and no
quality reading exists (`out/not_run.json`).

`--paper` rewrites only what lies between PAPER.md's results markers, and only with aggregates: cut counts, the
decision table, quality and cost per arm and stratum, the noise floor, judge disagreements, E5 with its calibration,
E6, and stopped runs by class. No transcript text and no error text go into it.

Follow a unit with `journalctl --user -u bench-main -f`. Every step resumes from disk: a finished or stopped run, a
saved judgment and a priced run are skipped on a rerun (`run.py --retry-stopped` reruns the stopped ones).

**Expected smoke output.** `out/runs/<cut>/A1/1/make1-compact.records.jsonl` holds one `compact_boundary` with
`trigger: "manual"`. Every arm's `calls.jsonl` holds only the probe's two blocked lines plus stand-in records.
`out/ledger.jsonl` has one row per summariser call with its per-request usage.

## Where each request's usage comes from

- **A turn's requests** come from its transcript records (one row per message id, the last record's usage). On the
  first real smoke they matched the turn's `result` frame `usage` to the token.
- **A `/compact`** writes no assistant record, and its `result` frame's `usage` is all zeros. Its `modelUsage` is the
  session's running total, and a resumed session starts that total from the transcript's last `cost-state` record
  (Claude Code 2.1.309). The compaction is `modelUsage` minus that baseline, per model; the step records the baseline
  as `usage_baseline`. Without the subtraction the first smoke charged A1 with 1,081,133 restored cache reads. The
  derived usage priced at the 5-minute cache-write rate reproduced Claude Code's own `costUSD` delta to the cent
  ($0.726157), so the compaction writes at that rate.
- **A summariser call** (`llm.call`, stream-json) has assistant frames that carry their message's starting usage, so
  their output count is the first few tokens (8 on the first smoke, for a 13,000-character summary). The call is fresh
  and unpersisted, so its `result` frame's `modelUsage` is that call alone; each model's last request takes the
  output the frames before it do not account for.

## What a stopped run looks like

A refused or failed call, a `/compact` that wrote no boundary, a hook that fired or a failed envelope check stops
that run. Nothing is retried, and no other model or arm stands in. `out/runs/<cut>/<arm>/<run>/result.json` then
reads:

```json
{"cut": "c03", "arm": "A1", "run": 1, "status": "stopped",
 "error": "A1: /compact wrote no manual compact_boundary. JSONL tail:\n{...the last five records...}",
 "steps": [...what ran before it, with usage...], "sessions": ["<uuid>"], "probe": {...}}
```

Every turn runs with `--debug-file` into its sandbox. A turn that ran to a clean result but filed no transcript stops
with `<step>.debug.log` (Claude Code's own log) and `<step>.projectdir.txt` (what the run's project dir held) kept
beside its stream. On 2026-10-25, three new sessions on one account (c23 A4, 05:01–05:03 UTC) filed nothing anywhere
on the host; the same runs filed normally an hour later, and the cause was not found.

A failed `/compact` exits 0 with `result: success`. Only its `status` frame (`compact_result: "failed"`) says it
failed, and the bench reads that frame. A summariser that answers on another model than the one asked stops with
`answered on [...]`. `run.py` exits 75 when any run stopped. Once `--max-stopped` runs have stopped (default 6), no
new run starts, so an expired login does not burn the queue. `report.py` lists every stopped run and judgment
with its error.

## Dry run

```bash
python3 -I compaction-bench/run.py --dry --fixture --cockpit-root $COCKPIT
```

`--cockpit-root` defaults to the bench's own checkout; a checkout older than the agent's `harnessNoteOf` cannot
classify the fixture's next messages, so pass the pinned one.

The fixture runs through the whole pipeline (runs, judge, cost, e5, report → `out/dry/report.md`). Every arm runs
once. The plumbing is real: real sandboxes and probes, the stand-in, and `claude -p --resume` of the placed copy
against a config dir with no sign-in, which must reach the API and stop at "Not logged in". The A7 drivers start
real `opencode serve` / pi sessions with no credential, which stop at "Model unavailable" and "No API key found".
The model's part is simulated (`sim.py`), and every ledger row says `simulated`.

srt itself is not started in a dry run: bwrap can't create a user namespace inside a CawCo workspace boundary
("bwrap: No permissions to create a new namespace"). Every run still writes its `srt.json` and `preflight.sh`. The
script is checked with `bash -n`, and each turn's step records the wrapped argv (`cmd`), the argv actually run
(`executed`, the same command without the srt prefix) and the env keys. The real preflight runs on the host
(`--preflight-only`, step 0c above).

# Compacting long-running coding-agent sessions for cost, with quality as the constraint: a benchmark on real cut points

Draft. It lives with the code (`compaction-bench/`). The Results section is written by `report.py --paper` from `out/`,
between its markers, so every rerun refreshes it. Raw transcripts never appear here: they are the owner's private
sessions. Only aggregates and tables do.

## Abstract

A fleet of long-running coding agents runs out of context and out of account usage windows many times a day. Making a
session's context small can be done three ways:
- by the agent harness's own compaction, on the session's model;
- by a summary written by a cheaper model, possibly on another harness, from which a fresh conversation continues;
- not at all: the session is moved whole to an account that can carry it.

Which is cheapest depends on whether the prompt cache is warm, which organization the target account belongs to, and
whether the limit ran out early. Published compaction evaluations measure what a summary remembers. None measures what
the next real turn does, or what the whole remaining session costs.

We replay real cut points from the owner's own CawCo fleet through nine arms and continue the real next message in a
sandbox. The arms are: whole, native `/compact`, five summariser variants, a Factory-style anchored merge on chained
cuts, and two cross-harness summarisers. The sandbox wraps the agent process in a filesystem and network boundary. We
score:
- the continued turn against the uncompacted control, by engine readings and two blinded judges;
- cost per request with the product's own prices, over the session's real remaining horizon.

The decision rule is the owner's: the cheapest method whose quality is not below the best by more than the noise floor.

## 1. Motivation

The objective is the owner's: compaction exists "to save costs". The design states it as an invariant
(`fable-design.md` §A0):

> **A session's context is made small only when making it small costs less than carrying it, and it is made small by
> the cheapest reader that can read it.**

Cost is the objective; quality is the constraint. The cost fact under every branch is who reads the context P that is
to be summarised. The three cases, in the design's own words (§A0):

| who reads P | price of reading P |
|---|---|
| the session's own model, cache warm, same org | cache-read, ≈ 1/20 of input on Opus 5.5 |
| the session's own model, cache cold or another org | cache-write ≈ 1.25 × input |
| a cheaper model on another account | that model's input price on what it is given |

That gives three situations:
- **warm, same organization:** native compaction is the cheapest reader;
- **cold or cross-organization:** native pays a full uncached read of P on the target, and a cheap summariser pays
  less to read but may lose more;
- **limit gone early:** nothing can run on the account that ran out, so a compaction ahead of the limit is
  unavailable.

The decision table this benchmark produces sets the product's defaults per situation and context band.

## 2. Related work

- **Factory, "Evaluating Context Compression for AI Agents"**, https://factory.ai/news/evaluating-compression.
  - A probe-based evaluation with four probe types and a blinded LLM judge scoring six dimensions 0–5.
  - The objective: "The right optimization target is not tokens per request. It is tokens per task."
  - Artifacts: "Artifact trail is the weakest dimension for all methods, ranging from 2.19 to 2.45."
  - Overall scores 3.70 (Factory), 3.44 (Anthropic), 3.35 (OpenAI).
  - Blinding: "The judge does not know which compression method produced the response."
  - What we take: probes with expected facts, blinding, and the per-task objective, which we make concrete as a
    horizon cost.
  - What we add: the continued turn itself, against a whole control.
- **Nous Research, hermes-compression-eval DESIGN.md**,
  https://github.com/NousResearch/hermes-compression-eval/blob/main/DESIGN.md.
  - Repetition: "A single run means nothing. Report medians over N=3 runs by default, and require an improvement of
    >=0.3 on any dimension before claiming a prompt change is a win."
  - Noise floor: "Before landing prompt changes, run the current prompt N=10 times to measure per-dimension stddev."
  - What we take: N=3 medians and the 0.3 bar. The noise floor is measured as A0 against itself (§4.4).
- **Lindenbauer et al., "The Complexity Trap"**, arXiv 2508.21433, https://arxiv.org/abs/2508.21433.
  - Finding (https://arxiv.org/html/2508.21433v3): "We find that a simple environment Observation Masking strategy
    halves cost relative to the Raw Agent while matching, and sometimes slightly exceeding, the solve rate of
    LLM-Summary."
  - Statistics: "We assess significance using paired nonparametric bootstrap with B=10,000 replicates". We adopt the
    same bootstrap, over cut points.
  - Not an arm here (design B1). Their tasks are short single-issue SWE-bench runs. Ours are multi-day and
    human-steered. And masking is a policy within one context, not a carry across accounts.
- **CompactBench**, https://github.com/compactbench/compactbench.
  - Drift: "Multi-cycle drift. Methods are evaluated across repeated compact → continue → compact loops, so decay over
    time is a first-class metric."
  - Hidden set: "Hidden ranked set. Public practice cases for development; hidden templates rotated on version bumps
    for ranked scoring."
  - What we take: drift, measured on chained real cut points. Its fixtures are synthetic templates.
- **Claude Code issue #96316**, https://github.com/anthropics/claude-code/issues/96316.
  - "The context-compaction summary (auto-compact and `/compact`) is generated with the session model", and "there is
    no way to route it to a cheaper model".
  - Why it matters: native compaction on a cheaper model is not an arm, because it cannot exist.
- **Anthropic pricing**, https://platform.claude.com/docs/en/about-claude/pricing.
  - Cache reads: "0.1x base input price (0.025x on Claude Fable 5.1 and Claude Mythos 5.1; 0.05x on Claude Opus 5.5 and
    Claude Sonnet 5.5)".
  - Haiku 5.5: "Claude Haiku 5.5 is priced by prompt length". Its table rows are "$0.10 / MTok for prompts up to
    100,000 tokens" and "$0.50 / MTok for prompts over 100,000 tokens".
  - Why it matters: every request is priced on its own; summing a turn's tokens would put a long Haiku prompt in the
    wrong tier.

## 3. Our prior evaluation and its weaknesses

The infinite-chat eval (`../infinite-chat-eval`) replayed one 571-turn, 13-hour orchestrator chat. It ran through
CawCo's summary, Claude Code's compaction prompt, a Factory-style merge and a memory tree, each chained over the chat's
five real resets. Each method then answered 54 probes, judged 0/1/2 by Sonnet 5.5.

As the design summarises it (§B1):
- native compaction kept 16–22 % of the probes and CawCo's summary 29–35 %, with correction probes the worst;
- the Factory-style merge scored below CawCo (27 % vs 35 %);
- the memory tree scored 56 % and cost $29.76 (81 % of it cache reads).

The full tables are in the eval's `out/report.md`; `report.py` copies them into §9 of `out/report.md`.

Its weaknesses, which this benchmark is built to remove:
- **n = 1, one run.** One chat, one run per method, so no variance and no interval.
- **LLM-written probes and an LLM judge, recall only.** It asked what a method remembered, never what the agent then
  did.
- **No control.** No arm carried the whole context, so no method's loss was known in absolute terms.
- **Carried size not priced.** A small summary that makes the agent re-read files looked free; the cost of the turns
  after it was never counted.

## 4. Method

### 4.1 Arms

Every arm ends the same way: a Claude Code session in state X, inside the sandbox (§5), receives the real next message
and runs one turn.

| arm | state X | where it runs |
|---|---|---|
| A0 control | the pre-cut transcript resumed whole (`claude -p --resume` of a placed copy) | every cut |
| A1 native | resumed whole, then `/compact <focus>` on the session's model | every cut |
| A2 | CawCo summary, Sonnet 5.5, today's extract (tool output hidden), CawCo's five sections | every cut |
| A3 | A2 on Haiku 5.5 | non-chained |
| A4 | CawCo shape, Sonnet 5.5, full live scope with each tool result clipped (`render_conv`, 4,000 chars) | non-chained |
| A5 | Claude Code's nine-section compaction prompt on A4's input | non-chained |
| A6 | Factory anchored merge | chained only |
| A7d | A4's prompt written by OpenCode on `opencode-go/deepseek-v4-pro` | non-chained |
| A7g | A4's prompt written by pi on `openai-codex/<model>` | non-chained |

The summary arms open a fresh conversation on the session's own model with the CawCo opening: a header, the summary,
an artifact index built by code, and the last turns verbatim. The opening is a turn of its own, as in the product.
A2–A7 differ only in the summary, so each varies one factor at a time.

The cross-harness arms run the way the product runs those harnesses:
- **A7d:** the account's credential is put on a private OpenCode server through its credential API.
- **A7g:** pi runs on the agent's own account runtime, which refreshes the sign-in through the agent and never holds a
  second copy of a rotating grant.

### 4.2 Cut points

The sources are the hub's database and the Claude Code transcripts under each account dir. There are five kinds:
- **native:** a compaction between turns;
- **native-midturn:** an automatic compaction inside a turn. The cut moves to the start of that turn: the user record
  that opened it is the next message, and the context at the cut is the prompt of the last request before it;
- **moved-compacted:** a manual compaction right after an account move;
- **moved:** an account move. The cut is the last record before the move, and the move records whether it crossed
  organizations;
- **continued:** CawCo's own summary path. The pre-cut transcript is the conversation the event ended
  (`instance_conversations.next_event_id`), and the next conversation's first turn after the opening is the next
  message.

A cut is eligible when all of these hold:
- the context at the cut is at least 100k;
- the real session has at least 10 turns after it;
- no assistant record comes between the cut and the next message;
- the session has a CawCo instance and its repo is on the host;
- the next message is the person's words, a hand-off from a parent, or, at a limit event, the hub's resume nudge.

**Sample.** 24 cut points, seeded, stratified by context band (100–300k, 300–600k, 600k+). Each band gets 8 cuts, of
which 2 are chained pairs, 2 continuations and 2 orchestrator sessions, plus at least one same-org and one cross-org
move. A shortfall is reported, never filled from another stratum. Three non-chained cuts (one per band) carry the
noise floor.

**The first draw: 0 eligible of 222 candidates.** Every exclusion reason from that draw changed the method:
- **131 "compacted mid-turn"**: an automatic compaction can fire inside a turn. Those cuts now move to the turn start.
- **48 "no transcript opens with this continuation's opening" and 35 "no transcript holds the opening's last verbatim
  turn"**: continuations had been matched by text. The opening's last verbatim turn is often the hub's resume nudge,
  which appears in 170 transcripts, and many transcripts end with a record that has no timestamp. Continuations are now
  matched through the database; a transcript's end is its last record that has a timestamp.
- **4 "no CawCo instance row"**: sessions are now mapped through `instance_conversations` and `instance_aliases` too.
- **3 "the next message is cawco's own"** and **1 "fewer than 10 turns after the cut"**: unchanged rules.

Account moves were added as a kind of their own (661 events on 261 sessions), since a move is exactly the cold or
cross-org moment the decision table is for. `cuts.py --explain` prints every exclusion by kind and reason with
examples.

**The second draw (2026-10-25): what counts as a next message.** The first real smoke ran on a cut whose "next
message" was `[Request interrupted by user]`, and every arm answered it with some form of "I've stopped". A look at
the 24 drawn next messages found more of the same kind. The product's `sentRow` had typed them as the person's
words, because the bench handed it bare text:
- **Claude Code's interrupt line** (1 of the 26 next messages of the first draw, its two chained second cuts
  included): the harness's own word, never a request. It now opens no turn, by the product's own pattern
  (`INTERRUPTED`, core transcript-rules.ts).
- **`<task-notification>` blocks** (5 of 26): a background task's result, which the agent types off the message
  (`harnessNoteOf`, agent claude-transcript.ts) before `sentRow` reads it. The bench now does the same, so they are
  cawco's own (`ui.system_note`) and excluded.
- **CawCo's own markers from before 2026-09-23** (11 of 26: 3 rule replies, 8 hand-offs, reports and asks):
  `[Rule: <name>]`, `[Hand-off from the … session — another agent, not the user]`, `[Report from delegate …#… —
  turn …]`, `[Delegate ask from …]`. Today's parser reads only the current markers. The bench types the old ones as the product's parser did then (commit d33fc5795): a rule reply
  is cawco's own and excluded; the other three are another session's words.

A next message is now the person's words (`person`), another session's words relayed by the hub (`agent`: a
hand-off, a delegate's report or ask), or the hub's resume nudge at a limit event (`resume`). The second draw, same
seed: 256 eligible (+68 chained pairs), of which 74 person, 140 agent and 42 resume. Agent messages are kept because an
orchestrator's real work is acting on its delegates' reports, and doing that well depends on what the context still
holds (our call).

**Memory.** The first real draw kept every parsed transcript resident: 25.5 GiB for 13.5 GB of JSONL, flagged by the
host's leak watch. Files are now parsed only when their bytes hold a boundary or a candidate names them, and the last
8 are kept: 2.3 GB peak, the same 24 cuts.

**Chained pairs capped at 30 turns apart (our call).** The design asks only that a pair's boundaries be at least 15
turns apart. Both pairs the second draw took were in the 600k+ band and replayed 117 and 121 real turns per run. Nine
such runs at once drained two of the fleet's accounts' 5-hour windows to 100 % before most of them were halfway: all
9 of c18's A1, A2 and A6 runs stopped on "You've hit your session limit", after 4 to 68 of their 121 replays. Only the chained slots were drawn again (`cuts.py
--replace-chained 30`, seeded), from the 35 of 68 pairs at most 30 turns apart (all in 600k+; the pool's gaps run from
15 to 403, median 30). The new pairs replay 30 and 22 turns. The 22 single cuts and their runs stayed. The discarded
chained runs are kept aside on the host, not reported.

**One run's project memory must not open another's.** Claude Code makes `projects/<slug>/memory` for a session's
project, and CawCo's agent links it in every account to one shared copy under `~/.claude/projects` (agent
accounts.ts `linkProjectMemory`), which Claude Code reads into the session (`MEMORY.md`). A run's slug is its sandbox
path, `<cut>-<arm>-<run>`, which the next draw reuses. The orchestrator's 2026-10-17 smokes had left two such
memories with notes in them (c05-A4-1, c05-A7d-1), and 178 empty project dirs in each of the seven accounts. No run of
this draw had reached c05. Every run now removes its slugs from every account and from the shared copy before it is
built and again at teardown.

**The primary reading is the continued turn.** Each arm × cut × run gets these readings:
1. **Engine readings, no judge.**
   - Jaccard of the files the arm edited against the real turn's, and of the commands it ran;
   - re-fetches: reads, greps and `cat`/`sed -n` of paths the pre-cut transcript had already read;
   - which anchor key strings survive in the carried state.
2. **Pairwise against the control.** The arm's turn and A0's turn of the same run index, blinded as X and Y and judged
   in both orders. A win or loss counts only when both orders agree; otherwise it is a tie. The judge also counts the
   questions each turn asks the person that the anchors already answer.
3. **Absolute 0–5** on decision fidelity, artifact fidelity, continuation fidelity and no-repetition. These are
   Factory's six dimensions reduced to four (design B4).
4. **Probes (secondary).** On run 1 only, the anchors' questions are answered from each arm's carried state, then
   scored 0/1/2 under the prior eval's own rubric, shuffled under letters.

5. **Summary rules (secondary).** The summary each arm carried (A1: Claude Code's; A2–A7: the summariser's) scored 0–5
   by both judges on the owner's two rules for a compaction summary (2026-10-21): the person's messages carried as
   their meaning, never quoted; only what the next turns need. It enters no decision.

**Anchors.** Opus 5.5 writes 8–12 expected facts per cut from the pre-cut live scope. A fact is kept only if its key
string is in the transcript verbatim. Too few kept is reported, never topped up.

**Judges.** Opus 5.5 is primary and Sonnet 5.5 second, with the same prompts. A direction counts only when both
agree, and every disagreement is listed. A judge never sees arm names.

### 4.4 Noise floor

A0 is run five times at the three floor cuts. A0 against itself gives the spread of the 0–5 scores and the pairwise
outcomes. The actionable difference is the larger of Nous's 0.3 and the 95th percentile of that spread.

### 4.5 Cost

Every API request is priced on its own with the product's own `costForUsage`/`resolveRates`, at the request's time.
Per run there are three terms:
- **C_make:** the summariser's requests plus the opening turn (A2–A7), or the `/compact` call (A1).
  - The compaction call writes no transcript record. Its usage is only in the turn's result frame (`modelUsage`).
  - A0's own cache write sits in its first request, which is priced whole: never split, because a split would price
    two halves under the wrong context tier.
- **C_turn1:** the continued turn.
- **C_horizon(K):** the real session's requests after its own continued turn, for turns 2..K.
  - Each request is re-priced with its prompt shifted by (S − P), where S is the arm's carried size and P the real
    session's at the same point.
  - Growth and output are the real ones.
  - K is the real turns to the next compaction or the end; K = 20 and K = 50 are reported where the session has them.

**Where the tokens come from.** Two of the three sources needed correcting on the first real smoke:
- A turn's requests are its transcript records. They matched the turn's own `result` usage to the token.
- A `/compact` writes no assistant record, and its `result` usage is all zeros. Its `modelUsage` is the session's
  running total, which a resume starts from the transcript's last `cost-state` record. Taken raw, it charged native
  compaction with 1,081,133 cache reads the original session had made before the cut. The compaction is now
  `modelUsage` minus that baseline, per model. Priced at the 5-minute cache-write rate, the derived usage reproduces
  Claude Code's own `costUSD` delta to the cent ($0.726157); at the 1-hour rate it would be $1.055344. So the
  compaction request writes the 5-minute cache.
- A summariser's stream-json frames carry each message's starting usage: an output of 7 or 8 tokens for a
  13,000-character summary. Its output is now taken from the call's `modelUsage`, which for a fresh, unpersisted call
  is that call alone.

**Two regimes.**
- **Cold** is measured, since a resume is cold by construction.
- **Warm** is computed from the same requests, because a warm-up turn would contaminate the transcript.
  - A1: its compaction read is taken from cache.
  - A0: its carried context is taken from cache while the new message stays a write.
  - Summary arms: as cold, since a summariser never shares the session's cache.

**Window percent** is the product's `weightedTokens` over its measured `tokensPerPercent` for the account.

### 4.6 E5: the window cost of a warm native compaction

This is data only, with no model calls. Every compaction boundary is priced by formula:
- **prompt:** a cache read of the boundary's `preTokens`;
- **output:** the `isCompactSummary` record right after it, counted with the product's `estimateTokens` (four
  characters a token plus 15 %).

It is priced with `costForUsage` at the boundary's time, then turned into window percent for the account the session
was on then.

**Calibration.** A manual `/compact` is a turn of its own, so its turn_usage row measures the compaction. The formula
is checked against every such row and reported side by side. The first real pass found 2 measured manual compactions
against 132 automatic ones, which is why the formula exists. The 2026-10-25 pass found 163 priced boundaries (134
manual, 29 automatic; 231 more had no summary record after them) and 124 measured manual compactions to check the
formula against (§8).

A boundary whose transcript holds no assistant record before it (a file that opens on a summary) takes the session's
model from the first assistant record after it; the first pass stopped on such a boundary.

**Rule.** compactAtPct = 100 − 3 × (median window % per 100k × the 95th-percentile context / 100k). The lowest value
across windows is the default. The rule is the design's own call (§B5).

### 4.7 Statistics and the decision rule

- Each arm's reading is the median over its runs (N = 3), then over cut points.
- Differences get a 95 % bootstrap CI over cut points (10,000 resamples). This is the Complexity Trap paper's method:
  "We assess significance using paired nonparametric bootstrap with B=10,000 replicates"
  (https://arxiv.org/html/2508.21433v3). They resample 500 SWE-bench instances; we resample cut points.
- A difference is acted on only when all three hold: its CI excludes zero, its median is at least the noise floor, and
  both judges agree on its sign.
- Per situation × band, the default is the cheapest arm whose quality is within the noise floor of the best arm's.
- A cut leaves an arm's CI only when fewer than 2 of its runs finished there.

### 4.8 Drift

On a chained pair (two eligible boundaries in one session, at least 15 turns apart):
1. the arm makes its state at boundary 1;
2. the real user messages between the two boundaries are replayed onto the arm's own session (teacher forcing);
3. the arm makes its state again at boundary 2;
4. the real next message runs.

The chained arms are A0 (at boundary 2), A1, A2 and A6, which together answer whether a summariser should merge the
prior summary or restate it.

### 4.9 Running on a shared host

The runs share a 48-core host and the subscription accounts with the live fleet. `pace.py` starts one `run.py` per
(cut, arm), its runs in parallel, as a host systemd unit. It starts one only when all of these hold:
- the 1-minute load is below 25. The brief's bound is 40; a resume of a million-token transcript parses at 160 % CPU;
- fewer than 9 units run;
- an account has its 5-hour window below 70 %, by the hub's own live readings, and fewer than 2 units on it.

The session account is the one with the lowest reading plus 8 points per unit already on it. The summariser account
is the lowest other one. The pool was the four Petralab Team accounts with session windows only (1c962620, 676d0582,
d18c5ce4, c6b14b4e) and one account in another organization (e8b553ef, weekly window at 33 %). Left out were the
account whose weekly window stood at 57 % (3c788add) and the account the driving session ran on. Every start is a line
of `out/pace.jsonl` with its account and the readings it saw, and every run's `result.json` names its accounts.

The arm's session continues on a different account from the original session's in every run. That is the cold
regime by construction for every arm alike. It changes nothing within a cut, since all of a cut's arms share it.

## 5. The sandbox (a contribution)

Continuing a real session's next turn means running an agent with tools on the owner's machine. That machine holds
the live hub, other accounts' sign-ins, SSH keys and the real repositories. The envelope has to make "nothing real is
touched" true, not just likely.

**Text rules are not a boundary.** The first envelope had PATH shims (ssh, scp, systemctl, cawco, gh, curl and four
more), a pre-push hook and Claude Code deny rules. All of them match command text:
- an absolute path or an interpreter passes a shim;
- Claude Code's docs say a Bash rule "isn't a security boundary around the program"
  (https://code.claude.com/docs/en/permissions);
- the docs also say the built-in Bash sandbox doesn't cover the rest: "The sandbox covers shell commands only.
  Claude’s file tools, MCP servers, and hooks run outside it." (https://code.claude.com/docs/en/sandboxing).

The same page's remedy: "To put the tools, processes, and commands in this section behind one boundary, run the Claude
Code process itself in a container, virtual machine, or the sandbox runtime."

**srt around the whole process.** Every process that has tools runs inside @anthropic-ai/sandbox-runtime (srt): each
turn, the `/compact`, and with them the stand-in MCP server and every shell child. The settings follow CawCo's own
workspace boundary (`boundary-policy.ts`):
- **network:** only `api.anthropic.com` (plus named extras). No name may resolve into private, tailnet (100.64/10) or
  unique-local space.
- **reads denied:** `/tmp`, the user's runtime dir, `~/.ssh`, `~/.config/cawco`, `~/.cawco` and the account's own
  projects dir. Read back: srt's temp dir, the resolver files, this run's account dir and its own project dir, the run
  dir and the bench.
- **writes:** only in the run dir and the account dir.
- **environment:** srt starts with an allowlisted environment.
- **calls outside srt:** summarisers and judges stay outside only because they have no tools, and the code checks it on
  every call: a stream that lists or uses a tool stops the run.

**Host facts that took finding.**
- **seccomp.** srt's seccomp helper cannot start on this host (`apply-seccomp: write /proc/self/setgroups ...
  Permission denied`; srt #428/#429). `network.allowAllUnixSockets: true` skips that stage while the filesystem and
  network rules still apply. Sockets are then hidden by path, and abstract sockets are cut off by srt's network
  namespace.
- **The TMPDIR trap.** srt's proxy socket lives in its own `TMPDIR`. With `/tmp` read-denied the proxy dies (`curl:
  (56) Proxy CONNECT aborted`). Each run gets a short `TMPDIR` under `/run/user/<uid>/bench-srt/` (a socket path is
  capped at 108 bytes), read back in the settings. The command inside gets the run's own tmp.
- **Hooks.** `--settings '{"hooks":{}}'` does not stop user-scope hooks. With a SessionStart and a UserPromptSubmit hook
  planted in a scratch config, both fired; with `"disableAllHooks": true` added, neither did. Every turn's stream is
  also checked for a hook event.
- **The owner's rc files outrank the shims.** The first real preflight stopped at the envelope probe: `bash -l: cawco →
  ~/.local/bin/cawco; bash -i: curl → …/zerobrew/prefix/bin/curl`. The owner's rc files prepend those dirs, and Claude
  Code's Bash snapshot sources rc files. Each run now gets its own HOME (`<run>/home`, holding only a `.gitconfig`), so no
  owner rc file is ever sourced. Programs are found by their real paths. The denies stay keyed on the real home.
- **A read-back is read-only.** Denying reads of the account's projects dir and reading back only the run's own project
  dir made that dir read-only: srt binds an allowRead child back inside the masked parent read-only, and the account
  dir's write grant does not reach under the mask. The first real smoke run failed every transcript write there
  (`EROFS`; a `/compact` that could not write, openings whose sessions were never filed, so "No conversation found").
  The run's project dir is now granted writes by name. It is derived once from the exact cwd claude runs in,
  subfolders included, and the preflight writes there before any turn. A turn that leaves nothing in its transcript
  stops the run instead of passing.
- **Clone, not worktree.** The sandbox repo is `git clone --shared` at the last commit before the cut. A `git worktree`
  shares the source repo's config, so `git remote remove origin` there would remove the real repo's origin.
- **srt cannot nest.** Inside a CawCo workspace boundary srt cannot start (`bwrap: No permissions to create a new
  namespace`). The real preflight runs from a host systemd unit; a workspace can only generate and syntax-check the
  envelope.

**Preflight.** Before each run's first turn, a script runs inside that run's exact envelope and writes
`preflight.json`. These must fail:
- `curl` (by its real path) to the hub on loopback and over the tailnet, each with and without the proxy;
- `touch ~/srt-probe`;
- the user's systemd bus (`is-system-running` and `show-environment`; the former also exits non-zero on a merely
  degraded manager);
- a connect to the git-credential socket;
- a read of a real file in `~/.ssh`, opened with `head -c 0` so a leak could never copy its contents.

Three directories are checked by what they show, not by an exit code. On Linux srt masks a denied directory with an
empty mount and binds allowed children back, so `ls` succeeds. The first preflight read that as three failures
("expected to fail, exit 0"), when what the sandbox saw was the intended isolation. Each inside listing is now compared
with the host's own listing, taken outside, which records counts only:
- `~/.ssh` must show none of the host's entries;
- `~/.cawco/accounts` must show exactly this run's account;
- `<account>/projects` must show exactly this run's project dir.

These must work: a write in the run dir, listing its own project dir, and an HTTPS answer from `api.anthropic.com`.
Any other outcome stops the run.

The orchestrator's host test, run from a systemd user unit with these settings (srt 0.0.80):
- `api.anthropic.com` answered 401;
- `127.0.0.1:3456` refused;
- the tailnet hub got `403, X-Proxy-Error: blocked-by-allowlist`;
- `touch ~/x` hit a read-only filesystem;
- `systemctl --user` found no bus;
- `~/.ssh` was denied;
- a write in the run dir worked.

Each run's own preflight results are in its `preflight.json`.

**The real preflight (2026-10-25, srt 0.0.80, Claude Code 2.1.309, from a host systemd user unit).** The first
preflight run inside the full envelope passed every check, but one of them proved less than it said: both
`systemctl --user` probes failed on "$XDG_RUNTIME_DIR not defined", because srt's allowlisted environment lacks it.
That failure says nothing about the bus. The probes now name the bus (`XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`).
The same command on the host answers `running`; inside the sandbox it now fails with "Failed to connect to user scope
bus via local transport: No such file or directory". The preflight then ran against both hub addresses the fleet
uses:
- loopback `127.0.0.1:3456`: `curl: (7) Failed to connect`, with and without the proxy;
- the tailnet hub through srt's proxy: `403`; without the proxy: `curl: (7) Failed to connect`;
- the LAN hub (`192.168.3.100:3456`, the address the fleet's sessions use): `curl: (7) Failed to connect`, both ways;
- `touch ~/srt-probe`: "Read-only file system";
- the git-credential socket, which exists on the host: "No such file or directory" inside;
- `~/.ssh/config`: "No such file or directory" inside. The `~/.ssh` listing shows none of the host's 6 entries;
- `~/.cawco/accounts` shows only this run's account (of 10); the account's `projects` shows only this run's project
  dir (of 2,258);
- a write in the run dir and in its own project dir worked; `api.anthropic.com` answered 401.

The probe outside srt: a `git push` to a scratch bare repo and an `ssh` each left their blocked line, and no login or
interactive shell resolved a blocked name past its shim.

**Residue we accepted.**
- The run's account dir stays readable, its sign-in included, because Claude Code signs in with it. The network
  allowlist keeps it from leaving.
- Claude Code records the sandbox directory in that account's `.claude.json`. We do not edit that file while other
  sessions write it.

## 6. Threats to validity

- **One owner's fleet.** All sessions are one person's, on one product, in a few repositories. Defaults tuned here may
  not transfer.
- **Claude Code only for native compaction.** OpenCode and pi compact natively too, but have no accounts, so no
  at-limit decision to inform; they appear only as summarisers.
- **Judges from one model family.** Both judges are Claude models, and so are most arms' sessions. Shared biases would
  not show as disagreement.
- **Teacher forcing on chained cuts.** Replaying the real user messages onto an arm's own replies can ask an arm to
  react to work it did not do.
- **Hub resume nudges as next messages** (our call). At a limit event the real next message is often the hub's "carry
  on" nudge, which we accept and report as its own stratum (`next_kind: resume`). A resume tests carrying on, not
  answering the person.
- **The stand-in MCP.** CawCo's tools answer "recorded" instead of acting. A turn that depends on a real answer (a
  delegate's report, a task read) diverges from the real one for every arm alike.
- **Repository state.** The sandbox checks out the last commit before the cut. Uncommitted changes the session had are
  not reproduced, so a turn may re-do or re-find work.
- **E5's formula.** It assumes the compaction prompt is entirely a cache read and estimates the summary's tokens from
  its characters. The calibration against measured manual compactions bounds this, on a small sample.
- **Prices and window rates.** Costs use the product's pricing snapshot and its measured tokens per percent. Use by
  other clients on the same account makes a percent look cheaper (forecast.ts says as much).
- **Time.** Models and Claude Code change during the runs. Every ledger row records the model that answered.
- **A resume is not the live context.** A resumed transcript is rebuilt from its records, not from the live
  session's prompt. At c17's second cut the live session's last request held 961,197 tokens; the resumed A0's first
  request held 863,190. The control therefore carries what a move of the transcript carries, which is what CawCo's
  move does, but not exactly what the session held.
- **Whole is sometimes impossible.** At c18's second cut (966,399 tokens) every A0 run stopped on "Prompt is too
  long". The real session compacted before that turn: its first request held 84,900 tokens. There, A0 is no control
  and `whole` no option. The cut's other arms are scored against the real turn on the absolute scale only.
- **Refusals.** A `/compact` can be refused by Opus 5.5's safeguards ("Opus 5.5's safeguards flagged this message").
  Such a run stops and is counted, never rerun on another model.
- **A turn that files nothing.** Three new sessions on one account (c23 A4, 05:01–05:03 UTC on 2026-10-25) ran to a
  clean result and left no transcript anywhere on the host, so there was nothing to judge or price. Rerun on another
  account an hour later, with the same opening, all three filed normally. The cause was not found. Every turn now keeps
  Claude Code's debug log, so a recurrence carries its own explanation.
- **What the next message is.** 15 of the 24 drawn next messages are another session's words (hand-offs, reports,
  asks), 8 the person's and 1 the hub's resume nudge. The pool is orchestrator-heavy (242 of 256), as the fleet is.
- **OpenCode (A7d) was not run.** The opencode-go account's key, the one ending 4DEY, has expired: "This API key has
  expired. Create a new API key in OpenCode Console and replace it in your client or secret store" (HTTP 401,
  `api_key_expired`); the hub's own reading of that account is HTTP 401 too. The owner's call: the run goes on without
  it. Nothing here says how an OpenCode summariser does.
- **pi (A7g) depended on one ChatGPT account's Codex limit.** On the run's first day it answered "The usage limit has
  been reached"; §8 shows what ran.

## 7. Decisions log

Who made each methodology choice, why, and its source.
- **owner:** the product owner, in their own words.
- **design:** the Fable advisor's design (`fable-design.md`).
- **orchestrator:** the session that briefed this work.
- **bench:** the session that built it.
- **runner:** the session that ran it for real on the host (2026-10-25).

"Our call" marks a choice no source settles.

| decision | by | why | source |
|---|---|---|---|
| Objective: cost, with quality as the constraint | owner | compaction exists "to save costs" | design §A0 |
| Benchmark first; no product change | owner | — | brief |
| Cross-harness summarisers (A7d, A7g) | owner | "even from another harness" | brief |
| Native = session model, never a cheaper model | design | the setting does not exist | Claude Code #96316 |
| Arms A0–A6, one factor varied at a time; no factorial crossing | design | eight arms already; a combined arm follows if two win | design §B2 |
| 24 cuts, 3 runs, three bands, the per-band quotas | design (our call there) | wall time, not cost, is the limit | design §B3, §B9 |
| `--add-cuts N` to extend the sample | orchestrator | in case the results don't separate | brief |
| Primary reading is the continued turn; A0 control | design | nobody measures it; without a control no loss is known | design §B1 |
| Probes with verified key strings; blinded judge; N=3 medians; 0.3 bar | design, after Factory and Nous | — | factory.ai, Nous DESIGN.md |
| Noise floor from A0 ×5 at 3 cuts | design | Nous suggests N=10 of one arm; fewer, across three bands | design §B4 |
| Opus 5.5 primary judge, Sonnet 5.5 second; act only when both agree | design | — | design §B4 |
| Bootstrap 95 % CI over cut points, 10,000 resamples | design | the Complexity Trap paper's paired bootstrap, B=10,000 | design §B6; arXiv 2508.21433 |
| Cheapest arm within the noise floor of the best | design (our call there) | cost is the objective, quality the constraint | design §B6 |
| compactAtPct = 100 − 3 × cost at the 95th-percentile context | design (our call there) | — | design §B5 |
| E5 over all boundaries by formula, calibrated on the measured manual ones | orchestrator | n=2 measured is too thin | brief |
| Summary tokens by the product's `estimateTokens` | bench | the product's own counter exists | core continuation.ts |
| Every request priced on its own by the product's pricing | orchestrator | a context tier applies per request | brief; pricing page |
| Horizon re-priced per request with the prompt shifted by S − P | bench | the design's ΣΔ formula, made per request so tiers hold | design §B5 |
| Warm regime computed, not measured | bench | a warm-up turn would contaminate the transcript | our call |
| A0's cache write left inside its first request | bench | splitting a request misprices its tier | our call |
| `/compact` usage from the result frame's `modelUsage` | bench | the compaction call writes no transcript record | observed on Claude Code 2.1.301 |
| A failed `/compact` read from its status frame | bench | it exits 0 with `result: success` | observed |
| The opening is a turn of its own; its header names the sandbox dir | bench | as in the product; the agent must work in the sandbox | our call |
| Chained arms A0, A1, A2, A6 | bench | the three E7 candidates plus the control | design §A7 |
| Probes on run 1 only | bench | recall is secondary; it never decides alone | our call |
| A pairwise win counts only when both orders agree | bench | position bias cancels | our call |
| The full-clipped tail split checked against methods' own | bench | A4–A7 inputs must match the port exactly | our call |
| Continuations matched through `instance_conversations` | orchestrator | text matching failed on the nudge and on missing timestamps | first real draw |
| Mid-turn compactions cut at their turn's start | orchestrator | 131 of 222 were mid-turn | first real draw |
| Account moves as cut points, with cross_org strata | orchestrator | a move is the cold or cross-org moment itself | first real draw |
| Resume nudge accepted as a next message at a limit event | orchestrator (our call) | resuming is what the arms are judged on | — |
| Clone, not worktree | bench | removing a worktree's origin removes the real repo's | observed |
| The run's project dir granted writes by name, derived from claude's exact cwd; a turn with no transcript stops | bench | an allowRead child of a denied dir is bound back read-only (EROFS on the first smoke) | first real smoke |
| Denied directories checked by what a listing shows inside, not by `ls`'s exit | orchestrator | srt masks a denied dir with an empty mount, so `ls` exits 0 | second real preflight |
| Each run's own HOME; programs by real path | orchestrator | the owner's rc files put ~/.local/bin and zerobrew ahead of the shims | first real preflight |
| `disableAllHooks` with `"hooks": {}` | bench | `"hooks": {}` alone did not stop user hooks | tested |
| srt around every process that has tools | orchestrator | text rules are not a boundary | Claude Code docs |
| srt settings after CawCo's boundary; `allowAllUnixSockets` | orchestrator | seccomp cannot start on this host | srt #428/#429; boundary-policy.ts |
| srt `TMPDIR` under `/run/user/<uid>/bench-srt` | orchestrator | the proxy socket dies under a denied `/tmp` | host test |
| Preflight per run; `show-environment` beside `is-system-running` | orchestrator; bench | `is-system-running` fails on a degraded manager too | our call |
| The account's other sessions read-denied | bench | a session should not read others' transcripts | our call |
| Calls outside srt asserted tool-less | orchestrator | they are outside only because they cannot act | brief |
| Interrupt lines open no turn; task notifications typed through the agent's `harnessNoteOf` | runner | the product's own rules; the first smoke's next message was an interrupt line | core `INTERRUPTED`; agent claude-transcript.ts |
| Pre-2026-09-23 CawCo markers typed as the product typed them then | runner | today's parser passes them as the person's words | commit d33fc5795 |
| Another session's words (`agent`) kept as next messages | runner (our call) | an orchestrator's work is acting on its delegates' reports | — |
| `/compact` usage = `modelUsage` − the transcript's last `cost-state` | runner | a resume restores the session's running total | first real smoke; matched `costUSD` to the cent |
| Summariser output from the call's `modelUsage` | runner | stream-json frames carry a message's starting usage | first real smoke |
| systemd-bus probes name the bus | runner | without it they fail on a missing variable, which proves nothing | first real preflight |
| A pinned cockpit worktree at origin/main (f6b63dc6) | runner | the shared checkout can move during the run | our call |
| Runs paced by load and by the hub's live account readings; accounts rotated | runner (our call) | the host and the accounts are the live fleet's | brief: load under 40 |
| A7g on gpt-5.6-terra | runner | the ChatGPT account refuses every Sol and Astra model; terra is the fleet's own model there | the account's answers |
| A7d (OpenCode) not run: its opencode-go key expired | owner | "stop pausing the compact benchmark on opencode, move on!" | owner, 2026-10-25 |
| Chained pairs at most 30 turns apart; only the chained slots redrawn | runner (our call) | 117- and 121-turn replays drained two fleet accounts' windows | first real run |
| Each run's project slugs purged in every account and the shared memory copy, before and after | runner | linked auto memory would carry one run's notes into another | 2026-10-17 leftovers |
| The owner's summary rules 1 and 2 as a secondary judge reading | orchestrator | recorded before any judging | owner-summary-rules-2026-10-21.md |
| No retries, no fallbacks, no other model standing in | owner | standing rule | owner |
| No unit tests; proof is a dry run on a synthetic fixture | owner | standing rule | owner |

## 8. Results

<!-- results:start (written by report.py --paper; do not edit by hand) -->

(not yet run: `python3 -I compaction-bench/report.py --out out --paper compaction-bench/PAPER.md` writes this section)

<!-- results:end -->

## 9. Reproducing

`README.md` gives the run order (tools, cuts, E5, preflight, smoke, floor, main, judge, cost, report).
`python3 -I compaction-bench/run.py --dry --fixture` runs the whole pipeline on the synthetic fixture with every model
reply simulated. It writes its Results into a copy at `out/dry/PAPER.md`, never into this file.

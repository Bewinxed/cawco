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

**Status (2026-10-25).** The model runs were stopped after 57 runs. The cost of every situation and band is settled by
arithmetic over all 24 drawn cuts (§4.10, §8 7b). Quality was then judged at the smallest scope that answers the move
question, on finished runs only: A1 against A0 at the three cuts where both exist, A1 against A2 at five, the 0–5
scores of those arms, and A0's repeat runs for the noise (§8 1c, §8a). The other decisions stay "by cost alone".

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
is the lowest other one under the cap, else the session's own. The pool was the Petralab Team accounts with session
windows only (1c962620, 676d0582, d18c5ce4, c6b14b4e, and from 09:17 UTC 61896e03) and one account in another
organization (e8b553ef, weekly window at 33 % at the start). The account whose weekly window stood at 57 % (3c788add)
was left out. Every start is a line of `out/pace.jsonl` with its account and the readings it saw, and every run's
`result.json` names its accounts.

The 5-hour windows, not the host, bound the run: a unit at a 600k+ cut uses about a tenth of a window, and the fleet
works on the same accounts. Units therefore run arm by arm (A0 and A1 across every cut, then A2, then the rest), so the
readings the decisions rest on arrive first. A run stopped by a session or usage limit is run again later; a run
stopped by anything else (a refusal, "Prompt is too long") stands.

The arm's session continues on a different account from the original session's in every run. That is the cold
regime by construction for every arm alike. It changes nothing within a cut, since all of a cut's arms share it.

**Inputs frozen at the draw.** The DB is read from a `VACUUM INTO` copy, and the transcripts the same way: the draw
copies every transcript a cut reads into `out/transcripts/`, and everything after it reads only those copies. The live
files move between accounts with their sessions and keep growing. c24's 460 MB transcript moved accounts mid-run, and
the run that read its drawn path placed an empty transcript. The copies of the 2026-10-25 draw are 20 files, 1.2 GB,
each checked to hold its cut. Recomputing every price from them changed none of the 55 runs priced from the live files.

### 4.10 Cost by arithmetic

The owner stopped the model runs after 57 had finished: the cost side is arithmetic, and it needs no model call.
`arith.py` prices each drawn cut three ways, in each situation, every request on its own with the product's
`costForUsage`:
- **Whole.** Turn 1's first request reads the context P from cache (warm) or writes it at the 1-hour rate (cold); the
  real session's next 20 turns follow, as they were.
- **Native `/compact`.** One request reads P (warm) or writes it at the 5-minute rate (cold), plus the compaction's
  input and output: 5,176 and 7,515 tokens, the medians of 114 measured manual compactions on Opus. Then the compacted
  prompt S_n is written: the band's median prompt of the first request after a real boundary, 49,610 to 59,006 tokens
  over 155 boundaries.
- **Sonnet summary.** Sonnet reads 0.083 × P (the median ratio of input to P over 12 finished A2 summaries) and writes
  5,069 tokens; the opening turn on the target costs $0.53 as measured; S_s = 68,651 tokens is carried from there.

The next 20 turns are the real session's own requests, each with its cache read moved by (S − P1), so growth and
outputs are real (B5's horizon, per request). Turns before the first one that made a request are skipped (c09, c21).
"Limit gone early" is the cold arithmetic: nothing more runs on the account that ran out, so a compaction can only run
on the target. The situations differ only in the make and turn-1 terms. The measured runs check it where they overlap:
at about 950k, cold, native `/compact` cost $4.58–4.88 to make in the runs; by arithmetic the 600k+ cuts' make runs
from $3.65 to $5.00, median $4.88.

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
| Model runs stopped after 57; cost by arithmetic; no judge call | owner | "the cost side is arithmetic" | owner, via the orchestrator, 2026-10-25 |
| Transcripts snapshotted at the draw; every later step reads the copies | runner | live files move and grow; a moved file emptied a placement | c24, 2026-10-25 |
| Horizon from the first real turn that made a request | runner | a turn with none carries no context | c09, c21 |
| Engine readings without anchors (`judge.py --engine-only`) | runner | the anchors need a model call | orchestrator: no judge calls |
| Quality judged only for the move question: A1 vs A0, A1 vs A2, their 0–5, A0 repeats as noise; under $25 | orchestrator | the smallest scope that answers the pending decision | orchestrator, 2026-10-25 |
| Noise from every cut where A0 has repeats, not only the flagged floor cuts | runner | the floor cuts never got their five runs | 2026-10-25 |
| asked_back taken as a count or a list's length; the 45 lost judgments made again, prompt unchanged | runner | Opus answered with lists, Sonnet with counts | judge replies |
| No retries, no fallbacks, no other model standing in | owner | standing rule | owner |
| No unit tests; proof is a dry run on a synthetic fixture | owner | standing rule | owner |

## 8. Results

<!-- results:start (written by report.py --paper; do not edit by hand) -->

_Written 2026-10-25T11:01:36.026Z. Cuts: 24 (2 chained). Runs: 57 done, 9 stopped. Noise floor: 0.75 (the larger of Nous's 0.3 and the 95th percentile of A0-vs-A0 spread, 0.75)._ 

### 0. Cut points

Seed 1; eligible 256 (+68 chained pairs); drawn 24. Shortfall: 100-300k: 0 chained pairs of 2; 300-600k: 0 chained pairs of 2.

| stratum | value | in the pool | drawn |
|---|---|---|---|
| band | 100-300k | 45 | 8 |
| band | 300-600k | 76 | 8 |
| band | 600k+ | 135 | 8 |
| kind | continued | 8 | 6 |
| kind | moved | 151 | 14 |
| kind | native-midturn | 97 | 4 |
| next message | agent | 140 | 15 |
| next message | person | 74 | 8 |
| next message | resume | 42 | 1 |
| role | delegate | 14 | 0 |
| role | orchestrator | 242 | 24 |
| move | cross-org | 15 | 3 |
| move | same-org | 136 | 11 |

Excluded 2148:

| kind | reason | n |
|---|---|---|
| moved | fewer than 10 turns after the cut | 870 |
| moved | the transcript ends before the move | 229 |
| moved | the session's transcript at the move is not on this host | 228 |
| moved | its directory is not a git repo on this host | 175 |
| moved | context below 100k | 96 |
| native-midturn | fewer than 10 turns after the cut | 83 |
| moved | the next message is cawco's own (ui.system_note) | 70 |
| moved-compacted | the next message is cawco's own (ui.system_note) | 60 |
| moved | another move already cut here | 54 |
| moved-compacted | fewer than 10 turns after the cut | 49 |
| moved | the session went on after the move with no new message | 39 |
| continued | fewer than 10 turns after the cut | 36 |
| native-midturn | its directory is not a git repo on this host | 23 |
| native-midturn | the next message is cawco's own (ui.system_note) | 21 |
| native-midturn | context below 100k | 15 |
| moved | the next message is cawco's own (user.rule) | 12 |
| native | the next message is cawco's own (ui.system_note) | 12 |
| native-midturn | the next message is cawco's own (user.rule) | 12 |
| native-midturn | no turn start before the mid-turn compaction | 10 |
| continued | no turn after the opening | 10 |
| continued | the ended conversation's transcript is not on this host | 9 |
| continued | its directory is not a git repo on this host | 7 |
| native | fewer than 10 turns after the cut | 6 |
| continued | the next message is cawco's own (ui.system_note) | 5 |
| moved-compacted | context below 100k | 3 |
| native | context below 100k | 3 |
| continued | the next message is cawco's own (user.rule) | 3 |
| continued | no instance_conversations row ends at this event | 2 |
| continued | the next conversation's transcript is not on this host | 2 |
| moved | no next message | 1 |
| continued | context below 100k | 1 |
| native-midturn | no CawCo instance for this session | 1 |
| native | no CawCo instance for this session | 1 |

### 1. Decision table

| situation | band | default | setting |
|---|---|---|---|
| warm, same org | all | native at turn end | `compactAtPct` = 99.5 |
| cold / cross-org / no cache | < floor | move whole | `moveWholeUnderK` = below 118k: whole was dearer than a summary at every one of 24 cuts from 118k to 965k (§7b, cost alone; contexts under 100k were not drawn) |
| cold / cross-org / no cache | 100-300k | undecided on quality (no arm has both a quality and a cost reading here); by cost alone (§7b): Sonnet summary (whole $11.86, native /compact $9.37, Sonnet summary $8.39) | `overFloor` = summarize (cost alone; quality unmeasured) |
| limit gone early | 100-300k | undecided on quality (no arm has both a quality and a cost reading here); by cost alone (§7b): Sonnet summary (whole $11.86, native /compact $9.37, Sonnet summary $8.39) (ahead-of-limit unavailable) | `overFloor` = summarize (cost alone; quality unmeasured) |
| cold / cross-org / no cache | 300-600k | undecided on quality (no arm has both a quality and a cost reading here); by cost alone (§7b): Sonnet summary (whole $23.15, native /compact $16.01, Sonnet summary $12.77) | `overFloor` = summarize (cost alone; quality unmeasured) |
| limit gone early | 300-600k | undecided on quality (no arm has both a quality and a cost reading here); by cost alone (§7b): Sonnet summary (whole $23.15, native /compact $16.01, Sonnet summary $12.77) (ahead-of-limit unavailable) | `overFloor` = summarize (cost alone; quality unmeasured) |
| cold / cross-org / no cache | 600k+ | E1: A2 summarize · Sonnet · extract · CawCo; among A1 (2 cuts), A2 (2 cuts) with both readings | `overFloor` = summarize |
| limit gone early | 600k+ | E1: A2 summarize · Sonnet · extract · CawCo; among A1 (2 cuts), A2 (2 cuts) with both readings (ahead-of-limit unavailable) | `overFloor` = summarize |
| warm, same org (by cost) | 100-300k | by cost alone (§7b): native /compact (whole $9.96, native /compact $8.10, Sonnet summary $8.39); quality unmeasured | — |
| warm, same org (by cost) | 300-600k | by cost alone (§7b): Sonnet summary (whole $17.42, native /compact $12.98, Sonnet summary $12.77); quality unmeasured | — |
| warm, same org (by cost) | 600k+ | by cost alone (§7b): native /compact (whole $22.91, native /compact $9.95, Sonnet summary $9.99); quality unmeasured | — |
| (E1 = summarize) | E2 model | A3 − A2: quality – –, cost −$0.5411 [-0.9523, -0.1298]; not actionable: fewer than 2 shared cuts; no quality judgment | `summarizer.model`; the extract and prompt in `continuation.ts` |
| (E1 = summarize) | E3 input | A4 − A2: quality – –, cost +$0.4569 [+0.2733, +0.6406]; not actionable: fewer than 2 shared cuts; no quality judgment | `summarizer.model`; the extract and prompt in `continuation.ts` |
| (E1 = summarize) | E4 shape | A5 − A4: quality – –, cost −$0.3183 [-0.4564, -0.1802]; not actionable: fewer than 2 shared cuts; no quality judgment | `summarizer.model`; the extract and prompt in `continuation.ts` |
| chained | — | undecided: the Factory merge (A6) has no quality reading | whether the summarizer merges the prior summary (Factory) or restates it |

### 1b. Before a move to another organization: compact on the warm account first (A1 warm), or move whole (A0 cold)

A1 warm: `/compact` priced with its read of the context from the warm cache (the session's own account), then the continued turn and the horizon on the target, cold (another organization shares no cache). A0 cold: the whole context written to the target's cache by the continued turn's first request, then the horizon. Paired per cut; difference A1 warm − A0 cold; 95 % bootstrap CI over cuts.

| band | cuts | A0 cold total K | A1 warm total K | median Δ (A1w − A0c) | CI | A1 cheaper at | quality Δ A1 − A0 Opus | quality Δ A1 − A0 Sonnet | A1 vs A0 pairwise Opus w/t/l |
|---|---|---|---|---|---|---|---|---|---|
| 100-300k | 0 | – | – | – | – | 0 of 0 | – – | – – | 1/0/0 |
| 300-600k | 0 | – | – | – | – | 0 of 0 | – – | – – | 0/0/0 |
| 600k+ | 0 | – | – | – | – | 0 of 0 | – – | – – | 0/0/0 |
| all | 0 | – | – | – | – | 0 of 0 | – – | – – | 1/0/0 |

Per cut (context at the cut → A1 warm, A0 cold, Δ): –

By arithmetic over every drawn cut (§7b): compact warm, then move = native `/compact` reading the context from the warm cache, then the compacted prompt written on the target; move whole = the whole context written on the target. Total over the next 20 real turns, USD.

| band | cuts | move whole (cold) | compact warm, then move | Δ | compact-first cheaper at | Sonnet summary, then move |
|---|---|---|---|---|---|---|
| 100-300k | 8 | $11.86 | $8.10 | -4.24 [-4.82, -2.99] | 8 of 8 | $8.39 |
| 300-600k | 8 | $23.15 | $12.98 | -10.16 [-14.87, -9.87] | 8 of 8 | $12.77 |
| 600k+ | 8 | $30.24 | $9.95 | -19.47 [-27.18, -15.58] | 8 of 8 | $9.99 |
| all | 24 | $21.08 | $9.98 | -10.16 [-16.00, -8.90] | 24 of 24 | $10.06 |

Moving whole was not possible at all at 2 cuts: every A0 run there stopped on "Prompt is too long" (c20 958k, c23 965k); the real sessions compacted there.

### 1c. Judged pairs (both orders, both judges; a win or loss counts only when both orders agree)

Noise: the A0 runs of one cut against each other (§4): 0-5 spread, Opus, 0.00, 0.00, 1.25, 0.75; the floor used is 0.75.

| pair | cut | run | Opus (arm-first, control-first) | Opus | Sonnet (arm-first, control-first) | Sonnet | judges agree |
|---|---|---|---|---|---|---|---|
| A1 vs A0 | c01 | 1 | win, win | win | win, win | win | yes |
| A1 vs A0 | c17 | 1 | loss, loss | loss | win, win | win | no |
| A1 vs A0 | c17 | 2 | win, loss | tie | loss, loss | loss | no |
| A1 vs A0 | c17 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c18 | 1 | win, win | win | win, loss | tie | no |
| A1 vs A0 | c18 | 2 | loss, loss | loss | win, win | win | no |
| A1 vs A0 | c18 | 3 | win, win | win | win, win | win | yes |
| A1 vs A2 | c01 | 1 | win, win | win | win, win | win | yes |
| A1 vs A2 | c17 | 1 | loss, loss | loss | win, win | win | no |
| A1 vs A2 | c17 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A2 | c17 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A2 | c18 | 1 | win, win | win | win, win | win | yes |
| A1 vs A2 | c18 | 3 | win, win | win | win, win | win | yes |
| A1 vs A2 | c20 | 1 | win, win | win | win, win | win | yes |
| A1 vs A2 | c20 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A2 | c20 | 3 | win, win | win | win, win | win | yes |
| A1 vs A2 | c23 | 1 | win, win | win | win, win | win | yes |
| A1 vs A2 | c23 | 2 | win, win | win | win, win | win | yes |
| A1 vs A2 | c23 | 3 | win, win | win | loss, loss | loss | no |

| pair | judged pairs | Opus win/tie/loss | Sonnet win/tie/loss | judges agree | both judges say the arm lost |
|---|---|---|---|---|---|
| A1 vs A0 | 7 | 3/1/3 | 4/1/2 | 3 of 7 | 1 |
| A1 vs A2 | 12 | 8/0/4 | 8/0/4 | 10 of 12 | 3 |

0-5 (mean of the four dimensions; median over runs) per cut, Opus / Sonnet:

| cut | A0 | A1 | A2 | A1 − A0 | A2 − A0 |
|---|---|---|---|---|---|
| c01 | 3.00 / 1.25 | 3.25 / 2.00 | 1.00 / 0.75 | +0.25 / +0.75 | -2.00 / -0.50 |
| c17 | 2.50 / 1.50 | 1.25 / 1.25 | 1.75 / 1.75 | -1.25 / -0.25 | -0.75 / +0.25 |
| c18 | 3.25 / 1.50 | 2.50 / 1.25 | 2.38 / 1.25 | -0.75 / -0.25 | -0.88 / -0.25 |
| c20 | – / – | 2.75 / 2.50 | 2.25 / 1.75 | – | – |
| c23 | – / – | 3.50 / 3.25 | 3.00 / 2.75 | – | – |

Per dimension, median over every judged run, Opus / Sonnet:

| arm | runs | decision_fidelity | artifact_fidelity | continuation_fidelity | no_repetition |
|---|---|---|---|---|---|
| A0 | 7 | 3.0 / 2.0 | 3.0 / 2.0 | 1.0 / 1.0 | 4.0 / 2.0 |
| A1 | 13 | 3.0 / 2.0 | 3.0 / 2.0 | 2.0 / 2.0 | 3.0 / 3.0 |
| A2 | 12 | 2.0 / 2.0 | 2.5 / 1.5 | 2.0 / 1.5 | 3.0 / 2.5 |

### 2. Quality per arm (median over runs, then over cuts)

| arm | what | cuts | abs 0-5 Opus | abs 0-5 Sonnet | win/tie/loss vs A0 Opus | win/tie/loss vs A0 Sonnet | asked back | files J | commands J | re-fetches | anchor keys carried | probe score Opus | probe score Sonnet | summary rules 1 / 2 Opus | summary rules 1 / 2 Sonnet |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A0 | whole (control) | 3 | 2.88 | 1.50 | — | — | – | 0.00 | 0.00 | 0.0 | 1.00 | – | – | – | – |
| A1 | native /compact | 5 | 2.62 | 1.88 | 3/1/3 | 4/1/2 | 0.0 | 0.00 | 0.00 | 0.0 | 0.36 | – | – | – | – |
| A2 | summarize · Sonnet · extract · CawCo | 5 | 2.31 | 1.75 | 0/0/0 | 0/0/0 | – | 0.00 | 0.00 | 0.0 | 0.29 | – | – | – | – |
| A3 | summarize · Haiku · extract · CawCo | 3 | – | – | 0/0/0 | 0/0/0 | – | 1.00 | 0.00 | 0.0 | 0.09 | – | – | – | – |
| A4 | summarize · Sonnet · full-clipped · CawCo | 3 | – | – | 0/0/0 | 0/0/0 | – | 1.00 | 0.00 | 0.0 | 0.36 | – | – | – | – |
| A5 | summarize · Sonnet · full-clipped · Claude Code shape | 3 | – | – | 0/0/0 | 0/0/0 | – | 1.00 | 0.00 | 0.0 | 0.36 | – | – | – | – |
| A6 | Factory anchored merge (chained) | 2 | – | – | 0/0/0 | 0/0/0 | – | 0.00 | 0.00 | 0.0 | 0.46 | – | – | – | – |

Summary rules: the owner's rules for a compaction summary (2026-10-21), 0-5 each, on the summary the arm carried (A1: Claude Code's; A2-A7: the summariser's): 1, the person's messages carried as meaning, never quoted; 2, only what the next turns need. Median over runs, then over cuts. Secondary: it enters no decision.

Cuts: those with at least one finished run. Files J and commands J are Jaccard similarities with the real turn's edited files and commands; two empty sets count as 1 (neither turn edited a file), and a command matches only verbatim, so commands J is near 0 wherever wording differs. A blank judge column means no judgment was made.

### 2b. Quality and cost by stratum (Opus absolute 0-5; cold total at K)

| arm | stratum | value | cuts | abs 0-5 Opus | total K (USD) |
|---|---|---|---|---|---|
| A0 | next message | agent | 2 | 2.88 | 20.8591 |
| A0 | kind | native-midturn | 2 | 2.88 | 20.8591 |
| A1 | next message | agent | 3 | 2.50 | 22.6370 |
| A1 | next message | person | 1 | 2.75 | 30.3828 |
| A1 | kind | continued | 1 | 2.75 | 30.3828 |
| A1 | kind | native-midturn | 3 | 2.50 | 22.6370 |
| A2 | next message | agent | 3 | 2.38 | 23.3527 |
| A2 | next message | person | 1 | 2.25 | 26.4339 |
| A2 | kind | continued | 1 | 2.25 | 26.4339 |
| A2 | kind | native-midturn | 3 | 2.38 | 23.3527 |
| A3 | next message | agent | 1 | – | 55.1294 |
| A3 | next message | person | 1 | – | 26.3041 |
| A3 | kind | continued | 1 | – | 26.3041 |
| A3 | kind | native-midturn | 1 | – | 55.1294 |
| A4 | next message | agent | 1 | – | 56.3550 |
| A4 | next message | person | 1 | – | 27.0745 |
| A4 | kind | continued | 1 | – | 27.0745 |
| A4 | kind | native-midturn | 1 | – | 56.3550 |
| A5 | next message | agent | 1 | – | 56.1748 |
| A5 | next message | person | 1 | – | 26.6181 |
| A5 | kind | continued | 1 | – | 26.6181 |
| A5 | kind | native-midturn | 1 | – | 56.1748 |
| A6 | next message | agent | 1 | – | 11.5083 |
| A6 | kind | native-midturn | 1 | – | 11.5083 |

### 3. Cost per arm, per regime and band (USD; median over runs, then over cuts; product prices, each request on its own)

| arm | band | regime | C_make | C_between | C_turn1 | C_horizon(K) | total K | total K=20 | total K=50 | CI total K vs A0 |
|---|---|---|---|---|---|---|---|---|---|---|
| A0 | 100-300k | cold | 0.0000 | 0.0000 | 0.7795 | 42.9006 | 43.6801 | 7.1328 | 31.7704 | – |
| A0 | 100-300k | warm | 0.0000 | 0.0000 | 0.1181 | 42.9006 | 43.0187 | 6.4714 | 31.1090 | – |
| A0 | chained | cold | 0.0000 | 0.0000 | 6.7797 | 14.1778 | 20.9575 | 19.1592 | – | – |
| A0 | chained | warm | 0.0000 | 0.0000 | 0.7330 | 14.1778 | 14.9109 | 13.1125 | – | – |
| A1 | 100-300k | cold | 0.6052 | 0.0000 | 0.3928 | 36.6155 | 37.6135 | 5.7401 | 27.1024 | – |
| A1 | 100-300k | warm | 0.2401 | 0.0000 | 0.3928 | 36.6155 | 37.2484 | 5.3750 | 26.7373 | – |
| A1 | 600k+ | cold | 4.6673 | 0.0000 | 0.9117 | 40.0907 | 45.9194 | 19.4159 | 28.6264 | – |
| A1 | 600k+ | warm | 0.4556 | 0.0000 | 0.9117 | 40.0907 | 41.6921 | 15.1886 | 24.5128 | – |
| A1 | chained | cold | 4.7428 | 7.4606 | 0.9053 | 7.9296 | 21.2053 | 20.4542 | – | [-3.6266, +2.9818] |
| A1 | chained | warm | 0.6902 | 7.4606 | 0.9053 | 7.9296 | 17.1590 | 16.4079 | – | [-0.8440, +4.2000] |
| A2 | 100-300k | cold | 0.4297 | 0.0000 | 0.1084 | 37.1969 | 37.7350 | 5.4293 | 27.0946 | – |
| A2 | 100-300k | warm | 0.4297 | 0.0000 | 0.1084 | 37.1969 | 37.7350 | 5.4293 | 27.0946 | – |
| A2 | 600k+ | cold | 1.1110 | 0.0000 | 0.2358 | 40.6331 | 42.1907 | 15.6030 | 23.9750 | – |
| A2 | 600k+ | warm | 1.1110 | 0.0000 | 0.2358 | 40.6331 | 42.1907 | 15.6030 | 23.9750 | – |
| A2 | chained | cold | 1.0878 | 5.6258 | 0.2114 | 6.9875 | 13.9741 | 12.6742 | – | [-10.1023, +3.6975] |
| A2 | chained | warm | 1.0878 | 5.6258 | 0.2114 | 6.9875 | 13.9741 | 12.6742 | – | [-2.9935, +8.6821] |
| A3 | 100-300k | cold | 0.4044 | 0.0000 | 0.2621 | 37.4710 | 38.1376 | 5.6280 | 27.4361 | – |
| A3 | 100-300k | warm | 0.4044 | 0.0000 | 0.2621 | 37.4710 | 38.1376 | 5.6280 | 27.4361 | – |
| A3 | 600k+ | cold | 0.7332 | 0.0000 | 0.2640 | 40.5679 | 41.8374 | 15.1263 | 23.1641 | – |
| A3 | 600k+ | warm | 0.7332 | 0.0000 | 0.2640 | 40.5679 | 41.8374 | 15.1263 | 23.1641 | – |
| A4 | 100-300k | cold | 0.4289 | 0.0000 | 0.1441 | 37.1389 | 37.7120 | 5.4494 | 27.0844 | – |
| A4 | 100-300k | warm | 0.4289 | 0.0000 | 0.1441 | 37.1389 | 37.7120 | 5.4494 | 27.0844 | – |
| A4 | 600k+ | cold | 1.5490 | 0.0000 | 0.1961 | 40.5019 | 42.3038 | 15.8786 | 24.2631 | – |
| A4 | 600k+ | warm | 1.5490 | 0.0000 | 0.1961 | 40.5019 | 42.3038 | 15.8786 | 24.2631 | – |
| A5 | 100-300k | cold | 0.3653 | 0.0000 | 0.0821 | 36.8895 | 37.3369 | 5.2599 | 26.7649 | – |
| A5 | 100-300k | warm | 0.3653 | 0.0000 | 0.0821 | 36.8895 | 37.3369 | 5.2599 | 26.7649 | – |
| A5 | 600k+ | cold | 1.4413 | 0.0000 | 0.2752 | 39.7444 | 41.3898 | 16.1126 | 24.1462 | – |
| A5 | 600k+ | warm | 1.4413 | 0.0000 | 0.2752 | 39.7444 | 41.3898 | 16.1126 | 24.1462 | – |
| A6 | chained | cold | 1.1983 | 3.6263 | 0.1396 | 6.9843 | 11.9796 | 10.6828 | – | – |
| A6 | chained | warm | 1.1983 | 3.6263 | 0.1396 | 6.9843 | 11.9796 | 10.6828 | – | – |

Window percent of the cold total at K, where the account's readings measure it:

| cut | arm | run | window % |
|---|---|---|---|
| c01 | A0 | 1 | session 15.335, weekly_all 3.530, weekly_scoped/Fable 0.788 |
| c01 | A1 | 1 | session 12.807, weekly_all 2.948, weekly_scoped/Fable 0.658 |
| c01 | A2 | 1 | session 12.969, weekly_all 2.986, weekly_scoped/Fable 0.666 |
| c01 | A3 | 1 | session 13.145, weekly_all 3.026, weekly_scoped/Fable 0.675 |
| c01 | A4 | 1 | session 12.959, weekly_all 2.983, weekly_scoped/Fable 0.666 |
| c01 | A5 | 1 | session 12.823, weekly_all 2.952, weekly_scoped/Fable 0.659 |
| c17 | A0 | 1 | session 11.536, weekly_all –, weekly_scoped/Fable 0.126 |
| c17 | A0 | 2 | session 11.535, weekly_all –, weekly_scoped/Fable 0.126 |
| c17 | A0 | 3 | session 11.537, weekly_all –, weekly_scoped/Fable 0.126 |
| c17 | A1 | 1 | session 4.908, weekly_all –, weekly_scoped/Fable 0.054 |
| c17 | A1 | 2 | session 4.928, weekly_all –, weekly_scoped/Fable 0.054 |
| c17 | A1 | 3 | session 4.978, weekly_all –, weekly_scoped/Fable 0.055 |
| c17 | A2 | 1 | session 3.426, weekly_all –, weekly_scoped/Fable 0.038 |
| c17 | A2 | 2 | session 3.345, weekly_all –, weekly_scoped/Fable 0.037 |
| c17 | A2 | 3 | session 3.310, weekly_all –, weekly_scoped/Fable 0.036 |
| c17 | A6 | 1 | session 3.494, weekly_all –, weekly_scoped/Fable 0.038 |
| c17 | A6 | 2 | session 3.380, weekly_all –, weekly_scoped/Fable 0.037 |
| c17 | A6 | 3 | session 3.430, weekly_all –, weekly_scoped/Fable 0.038 |
| c18 | A0 | 1 | session 10.107, weekly_all –, weekly_scoped/Fable 0.111 |
| c18 | A0 | 2 | session 10.324, weekly_all –, weekly_scoped/Fable 0.113 |
| c18 | A0 | 3 | session 10.197, weekly_all –, weekly_scoped/Fable 0.112 |
| c18 | A1 | 1 | session 6.171, weekly_all –, weekly_scoped/Fable 0.068 |
| c18 | A1 | 2 | session 6.354, weekly_all –, weekly_scoped/Fable 0.070 |
| c18 | A1 | 3 | session 6.117, weekly_all –, weekly_scoped/Fable 0.067 |
| c18 | A2 | 1 | session 4.436, weekly_all –, weekly_scoped/Fable 0.049 |
| c18 | A2 | 3 | session 4.487, weekly_all –, weekly_scoped/Fable 0.049 |
| c18 | A6 | 1 | session 4.695, weekly_all –, weekly_scoped/Fable 0.051 |
| c20 | A1 | 1 | session 9.090, weekly_all 2.093, weekly_scoped/Fable 0.467 |
| c20 | A1 | 2 | session 9.259, weekly_all 2.131, weekly_scoped/Fable 0.476 |
| c20 | A1 | 3 | session 9.295, weekly_all 2.140, weekly_scoped/Fable 0.477 |
| c20 | A2 | 1 | session 8.618, weekly_all 1.984, weekly_scoped/Fable 0.443 |
| c20 | A2 | 2 | session 9.535, weekly_all 2.195, weekly_scoped/Fable 0.490 |
| c20 | A2 | 3 | session 8.697, weekly_all 2.002, weekly_scoped/Fable 0.447 |
| c20 | A3 | 1 | session 8.663, weekly_all 1.994, weekly_scoped/Fable 0.445 |
| c20 | A3 | 2 | session 9.549, weekly_all 2.198, weekly_scoped/Fable 0.490 |
| c20 | A3 | 3 | session 8.714, weekly_all 2.006, weekly_scoped/Fable 0.448 |
| c20 | A4 | 1 | session 9.470, weekly_all 2.180, weekly_scoped/Fable 0.486 |
| c20 | A4 | 2 | session 8.668, weekly_all 1.995, weekly_scoped/Fable 0.445 |
| c20 | A4 | 3 | session 8.943, weekly_all 2.059, weekly_scoped/Fable 0.459 |
| c20 | A5 | 1 | session 8.648, weekly_all 1.991, weekly_scoped/Fable 0.444 |
| c20 | A5 | 2 | session 8.794, weekly_all 2.024, weekly_scoped/Fable 0.452 |
| c20 | A5 | 3 | session 8.771, weekly_all 2.019, weekly_scoped/Fable 0.451 |
| c23 | A1 | 1 | session 21.628, weekly_all 4.979, weekly_scoped/Fable 1.111 |
| c23 | A1 | 2 | session 21.669, weekly_all 4.988, weekly_scoped/Fable 1.113 |
| c23 | A1 | 3 | session 21.691, weekly_all 4.993, weekly_scoped/Fable 1.114 |
| c23 | A2 | 1 | session 20.387, weekly_all 4.693, weekly_scoped/Fable 1.047 |
| c23 | A2 | 2 | session 20.220, weekly_all 4.655, weekly_scoped/Fable 1.039 |
| c23 | A2 | 3 | session 20.690, weekly_all 4.763, weekly_scoped/Fable 1.063 |
| c23 | A3 | 1 | session 20.237, weekly_all 4.658, weekly_scoped/Fable 1.039 |
| c23 | A3 | 2 | session 20.219, weekly_all 4.654, weekly_scoped/Fable 1.039 |
| c23 | A3 | 3 | session 20.207, weekly_all 4.652, weekly_scoped/Fable 1.038 |
| c23 | A4 | 1 | session 20.508, weekly_all 4.721, weekly_scoped/Fable 1.053 |
| c23 | A4 | 2 | session 20.449, weekly_all 4.707, weekly_scoped/Fable 1.050 |
| c23 | A4 | 3 | session 20.927, weekly_all 4.817, weekly_scoped/Fable 1.075 |
| c23 | A5 | 1 | session 20.446, weekly_all 4.707, weekly_scoped/Fable 1.050 |
| c23 | A5 | 2 | session 21.215, weekly_all 4.884, weekly_scoped/Fable 1.090 |
| c23 | A5 | 3 | session 20.394, weekly_all 4.695, weekly_scoped/Fable 1.048 |

### 4. Noise floor (A0 run 1 against the other A0 runs of the same cut, wherever A0 has repeats)

Floor cuts: c17, c18. Absolute spreads (Opus): 0.00, 0.00, 1.25, 0.75; 95th percentile 0.75; floor used 0.75.

| cut | run | judge | outcome(s) |
|---|---|---|---|
| c17 | 2 | opus | loss, win |
| c17 | 2 | sonnet | win |
| c17 | 3 | opus | win |
| c17 | 3 | sonnet | win |
| c18 | 2 | opus | loss, win |
| c18 | 2 | sonnet | loss |
| c18 | 3 | opus | win |
| c18 | 3 | sonnet | loss, win |

### 5. Judge disagreements (Opus vs Sonnet)

| cut | arm | run | reading | Opus | Sonnet |
|---|---|---|---|---|---|
| c01 | A0 | 1 | absolute | 3.00 | 1.25 |
| c01 | A1 | 1 | absolute | 3.25 | 2.00 |
| c17 | A0 | 1 | absolute | 2.50 | 1.25 |
| c17 | A1 | 1 | pairwise | loss | win |
| c17 | A1 | 2 | pairwise | tie | loss |
| c18 | A0 | 2 | absolute | 3.75 | 1.25 |
| c18 | A1 | 1 | absolute | 2.50 | 1.25 |
| c18 | A1 | 1 | pairwise | win | tie |
| c18 | A1 | 2 | pairwise | loss | win |
| c18 | A2 | 1 | absolute | 2.50 | 1.25 |
| c23 | A2 | 2 | absolute | 3.75 | 2.50 |

### 6. E5: warm native compaction, window cost

Boundaries priced: 169 (140 manual, 29 auto). Left out: no summary record after it 233, no instance 5.
Formula: a cache read of preTokens plus the summary record's tokens (the product's estimateTokens), priced with costForUsage at the boundary's time; window % = weightedTokens / tokensPerPercent.

Calibration against the manual compactions whose turn_usage row was measured:

| model | preTokens | summary tokens (est.) | measured: read / write / input / output | measured $ | formula $ | formula ÷ measured | measured window % | formula window % |
|---|---|---|---|---|---|---|---|---|
| claude-opus-5-5 | 939,938 | 3,733 | 937,257 / 0 / 4,492 / 5,425 | 0.3139 | 0.2626 | 0.84 | session 0.103, weekly_all 0.024, weekly_scoped/Fable 0.005 | session 0.093, weekly_all 0.021, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 469,991 | 4,041 | 463,316 / 3,109 / 5,305 / 5,969 | 0.2488 | 0.1748 | 0.70 | session 0.215, weekly_scoped/Fable 0.003 | session 0.170, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 694,967 | 5,938 | 691,315 / 0 / 5,363 / 9,267 | 0.3451 | 0.2578 | 0.75 | session 0.096, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.078, weekly_all 0.011, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 403,178 | 6,032 | 391,418 / 5,393 / 7,459 / 9,213 | 0.3193 | 0.2013 | 0.63 | session 0.251, weekly_scoped/Fable 0.003 | session 0.178, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 51,072 | 2,567 | 47,453 / 0 / 5,262 / 3,621 | 0.1030 | 0.0616 | 0.60 | session 0.022, weekly_all 0.003, weekly_scoped/Fable 0.001 | session 0.014, weekly_all 0.002, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 270,640 | 4,044 | 267,243 / 1,573 / 3,719 / 6,368 | 0.1018 | 0.0675 | 0.66 | session 0.162, weekly_scoped/Fable 0.002 | session 0.119, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 229,456 | 3,838 | 225,437 / 1,812 / 3,978 / 6,339 | 0.0984 | 0.0613 | 0.62 | session 0.153, weekly_scoped/Fable 0.002 | session 0.106, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 795,420 | 6,284 | 792,135 / 0 / 5,127 / 8,955 | 0.3580 | 0.2848 | 0.80 | session 0.102, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.088, weekly_all 0.013, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 323,140 | 5,327 | 313,930 / 4,256 / 6,343 / 8,587 | 0.2812 | 0.1712 | 0.61 | session 0.217, weekly_scoped/Fable 0.003 | session 0.149, weekly_scoped/Fable 0.002 |
| claude-sonnet-5-5 | 253,076 | 2,547 | 250,216 / 1,377 / 3,495 / 3,938 | 0.0748 | 0.0508 | 0.68 | session 0.126, weekly_scoped/Fable 0.002 | session 0.096, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 329,130 | 3,055 | 326,940 / 985 / 3,095 / 5,016 | 0.0915 | 0.0635 | 0.69 | session 0.157, weekly_scoped/Fable 0.002 | session 0.122, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 410,007 | 5,004 | 402,396 / 3,295 / 5,480 / 7,771 | 0.2743 | 0.1821 | 0.66 | session 0.224, weekly_scoped/Fable 0.003 | session 0.167, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 843,363 | 3,979 | 839,595 / 0 / 5,673 / 8,322 | 0.3571 | 0.2483 | 0.70 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.082, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 615,170 | 4,763 | 606,269 / 4,557 / 6,131 / 9,208 | 0.3527 | 0.2183 | 0.62 | session 0.299, weekly_scoped/Fable 0.004 | session 0.215, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 630,775 | 5,257 | 625,241 / 0 / 7,409 / 8,941 | 0.3335 | 0.2313 | 0.69 | session 0.091, weekly_all 0.013, weekly_scoped/Fable 0.004 | session 0.071, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 432,036 | 3,972 | 421,049 / 3,796 / 9,067 / 7,040 | 0.2803 | 0.1658 | 0.59 | session 0.230, weekly_scoped/Fable 0.003 | session 0.159, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 876,183 | 5,279 | 867,377 / 0 / 10,580 / 8,507 | 0.3859 | 0.2808 | 0.73 | session 0.111, weekly_all 0.016, weekly_scoped/Fable 0.005 | session 0.090, weekly_all 0.013, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 385,215 | 3,756 | 371,831 / 6,634 / 8,652 / 8,030 | 0.3027 | 0.1522 | 0.50 | session 0.238, weekly_scoped/Fable 0.003 | session 0.145, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 791,408 | 4,840 | 783,784 / 0 / 9,212 / 7,589 | 0.3454 | 0.2551 | 0.74 | session 0.099, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.082, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 520,166 | 4,304 | 502,962 / 9,037 / 9,798 / 8,189 | 0.3487 | 0.1901 | 0.55 | session 0.284, weekly_scoped/Fable 0.003 | session 0.186, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 947,858 | 7,299 | 941,822 / 0 / 7,899 / 10,098 | 0.4219 | 0.3356 | 0.80 | session 0.121, weekly_all 0.017, weekly_scoped/Fable 0.006 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 160,364 | 4,781 | 159,921 / 214 / 2,078 / 7,458 | 0.1905 | 0.1277 | 0.67 | session 0.086, weekly_scoped/Fable 0.001 | session 0.062, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 130,425 | 1,317 | 125,951 / 2,127 / 3,492 / 1,900 | 0.0878 | 0.0524 | 0.60 | session 0.044, weekly_scoped/Fable 0.000 | session 0.030, weekly_scoped/Fable 0.000 |
| claude-opus-5-5 | 160,364 | 4,781 | 159,921 / 214 / 2,078 / 7,458 | 0.1905 | 0.1277 | 0.67 | session 0.086, weekly_scoped/Fable 0.001 | session 0.062, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 137,133 | 2,124 | 134,977 / 466 / 2,372 / 3,450 | 0.1078 | 0.0699 | 0.65 | session 0.052, weekly_scoped/Fable 0.001 | session 0.038, weekly_scoped/Fable 0.000 |
| claude-opus-5-5 | 160,364 | 4,781 | 159,921 / 214 / 2,078 / 7,458 | 0.1905 | 0.1277 | 0.67 | session 0.086, weekly_scoped/Fable 0.001 | session 0.062, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 130,425 | 1,317 | 125,951 / 2,127 / 3,492 / 1,900 | 0.0878 | 0.0524 | 0.60 | session 0.044, weekly_scoped/Fable 0.000 | session 0.030, weekly_scoped/Fable 0.000 |
| claude-opus-5-5 | 871,215 | 4,877 | 864,418 / 3,392 / 5,198 / 10,102 | 0.4127 | 0.2718 | 0.66 | session 0.357, weekly_scoped/Fable 0.008 | session 0.272, weekly_scoped/Fable 0.006 |
| claude-opus-5-5 | 864,502 | 5,338 | 860,975 / 0 / 5,604 / 8,000 | 0.3546 | 0.2797 | 0.79 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.090, weekly_all 0.013, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 489,661 | 5,046 | 483,584 / 2,955 / 5,154 / 8,125 | 0.2946 | 0.1989 | 0.67 | session 0.247, weekly_scoped/Fable 0.003 | session 0.187, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 916,135 | 6,115 | 916,003 / 0 / 2,197 / 11,488 | 0.4217 | 0.3055 | 0.72 | session 0.120, weekly_all 0.017, weekly_scoped/Fable 0.006 | session 0.097, weekly_all 0.014, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 569,410 | 4,580 | 561,710 / 3,609 / 5,789 / 6,464 | 0.2828 | 0.2055 | 0.73 | session 0.249, weekly_scoped/Fable 0.003 | session 0.202, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 337,747 | 5,072 | 336,995 / 0 / 2,898 / 7,675 | 0.2325 | 0.1690 | 0.73 | session 0.062, weekly_all 0.014, weekly_scoped/Fable 0.003 | session 0.049, weekly_all 0.011, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 627,325 | 6,113 | 619,281 / 3,862 / 6,088 / 8,826 | 0.3440 | 0.2477 | 0.72 | session 0.269, weekly_scoped/Fable 0.007 | session 0.215, weekly_scoped/Fable 0.006 |
| claude-opus-5-5 | 190,621 | 4,506 | 186,709 / 0 / 5,208 / 7,547 | 0.2091 | 0.1282 | 0.61 | session 0.051, weekly_all 0.012, weekly_scoped/Fable 0.003 | session 0.034, weekly_all 0.008, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 754,282 | 6,274 | 750,777 / 0 / 5,740 / 9,434 | 0.3618 | 0.2763 | 0.76 | session 0.105, weekly_all 0.024, weekly_scoped/Fable 0.005 | session 0.088, weekly_all 0.020, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 826,903 | 3,136 | 824,545 / 0 / 4,385 / 4,216 | 0.2668 | 0.2281 | 0.86 | session 0.089, weekly_all 0.020, weekly_scoped/Fable 0.005 | session 0.081, weekly_all 0.019, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 114,145 | 3,000 | 110,690 / 0 / 4,909 / 4,023 | 0.1222 | 0.0828 | 0.68 | session 0.030, weekly_all 0.007, weekly_scoped/Fable 0.002 | session 0.022, weekly_all 0.005, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 582,770 | 4,004 | 582,490 / 253 / 2,001 / 8,736 | 0.3005 | 0.1966 | 0.65 | session 0.224, weekly_scoped/Fable 0.003 | session 0.168, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 547,829 | 4,673 | 543,316 / 0 / 5,366 / 6,759 | 0.2653 | 0.2030 | 0.77 | session 0.074, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.062, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 173,082 | 3,698 | 166,602 / 2,872 / 5,071 / 5,067 | 0.1693 | 0.1086 | 0.64 | session 0.128, weekly_scoped/Fable 0.002 | session 0.090, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 584,569 | 6,158 | 580,148 / 0 / 5,863 / 9,215 | 0.3238 | 0.2401 | 0.74 | session 0.087, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.071, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 367,384 | 4,101 | 358,552 / 3,987 / 6,200 / 5,852 | 0.2335 | 0.1555 | 0.67 | session 0.193, weekly_scoped/Fable 0.002 | session 0.144, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 275,827 | 4,671 | 270,827 / 2,207 / 4,368 / 6,730 | 0.2173 | 0.1486 | 0.68 | session 0.171, weekly_scoped/Fable 0.002 | session 0.129, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 873,428 | 3,055 | 869,560 / 0 / 5,804 / 5,997 | 0.3171 | 0.2358 | 0.74 | session 0.097, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.081, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 696,976 | 3,993 | 696,523 / 0 / 2,119 / 7,078 | 0.2893 | 0.2193 | 0.76 | session 0.085, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.071, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 240,759 | 4,020 | 225,039 / 7,545 / 9,655 / 7,218 | 0.2657 | 0.1286 | 0.48 | session 0.196, weekly_scoped/Fable 0.002 | session 0.111, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 844,478 | 4,199 | 843,832 / 0 / 2,111 / 7,448 | 0.3262 | 0.2529 | 0.78 | session 0.098, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.083, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 492,945 | 4,271 | 491,835 / 433 / 2,188 / 8,577 | 0.2808 | 0.1840 | 0.66 | session 0.239, weekly_scoped/Fable 0.003 | session 0.178, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 540,506 | 4,156 | 539,897 / 0 / 2,194 / 7,516 | 0.2671 | 0.1912 | 0.72 | session 0.074, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.059, weekly_all 0.008, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 578,558 | 4,383 | 567,268 / 5,178 / 7,238 / 7,734 | 0.3230 | 0.2034 | 0.63 | session 0.275, weekly_scoped/Fable 0.003 | session 0.201, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 473,480 | 4,605 | 466,646 / 0 / 8,298 / 8,466 | 0.2958 | 0.1868 | 0.63 | session 0.077, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.056, weekly_all 0.008, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 578,558 | 4,383 | 567,268 / 5,178 / 7,238 / 7,734 | 0.3230 | 0.2034 | 0.63 | session 0.275, weekly_scoped/Fable 0.003 | session 0.201, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 181,180 | 4,050 | 175,409 / 2,356 / 4,500 / 5,819 | 0.1812 | 0.1172 | 0.65 | session 0.136, weekly_scoped/Fable 0.002 | session 0.097, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 424,772 | 4,464 | 421,252 / 0 / 5,020 / 6,550 | 0.2353 | 0.1742 | 0.74 | session 0.063, weekly_all 0.009, weekly_scoped/Fable 0.003 | session 0.051, weekly_all 0.007, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 259,291 | 5,632 | 250,142 / 4,356 / 6,537 / 9,071 | 0.2794 | 0.1645 | 0.59 | session 0.208, weekly_scoped/Fable 0.002 | session 0.137, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 388,503 | 5,725 | 384,378 / 0 / 5,659 / 8,419 | 0.2679 | 0.1922 | 0.72 | session 0.068, weekly_all 0.010, weekly_scoped/Fable 0.003 | session 0.053, weekly_all 0.008, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 763,657 | 4,943 | 759,075 / 0 / 6,168 / 7,958 | 0.3356 | 0.2516 | 0.75 | session 0.096, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.080, weekly_all 0.011, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 735,289 | 7,331 | 732,009 / 0 / 4,644 / 10,748 | 0.3799 | 0.2937 | 0.77 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.087, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 653,700 | 5,529 | 651,135 / 0 / 4,322 / 8,386 | 0.3152 | 0.2413 | 0.77 | session 0.088, weekly_all 0.013, weekly_scoped/Fable 0.004 | session 0.074, weekly_all 0.011, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 549,395 | 5,865 | 542,806 / 3,074 / 5,269 / 9,003 | 0.3251 | 0.2272 | 0.70 | session 0.249, weekly_scoped/Fable 0.007 | session 0.194, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 781,181 | 7,717 | 770,786 / 5,003 / 7,273 / 11,927 | 0.4468 | 0.3106 | 0.70 | session 0.323, weekly_scoped/Fable 0.005 | session 0.251, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 399,417 | 4,180 | 396,739 / 0 / 4,545 / 6,040 | 0.2183 | 0.1635 | 0.75 | session 0.059, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.048, weekly_all 0.007, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 542,615 | 5,150 | 542,164 / 270 / 2,119 / 10,228 | 0.3228 | 0.2115 | 0.66 | session 0.232, weekly_scoped/Fable 0.003 | session 0.172, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 283,449 | 5,274 | 278,848 / 2,119 / 4,274 / 8,075 | 0.2450 | 0.1622 | 0.66 | session 0.116, weekly_scoped/Fable 0.001 | session 0.085, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 623,475 | 3,346 | 619,756 / 0 / 5,226 / 5,092 | 0.2467 | 0.1916 | 0.78 | session 0.073, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.063, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 333,602 | 4,343 | 330,815 / 0 / 4,594 / 6,699 | 0.2185 | 0.1536 | 0.70 | session 0.056, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.044, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 276,396 | 5,510 | 267,467 / 4,406 / 5,688 / 8,364 | 0.2656 | 0.1655 | 0.62 | session 0.123, weekly_scoped/Fable 0.001 | session 0.085, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 306,727 | 4,733 | 303,120 / 0 / 5,212 / 7,121 | 0.2239 | 0.1560 | 0.70 | session 0.056, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.043, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 263,018 | 4,564 | 250,347 / 5,736 / 8,121 / 6,735 | 0.2459 | 0.1439 | 0.59 | session 0.187, weekly_scoped/Fable 0.002 | session 0.124, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 954,345 | 3,018 | 949,237 / 2,365 / 4,522 / 4,384 | 0.3074 | 0.2512 | 0.82 | session 0.286, weekly_scoped/Fable 0.008 | session 0.254, weekly_scoped/Fable 0.007 |
| claude-opus-5-5 | 221,635 | 4,327 | 216,039 / 2,510 / 4,690 / 6,181 | 0.1981 | 0.1309 | 0.66 | session 0.152, weekly_scoped/Fable 0.002 | session 0.111, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 182,163 | 6,595 | 176,008 / 2,855 / 5,070 / 9,192 | 0.2536 | 0.1683 | 0.66 | session 0.112, weekly_scoped/Fable 0.001 | session 0.079, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 561,307 | 5,230 | 558,675 / 2,255 / 2,147 / 9,329 | 0.3182 | 0.2169 | 0.68 | session 0.271, weekly_scoped/Fable 0.003 | session 0.208, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 513,026 | 7,238 | 509,454 / 0 / 5,345 / 10,110 | 0.3255 | 0.2474 | 0.76 | session 0.085, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.069, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 687,152 | 5,062 | 685,052 / 0 / 3,802 / 6,936 | 0.2909 | 0.2387 | 0.82 | session 0.085, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.074, weekly_all 0.011, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 282,772 | 4,302 | 274,826 / 3,580 / 5,773 / 6,253 | 0.2210 | 0.1426 | 0.65 | session 0.174, weekly_scoped/Fable 0.002 | session 0.126, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 451,759 | 4,739 | 448,396 / 0 / 4,955 / 7,155 | 0.2526 | 0.1851 | 0.73 | session 0.068, weekly_all 0.010, weekly_scoped/Fable 0.003 | session 0.054, weekly_all 0.008, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 319,344 | 5,059 | 313,063 / 2,810 / 5,003 / 7,227 | 0.2412 | 0.1650 | 0.68 | session 0.192, weekly_scoped/Fable 0.002 | session 0.144, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 69,911 | 5,048 | 63,416 / 0 / 7,583 / 7,514 | 0.1933 | 0.1149 | 0.59 | session 0.041, weekly_all 0.006, weekly_scoped/Fable 0.002 | session 0.025, weekly_all 0.004, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 434,645 | 3,623 | 429,067 / 2,401 / 4,594 / 5,289 | 0.2220 | 0.1594 | 0.72 | session 0.165, weekly_scoped/Fable 0.002 | session 0.132, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 799,790 | 3,859 | 794,031 / 2,672 / 4,814 / 5,389 | 0.2992 | 0.2371 | 0.79 | session 0.289, weekly_scoped/Fable 0.003 | session 0.251, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 961,179 | 6,015 | 952,704 / 3,287 / 3,869 / 11,765 | 0.4578 | 0.3125 | 0.68 | session 0.348, weekly_scoped/Fable 0.005 | session 0.271, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 534,194 | 5,658 | 527,313 / 3,139 / 5,340 / 7,854 | 0.2996 | 0.2200 | 0.73 | session 0.256, weekly_scoped/Fable 0.003 | session 0.206, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 765,667 | 5,518 | 762,099 / 2,723 / 2,901 / 8,630 | 0.3502 | 0.2635 | 0.75 | session 0.306, weekly_scoped/Fable 0.007 | session 0.254, weekly_scoped/Fable 0.006 |
| claude-opus-5-5 | 810,895 | 4,914 | 808,525 / 0 / 4,071 / 7,592 | 0.3298 | 0.2605 | 0.79 | session 0.097, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.084, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 436,418 | 5,125 | 434,196 / 0 / 4,132 / 7,543 | 0.2542 | 0.1898 | 0.75 | session 0.067, weekly_all 0.010, weekly_scoped/Fable 0.003 | session 0.055, weekly_all 0.008, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 961,365 | 4,674 | 956,892 / 0 / 5,956 / 7,196 | 0.3591 | 0.2858 | 0.80 | session 0.109, weekly_all 0.016, weekly_scoped/Fable 0.005 | session 0.095, weekly_all 0.014, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 699,462 | 3,413 | 697,151 / 0 / 4,174 / 5,325 | 0.2626 | 0.2082 | 0.79 | session 0.080, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.069, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 608,943 | 4,485 | 606,128 / 0 / 4,565 / 7,139 | 0.2823 | 0.2115 | 0.75 | session 0.080, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.066, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 512,088 | 5,268 | 508,189 / 0 / 5,056 / 7,682 | 0.2755 | 0.2078 | 0.75 | session 0.075, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.061, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 320,989 | 4,448 | 314,344 / 2,869 / 5,048 / 6,190 | 0.2212 | 0.1532 | 0.69 | session 0.179, weekly_scoped/Fable 0.002 | session 0.137, weekly_scoped/Fable 0.002 |
| claude-sonnet-5-5 | 254,552 | 2,392 | 251,444 / 1,414 / 3,540 / 3,634 | 0.0721 | 0.0494 | 0.68 | session 0.038, weekly_all 0.006, weekly_scoped/Fable 0.002 | session 0.030, weekly_all 0.004, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 223,017 | 2,987 | 220,610 / 1,073 / 3,183 / 5,728 | 0.0884 | 0.0522 | 0.59 | session 0.044, weekly_all 0.006, weekly_scoped/Fable 0.002 | session 0.029, weekly_all 0.004, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 333,051 | 5,065 | 330,765 / 0 / 4,229 / 7,317 | 0.2294 | 0.1679 | 0.73 | session 0.058, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.046, weekly_all 0.007, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 79,764 | 3,798 | 66,669 / 6,111 / 8,247 / 5,576 | 0.1884 | 0.0919 | 0.49 | session 0.123, weekly_scoped/Fable 0.003 | session 0.066, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 887,635 | 5,195 | 882,139 / 0 / 7,146 / 8,719 | 0.3794 | 0.2814 | 0.74 | session 0.110, weekly_all 0.016, weekly_scoped/Fable 0.005 | session 0.091, weekly_all 0.013, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 459,405 | 3,995 | 449,587 / 4,695 / 6,840 / 6,671 | 0.2742 | 0.1718 | 0.63 | session 0.230, weekly_scoped/Fable 0.003 | session 0.166, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 747,799 | 5,739 | 741,201 / 0 / 8,024 / 9,833 | 0.3770 | 0.2643 | 0.70 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.082, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 342,247 | 6,045 | 338,186 / 0 / 5,449 / 8,763 | 0.2647 | 0.1893 | 0.72 | session 0.066, weekly_all 0.009, weekly_scoped/Fable 0.003 | session 0.051, weekly_all 0.007, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 305,253 | 4,105 | 302,959 / 0 / 4,201 / 5,817 | 0.1937 | 0.1432 | 0.74 | session 0.050, weekly_all 0.007, weekly_scoped/Fable 0.002 | session 0.040, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 290,374 | 4,769 | 287,728 / 0 / 4,435 / 7,089 | 0.2171 | 0.1535 | 0.71 | session 0.054, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.042, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-sonnet-5-5 | 169,431 | 2,432 | 167,633 / 833 / 2,932 / 3,945 | 0.0642 | 0.0413 | 0.64 | session 0.032, weekly_all 0.005, weekly_scoped/Fable 0.002 | session 0.023, weekly_all 0.003, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 191,180 | 2,451 | 187,815 / 1,613 / 3,737 / 4,076 | 0.0710 | 0.0436 | 0.61 | session 0.036, weekly_all 0.005, weekly_scoped/Fable 0.002 | session 0.025, weekly_all 0.004, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 260,672 | 3,168 | 257,630 / 1,459 / 3,597 / 5,105 | 0.0877 | 0.0577 | 0.66 | session 0.045, weekly_all 0.006, weekly_scoped/Fable 0.002 | session 0.033, weekly_all 0.005, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 326,730 | 4,852 | 322,556 / 0 / 6,003 / 7,222 | 0.2330 | 0.1624 | 0.70 | session 0.059, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.045, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 322,416 | 4,302 | 318,385 / 0 / 5,585 / 6,831 | 0.2226 | 0.1505 | 0.68 | session 0.057, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.043, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-sonnet-5-5 | 252,144 | 3,602 | 248,328 / 1,835 / 3,974 / 6,143 | 0.0988 | 0.0612 | 0.62 | session 0.049, weekly_all 0.007, weekly_scoped/Fable 0.002 | session 0.034, weekly_all 0.005, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 715,193 | 4,003 | 712,078 / 0 / 4,911 / 5,972 | 0.2815 | 0.2231 | 0.79 | session 0.084, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.072, weekly_all 0.010, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 165,206 | 2,647 | 163,741 / 0 / 3,229 / 3,830 | 0.1223 | 0.0860 | 0.70 | session 0.031, weekly_all 0.004, weekly_scoped/Fable 0.001 | session 0.024, weekly_all 0.003, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 541,350 | 5,207 | 537,583 / 0 / 5,391 / 7,005 | 0.2692 | 0.2124 | 0.79 | session 0.075, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.063, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 752,004 | 7,013 | 750,745 / 0 / 2,906 / 10,811 | 0.3780 | 0.2907 | 0.77 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.087, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 501,869 | 7,445 | 498,566 / 0 / 4,639 / 12,965 | 0.3776 | 0.2493 | 0.66 | session 0.094, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.069, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 595,955 | 4,916 | 593,285 / 0 / 4,447 / 7,430 | 0.2850 | 0.2175 | 0.76 | session 0.080, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.067, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 160,582 | 3,892 | 158,643 / 0 / 3,465 / 5,249 | 0.1506 | 0.1100 | 0.73 | session 0.036, weekly_all 0.005, weekly_scoped/Fable 0.002 | session 0.028, weekly_all 0.004, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 242,166 | 5,347 | 238,699 / 0 / 4,713 / 8,042 | 0.2274 | 0.1554 | 0.68 | session 0.054, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.040, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 559,046 | 4,011 | 555,794 / 0 / 4,714 / 5,830 | 0.2466 | 0.1920 | 0.78 | session 0.071, weekly_all 0.010, weekly_scoped/Fable 0.003 | session 0.060, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 465,658 | 3,714 | 462,737 / 0 / 4,887 / 7,864 | 0.2694 | 0.1674 | 0.62 | session 0.072, weekly_all 0.010, weekly_scoped/Fable 0.004 | session 0.052, weekly_all 0.007, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 389,075 | 4,535 | 378,459 / 5,349 / 7,291 / 7,810 | 0.2878 | 0.1685 | 0.59 | session 0.229, weekly_scoped/Fable 0.003 | session 0.155, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 496,650 | 5,288 | 488,574 / 0 / 9,892 / 8,716 | 0.3116 | 0.2051 | 0.66 | session 0.081, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.060, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 633,984 | 3,679 | 627,742 / 0 / 7,714 / 5,349 | 0.2634 | 0.2004 | 0.76 | session 0.077, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.065, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 368,848 | 3,915 | 356,415 / 5,686 / 7,871 / 6,758 | 0.2664 | 0.1521 | 0.57 | session 0.131, weekly_scoped/Fable 0.001 | session 0.087, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 445,248 | 3,692 | 434,218 / 5,393 / 7,318 / 7,559 | 0.2943 | 0.1629 | 0.55 | session 0.232, weekly_scoped/Fable 0.005 | session 0.153, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 137,531 | 2,691 | 130,623 / 0 / 8,533 / 4,273 | 0.1457 | 0.0813 | 0.56 | session 0.034, weekly_all 0.005, weekly_scoped/Fable 0.002 | session 0.022, weekly_all 0.003, weekly_scoped/Fable 0.001 |

Over all boundaries (formula):

| model | window | n (manual / auto) | median window % per 100k context | 95th-pct context | window % at it | compactAtPct = 100 − 3× |
|---|---|---|---|---|---|---|
| claude-fable-5-1 | session | 5 (3 / 2) | 0.011 | 947,858 | 0.10 | 99.7 |
| claude-fable-5-1 | weekly_all | 5 (3 / 2) | 0.002 | 947,858 | 0.02 | 99.9 |
| claude-fable-5-1 | weekly_scoped/Fable | 5 (3 / 2) | 0.001 | 947,858 | 0.01 | 100.0 |
| claude-opus-4-6 | session | 25 (0 / 25) | 0.017 | 947,858 | 0.16 | 99.5 |
| claude-opus-4-6 | weekly_all | 25 (0 / 25) | 0.004 | 947,858 | 0.04 | 99.9 |
| claude-opus-4-6 | weekly_scoped/Fable | 25 (0 / 25) | 0.001 | 947,858 | 0.01 | 100.0 |
| claude-opus-4-8 | session | 2 (0 / 2) | 0.011 | 947,858 | 0.10 | 99.7 |
| claude-opus-4-8 | weekly_all | 2 (0 / 2) | 0.002 | 947,858 | 0.02 | 99.9 |
| claude-opus-4-8 | weekly_scoped/Fable | 2 (0 / 2) | 0.001 | 947,858 | 0.01 | 100.0 |
| claude-opus-5-5 | session | 125 (125 / 0) | 0.017 | 947,858 | 0.16 | 99.5 |
| claude-opus-5-5 | weekly_all | 68 (68 / 0) | 0.002 | 947,858 | 0.02 | 100.0 |
| claude-opus-5-5 | weekly_scoped/Fable | 125 (125 / 0) | 0.001 | 947,858 | 0.01 | 100.0 |
| claude-sonnet-4-5-20250929 | session | 1 (1 / 0) | 0.019 | 947,858 | 0.18 | 99.5 |
| claude-sonnet-4-5-20250929 | weekly_all | 1 (1 / 0) | 0.004 | 947,858 | 0.04 | 99.9 |
| claude-sonnet-4-5-20250929 | weekly_scoped/Fable | 1 (1 / 0) | 0.001 | 947,858 | 0.01 | 100.0 |
| claude-sonnet-5-5 | session | 11 (11 / 0) | 0.014 | 947,858 | 0.13 | 99.6 |
| claude-sonnet-5-5 | weekly_all | 7 (7 / 0) | 0.002 | 947,858 | 0.02 | 99.9 |
| claude-sonnet-5-5 | weekly_scoped/Fable | 11 (11 / 0) | 0.001 | 947,858 | 0.01 | 100.0 |

compactAtPct default (the lowest across windows): 99.5


### 7. E6: summarize against whole, per band (cold total at K)

| band | summarize arm | cuts | median (summarize − whole) | per cut: context → difference |
|---|---|---|---|---|
| 100-300k | A2 | 0 | – | – |
| 300-600k | A2 | 0 | – | – |
| 600k+ | A2 | 0 | – | – |

### 7b. Cost by arithmetic: whole, native /compact and a Sonnet summary, per situation and band

Per drawn cut, priced request by request with the product's `costForUsage`; the median over the cuts of each band. Total = make + turn 1's first request + the next 20 real turns (fewer where the session had fewer). Session model as drawn (claude-fable-5-1: 3 cuts, claude-opus-5-5: 17 cuts, claude-opus-5-5[1m]: 4 cuts). USD.

Measured inputs:

- native `/compact`: input 5,176.0 and output 7,515.0 tokens (medians of 114 measured manual compactions on Opus); carried after it S_n = 100-300k 49,610 (n=54), 300-600k 51,659 (n=53), 600k+ 59,006 (n=48) tokens (first request after a real boundary);
- Sonnet summary: input = 0.083 × P, output 5,068 tokens (12 finished A2 summaries); the opening turn $0.5314 (12 measured); carried after it S_s = 68,651 tokens;
- turn-1 writes at the 1-hour rate: in the finished A0 runs the 1-hour share of the first request's write was 1.00 (n=7).

| situation | band | cuts | P (median) | whole | native /compact | Sonnet summary | cheapest |
|---|---|---|---|---|---|---|---|
| warm same-org | 100-300k | 8 | 216,155 | $9.96 (make 0.00, t1 0.06, next 9.90) | $8.10 (make 0.22, t1 0.41, next 7.47) | $8.39 (make 0.62, t1 0.03, next 7.74) | native |
| warm same-org | 300-600k | 8 | 481,252 | $17.42 (make 0.00, t1 0.12, next 17.32) | $12.98 (make 0.27, t1 0.46, next 11.86) | $12.77 (make 0.66, t1 0.04, next 12.09) | sonnet |
| warm same-org | 600k+ | 8 | 941,946 | $22.91 (make 0.00, t1 0.20, next 22.67) | $9.95 (make 0.36, t1 0.50, next 9.09) | $9.99 (make 0.74, t1 0.04, next 9.21) | native |
| cold or cross-org | 100-300k | 8 | 216,155 | $11.86 (make 0.00, t1 1.93, next 9.90) | $9.37 (make 1.37, t1 0.41, next 7.47) | $8.39 (make 0.62, t1 0.03, next 7.74) | sonnet |
| cold or cross-org | 300-600k | 8 | 481,252 | $23.15 (make 0.00, t1 4.18, next 17.32) | $16.01 (make 2.77, t1 0.46, next 11.86) | $12.77 (make 0.66, t1 0.04, next 12.09) | sonnet |
| cold or cross-org | 600k+ | 8 | 941,946 | $30.24 (make 0.00, t1 7.56, next 22.67) | $14.47 (make 4.88, t1 0.50, next 9.09) | $9.99 (make 0.74, t1 0.04, next 9.21) | sonnet |
| limit gone early | 100-300k | 8 | 216,155 | $11.86 (make 0.00, t1 1.93, next 9.90) | $9.37 (make 1.37, t1 0.41, next 7.47) | $8.39 (make 0.62, t1 0.03, next 7.74) | sonnet |
| limit gone early | 300-600k | 8 | 481,252 | $23.15 (make 0.00, t1 4.18, next 17.32) | $16.01 (make 2.77, t1 0.46, next 11.86) | $12.77 (make 0.66, t1 0.04, next 12.09) | sonnet |
| limit gone early | 600k+ | 8 | 941,946 | $30.24 (make 0.00, t1 7.56, next 22.67) | $14.47 (make 4.88, t1 0.50, next 9.09) | $9.99 (make 0.74, t1 0.04, next 9.21) | sonnet |

Per cut (situation · method → total): see out/arith.json.


### 8. Stopped runs and judgments

Arms not run (out/not_run.json):

- **A7d**: OpenCode on opencode-go/deepseek-v4-pro was not run: the opencode-go key (the one ending 4DEY) has expired (HTTP 401, api_key_expired: "This API key has expired. Create a new API key in OpenCode Console and replace it in your client or secret store."). The owner, 2026-10-25: "stop pausing the compact benchmark on opencode, move on!"
- **A7g**: pi on openai-codex/gpt-5.6-terra was not run: the ChatGPT account answered "Codex error: The usage limit has been reached" from the first smoke (04:30 UTC) to the last probe (09:04 UTC) on 2026-10-25, and the run was stopped before it cleared.
- **main run**: stopped by the owner at about 13:00 local (10:00 UTC) on 2026-10-25, after 55 finished runs on 5 of the 22 single cuts and both chained pairs (plus c18 A2/A6, left to finish): "the cost side is arithmetic". No judge model call was made, so no quality judgment exists; the cost of every situation and band is in §7b (arith.py), from the DB's and transcripts' token counts and the product's prices.

By arm and class:

| arm | class | runs |
|---|---|---|
| A0 | turn failed | 6 |
| A2 | turn failed | 1 |
| A6 | turn failed | 2 |

Judgments stopped: 0.

<!-- results:end -->

## 8a. Reading the numbers (cost alone)

From §8 7b and 1b, over all 24 drawn cuts; USD over the next 20 real turns, median per band.

**Before a move to another organization: compact on the warm account first.** Compacting with native `/compact` on
the session's own account, while its cache is warm, then moving the compacted session, cost less than moving the
session whole at every one of the 24 cuts:

| band | move whole | compact warm, then move | difference (95 % CI) |
|---|---|---|---|
| 100–300k | $11.86 | $8.10 | −$4.24 (−4.82, −2.99) |
| 300–600k | $23.15 | $12.98 | −$10.16 (−14.87, −9.87) |
| 600k+ | $30.24 | $9.95 | −$19.47 (−27.18, −15.58) |

The warm compaction itself costs $0.22–0.36: a cache read of the context plus about 7,500 tokens of output. The saving
is everything after it: each later request reads about 50–59k tokens instead of the whole context. Moving whole is
also not always possible. At c20 (958k) and c23 (965k) every A0 run stopped on "Prompt is too long", and the real
sessions compacted there. The one cut with both measured (c01, 118k, one run each) agrees: $5.38 against $7.13.
CawCo today moves a session whole under 600k and never compacts at a forecast move; by cost, that is the dearer choice
in every band from the smallest drawn context (118k) up.

**Cold, cross-organization, or a limit gone early: a Sonnet summary is cheapest** in every band ($8.39, $12.77, $9.99),
ahead of native `/compact` on the target ($9.37, $16.01, $14.47) and whole ($11.86, $23.15, $30.24). Native loses
there by its cold read of the whole context, $1.37 to $4.88 at the median, which a summariser reading CawCo's extract
(8 % of the context) does not pay.

**Warm, same organization:** native `/compact` and a Sonnet summary are within 3 % of each other in every band, and
both well under whole. E5 puts a warm native compaction at a few tenths of a percent of a 5-hour window (the
`compactAtPct` rule gives 99.5); its formula underestimates the measured manual compactions by a factor of 0.50–0.86,
the measured output including thinking.

**Does compacting first lose anything a judge can see? Not beyond the noise, on this sample.** The judging was scoped
to that question (§8 1c): 161 calls, then 45 Opus pairwise judgments again after a parsing fault (below), $24.86 as
Claude Code reported.
- **Pairwise, A1 against A0** (7 pairs at c01, c17 and c18, same run index, both orders, both judges). Opus: 3 wins,
  1 tie, 3 losses for compacting first. Sonnet: 4 wins, 1 tie, 2 losses. The judges agree on 3 of the 7: 2 wins
  (c01, c18 run 3) and 1 loss (c17 run 3).
- **The same verdict on the control against itself.** A0's run 1 against its runs 2 and 3, at c17 and c18, draws the
  same kind of split. At c17, run 1 against run 3 was a win in both orders for both judges, between two runs of one
  arm. A single pairwise verdict at this sample size is at the noise.
- **0–5 scores.** Compacting first against whole, median over the three cuts: Opus −0.75 (95 % CI −1.25 to +0.25),
  Sonnet −0.25 (−0.25 to +0.75). A0's own repeats spread by 0, 0, 1.25 and 0.75 (Opus), so the floor is 0.75. Both
  intervals contain zero, the Opus median only reaches the floor, and the Sonnet median is under it. By the design's
  rule (CI excluding zero, at least the floor, both judges agreeing) there is no actionable loss.
- **Native against a Sonnet summary** (12 pairs at five cuts). Native compaction was preferred 8 times by each judge,
  the judges agreeing on 10 of 12; its 0–5 lead (+0.50 for both judges) has intervals that just include zero
  (Opus −0.10 to +1.48, Sonnet −0.15 to +0.90).

So the cheaper move, compacting on the warm account first, showed no quality loss the judges could separate from the
control's own noise. That is a statement about three cuts and seven pairs, all from orchestrator sessions at 118k and
about 915–960k: it rules out a large loss, not a small one.

**What else these numbers do not say.** The other quality questions (the summariser's model, input and shape, and
merge against restate on chained cuts) were not judged; their rows stay "by cost alone". The engine readings (files
and commands against the real turn, re-fetches) cannot separate the arms on 57 runs. The prior one-chat evaluation
(§3) found native compaction keeping fewer probe facts than CawCo's summary (16–22 % against 29–35 %), on one session
and one run; the continued turns judged here do not show that gap. The arithmetic assumes the session's next 20 turns
go as they really did, so a method that changes what the agent does next is priced as if it had not.

**A judge reply that broke the parser.** The pairwise prompt asks for "questions X asks the person that the anchors
already answer". Sonnet always answered with a count; Opus answered 45 of its 46 pairwise judgments with a list of the
questions, usually an empty one, which the parser rejected whatever it held. The parser now counts a list's items,
and the 45 were judged again with the prompt unchanged. On that second pass, 44 of Opus's 46 saved judgments are
lists: 37 empty and 7 naming re-asked questions.

## 9. Reproducing

`README.md` gives the run order (tools, cuts, E5, preflight, smoke, floor, main, judge, cost, report).
`python3 -I compaction-bench/run.py --dry --fixture` runs the whole pipeline on the synthetic fixture with every model
reply simulated. It writes its Results into a copy at `out/dry/PAPER.md`, never into this file.

# What Caw's costly turns paid for

Caw, cockpit project: instance 6448b912, Claude Code session c09149ef, `claude-opus-5-5[1m]`, 1h cache.
Sources: `caw-session.jsonl` (the session's transcript, 102 API requests from 10-15 08:43Z to 10-16 02:56Z), `caw-turns.csv`, `caw-instance.csv`.

**Prices.** Opus 5.5, from https://platform.claude.com/docs/en/about-claude/pricing. The table row reads: "Claude Opus 5.5 | $4 / MTok | $20 / MTok | $5 / MTok | $8 / MTok | $0.20 / MTok", which is input, output, 5m cache write, 1h cache write and cache read, in that order.
Every write in this transcript is a 1h write; the 5m count is 0 on every request.
Costed this way, the transcript comes to **$31.04**, which matches the turns CSV to the cent.
Five requests rewrote the whole context. They cost **$21.02**, 68% of the total.

The brief also listed turns at 10:10Z ($3.40), 12:14Z ($2.86) and 14:20Z ($2.97). None of them is in `caw-turns.csv`, which starts at 10-15 08:43:27Z, or in the transcript, which starts at 08:43:11Z. They predate this session's records, so they are not costed here.

## The table

There is one row per costly CSV turn, and inside each turn one line per API request. The gap is measured from the previous API request, not from the previous CSV turn.

| Turn (CSV, UTC) | Request | Gap | Requests in turn | Cache written (1h) | Cache read | Input / output | $ | Cause |
|---|---|---|---|---|---|---|---|---|
| 10-15 17:53:44 ($6.97) | 11:00:38 | 1.4 min | 6 | 2,914 | 258,358 | 4 / 437 | 0.08 | warm |
| | 15:00:30 | **239.9 min** | | **342,496** | 0 | 2 / 354 | **2.75** | Other: the turn waited on a permission ask past the 1h TTL |
| | 15:00:36 | 0.1 min | | 555 | 342,496 | 2 / 153 | 0.08 | warm |
| | 17:53:35 | **173.0 min** | | **465,024** | 0 | 2 / 212 | **3.72** | Other: the turn waited on a second permission ask past the TTL |
| | 17:53:37 | 0 | | 7,543 | 465,024 | 2 / 113 | 0.16 | warm |
| | 17:53:44 | 0.1 min | | 9,152 | 472,567 | 2 / 536 | 0.18 | warm |
| 10-15 18:10:16 ($4.38) | 18:10:14 | 2.1 min | 1 | **546,977** | 0 | 2 / 234 | **4.38** | Other: an at-limit move to an account in another organization |
| 10-16 01:18:31 ($5.09) | 01:18:31 | **371.1 min** | 1 | **636,564** | 0 | 2 / 4 | **5.09** | (a) cache expired after idle; the session also moved back to the first organization |
| 10-16 02:56:02 ($5.09) | 02:56:02 | **97.5 min** | 1 | **636,740** | 0 | 4 / 4 | **5.09** | (a) cache expired after idle |

The 17:53 CSV turn is one turn, 11:00:36 → 17:53:44. A delegate's report woke it at 11:00.
Caw's first Bash call (`git fetch …`) waited on the owner's approval until 15:00:24.
Its next one (`ls -la .out …`) waited until 17:53:27 ("User denied permission").
Each wait outlived the 1h TTL. 30 delegate reports queued during the waits and went in with the requests that followed.

## Causes, with $ totals

| Cause | Turns | $ of full rewrites | Status |
|---|---|---|---|
| (a) cache expired after idle | 01:18, 02:56 | 10.18 | proposal (owner): keep-alive, below |
| Other: a turn held open by a permission ask past the TTL | 15:00, 17:53 (in the 17:53 turn) | 6.47 | proposal (owner), below |
| Other: an at-limit move across organizations | 18:10 | 4.38 | proposal (owner), below |
| (b) prompt prefix changed | none | 0.00 | spurious cold flags fixed, below |
| (c) compaction | none: the context grew from 69k to 637k, and the transcript holds no compaction record | 0.00 | none |
| (d) a turn that makes many requests | none: the costly turns made 1 to 6 requests, and the expensive request in each was a cold rewrite | 0.00 | none |

### (b) Prefix changes: what the transcript shows

The transcript doesn't store the system prompt or the tool list. What it stores is every mid-session change Claude Code delivered, each as an appended attachment.
Each of those changes was followed by a request that read the whole previous prefix from the cache:

| Change delivered mid-session | At | Next request: read / written |
|---|---|---|
| `skill_listing` re-sent (29,984 → 29,986 chars) | 19:07:26 | 605,881 read / 13,693 written |
| `instructions` (user CLAUDE.md 26,878 → 27,142 chars) | 17:55:47 | 481,719 / 15,080 |
| `deferred_tools_delta` (33 MCP tools removed) | 18:53:23 | 592,842 / 3,662 |
| `deferred_tools_delta` +9/-5, new `skill_listing` | 09:49:18 | 111,324 / 15,949 |

Claude Code's docs describe the same delivery:
- Skills: "Claude Code picks up the change within the current session, without a restart" (https://code.claude.com/docs/en/skills#live-change-detection).
- MCP: "when a server finishes connecting while Claude is working, Claude Code lists the server's tool names to Claude on its next request in the same turn" (https://code.claude.com/docs/en/mcp).

So in the current Claude Code, a real fleet change reaches a running session as an appended message and keeps the cached prefix. No turn in this window paid for a prefix change.

CawCo still treated every such write as a prefix change, and for every Claude session on the machine. `caw-instance.csv` shows the result: `cache_cold: "prompt changed: skill review-attempt"` at 10-16 03:19:33Z.
`review-attempt` is the code template's starter skill (hub `bundled-skills.ts`, `TEMPLATE_SKILLS.code`). It is placed in every checkout and **delegate workspace** of the project.
Claude Code reads a project skill only "in the directory where you start it and in every parent directory up to the repository root" (https://code.claude.com/docs/en/skills). So Caw, working in the project folder, never reads a workspace's skill.

A cold flag costs money in two ways:
- It refuses the session's keep-alive (`Keep-alive refused: the Claude prompt changed`).
- It makes the hub move the session to another account at its next wake (server.ts `replaceAtWake`, gated on `cacheWarm(row)`). The move turns a warm cache into a real rewrite: $4.38 to $5.09 at Caw's size.

## What I fixed (fixed)

**Fixed: a fleet write now marks cold only the Claude sessions that read it.**
- agent `prompt-writes.ts`: `promptWrite(reason, run, readers)`. `readers` is either `{ kind: "machine" }` (the user layer: `~/.claude/`, a `.claude.json`, an account's config dir) or `{ kind: "folder", path }` (a project's own `.claude/`, CLAUDE.md, AGENTS.md, `.mcp.json`). `promptWriteReason` now returns the readers along with the reason.
- agent `fleet.ts`: a placed skill (`placeSkill`) and a placed project memory doc (`placeMemoryDoc`) are folder-scoped to their checkout or workspace. `writeSkill(…, null)` is used for OpenCode's and pi's skill dirs (`harnesses/fleet-common.ts`), which no Claude session reads, so those writes invalidate nothing.
- agent `session.ts`: the supervisor keeps each session's cwd. The in-flight count of prompt writes and the prompt epoch are now kept per session, not machine-wide. Only Claude sessions at or under the folder go cold, have their keep-alive refused, or have their turn's result marked not reusable.
- core `frames.ts` `CacheInvalidatedFrame.folder`, hub `db.invalidateClaudeCaches(machineId, reason, at, folder)`: the hub marks rows by the same rule (`cwd = folder`, or `cwd` under `folder/`). Sleeping rows are included. OpenAPI regenerated.
- The protection from 7a208cf3b stays for writes a session reads. That commit's measured failure was a skill added mid-session that re-rendered an earlier `skill_listing` (`cache_miss_reason: messages_changed`). Those writes still mark the session cold and refuse its pings.

**Proof: probe spec `scripts/probe-kit/specs/prompt-cache-scope.ts`** (`bun scripts/probe-kit/run.ts prompt-cache-scope`, scratch fleet, no delegation). The spec sets up two projects, A and B, with a Claude session in each.
- (a) The lead in A takes a turn.
- (b) A memory doc scoped to B and a skill bound to B are placed in B's checkout. B's session goes cold; the lead does not.
- (c) The same fleet is synced again unchanged; the lead is still not cold.
- (d) The lead's next turn sends the same system prompt and tools byte for byte, with its first turn's messages leading (cache breakpoints aside).

Results:
- With the fix: `ALL PASS (1 specs, 59s)`.
- Against the old code (stash): `FAIL (b) the lead in A … is not cold (cache_cold {"reason":"prompt changed: skill probe-scope-04816379", …})`, `FAIL (c)`, `2 FAILED`. Meanwhile (d) passed: the lead's prefix was intact while it was flagged cold. This reproduces the `review-attempt` flag.

`bun run typecheck` and `bun run lint:changed` both pass.

## Proposals (owner)

### Keep-alive for Caw (proposal, owner)

The mechanism, hub `keep-alive.ts`:
- A ping is due at `lastRequestAt + 1h − 10 min`, every 50 min while the session is idle.
- The cap is `floor(cacheWrite1h / cacheRead)`, which is 8 / 0.20 = **40 pings**, the price of one rewrite.
- A ping that reads under 90% of its prompt from the cache marks the session cold and stops.
- No ping is sent while a turn or an ask is open.

Why it's off for Caw: `instances.keep_alive` defaults to false for every session (schema), and it is turned on per session with `PATCH /api/instances/:id {keepAlive: true}`. Caw's was never turned on: `keep_alive 0`, `keep_alive_stopped` empty.

What keep-alive would have done over this window:

| Idle gap | Pings | Ping cost (read ~620–637k at $0.20/MTok + ~150 tokens written) | Rewrite avoided |
|---|---|---|---|
| 19:07 → 01:18 (371 min) | 7 | $0.88 | $5.09 |
| 01:18 → 02:56 (97.5 min) | 1 | $0.13 | $5.09 |
| **Total** | 8 | **$1.01** | **$10.18** |

Net saving: about **$8.9** over the window. Each woken turn then reads ~$0.13 instead of writing ~$5.09.

Worst case: an idle stretch with no wake costs 40 pings, about $5.15, which is one rewrite. Past ~33 h the cap stops the pings.

The fix above is what lets keep-alive run at all. Before it, each new delegate workspace marked Caw cold, which stopped the pings.

One caveat: keep-alive does not cover the 15:00 and 17:53 rewrites, because no ping is sent while an ask is open.

The 01:18 wake also moved Caw from account 3c788add (org c35e9696) to c6b14b4e (org 669e0d35). A warm session isn't re-placed at wake (`replaceAtWake` returns early when `cacheWarm`), unless its account was at its limit, which isn't in my inputs.

Recommendation: turn keep-alive on for the lead.

### The user-layer cold flag (proposal, owner)

Writes to the user layer (skills, CLAUDE.md, memory docs, MCP servers, hooks) still mark every Claude session on the machine cold. That is the protection from 7a208cf3b, and I kept it.

Over these 18 h, these real changes reached Caw:
- 4 skill listings: 09:49, 15:00, 17:53, 19:07.
- 2 CLAUDE.md content changes: 17:55, 01:18.
- 3 MCP tool deltas outside account switches: 09:49, 17:55, 18:53.

Every one of them that reached a warm session kept its prefix (table in (b)). Yet each one stops keep-alive until the next real turn. The 19:07 skill listing sat right before the 6 h idle, so even with keep-alive on, that rewrite ($5.09) would have been paid.

Proposal: measure instead of predicting. After a user-layer write, allow the next ping. The existing check (`keepAliveResult`: a read under 90% → cold, stop) catches a real prefix change on that one ping. A wrong guess costs one ping that rewrites (≤ $5.09, which the next real turn would pay anyway). A right guess saves a rewrite at each wake after an idle hour.

### A turn held open by a permission ask (proposal, owner)

The two asks cost $6.47 in rewrites. The 11:00 turn was woken by a delegate's report, so read-only and git calls asked the owner. The asks sat 4.0 h and 2.9 h, and a turn with an open ask can't be pinged.

Options with numbers:
- Let a report-woken turn run read-only commands without asking, as a person-woken turn does. That would have saved the 15:00 rewrite ($2.75). `git fetch` writes refs, so it would still ask.
- End or deny an ask still open at 50 min on a 1h-TTL session. The turn ends, and keep-alive (if on) holds the cache: both rewrites, $6.47, avoided at ~$0.13 per ping.

### At-limit moves prefer the same organization (proposal, owner)

At 18:09:56 a usage limit stopped Caw on account c6b14b4e (org 669e0d35). At 18:10:11 it continued on 3c788add (org c35e9696), and the rewrite cost $4.38.

Same-organization moves keep the cache: the 09:19 and 10:40 account switches in this transcript read 98k and 205k from the cache.

The at-limit path picks its target with `ports.target(row, current.id)` (hub `at-limit.ts` `decide`) and has no same-organization preference. The refused-credential path does: `refusedTarget` asks `ports.target(row, current.id, (one) => sameOrganization(one, current))` first.

Proposal: give `decide` the same preference. Each move it keeps in-org saves the full rewrite ($4.38 here, minus ~$0.11 of reads). Whether an account in org 669e0d35 had room at 18:10 isn't in my inputs.

## Context size (owner's call; nothing changed)

Here is what a 200k context would have cost on the same requests. The model: each request's prompt is capped at 200k, and the reads and writes shrink to fit.

| | 1M context (actual) | 200k context |
|---|---|---|
| The five full rewrites | $21.02 (2.75, 3.72, 4.38, 5.09, 5.09) | $8.01 (5 × ~$1.60) |
| All 102 requests | $31.04 | $15.31 |

The 200k column leaves out compaction. Growing from 69k to 637k at a 200k window means about 4 compactions. My own estimate, from no source: each one is a summary (~8k output, $0.16), a cached read ($0.04) and a ~20k re-write ($0.16), about $1.5 for all 4. That brings the total to about **$16.8**, against $31.04.

What 200k gives up is Caw's working memory of the session beyond the summaries.

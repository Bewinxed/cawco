# CawCo's compaction method as a setting: design

Written 2026-11-03 for task tsk-74 from the benchmark's `ranking.md` and `report.md` (24 cuts, 420 runs, noise floor 0.75) and from `origin/main` of the repo. Build nothing from this document without the owner's picks in §6.

## 0. What the evidence settles, and which code path each case is

The benchmark's three cache cases are three moments the hub already tells apart in `packages/hub/src/at-limit.ts` (`StopCause`: `"limit" | "refused-credential" | "extra-usage" | "forecast"`, and a person's move, server.ts `moveByHand`, `asked: true`):

| case | when the hub is there | today's code | the winner, `ranking.md` |
|---|---|---|---|
| warm, same organization | no move at all (the harness's own auto-compaction), or a move whose cache carries (`decideStop` rule 5: "one its cache carries to: it moves there at once, whole") | nothing of CawCo's runs | "1 · **A1** · native /compact · 3.00 · +0.00 [-0.24, +0.24] · within floor yes · $9.26 · −$4.05" (warm table) |
| cold or cross-organization, the source still runnable and warm | `forecast` (rebalance.ts), `extra-usage`, a person's move | rule 8 at a forecast never compacts; with a warm cache it stays: `stayWords` "its cache is warm, and moving to another organization now would re-read … cold …; it moves at its limit instead, and is compacted there when large", which is A1 cold on the target | "1 · **A1cf** · native /compact first, then move · 3.00 · +0.00 · yes · $9.26 · −$7.96" against "5 · A1 · native /compact · 3.00 · $12.55" (cold table); §1b: compact-first cheaper at 18 of 18 cuts |
| limit gone early: nothing can run on the old account | `limit`, `refused-credential` | moved whole, then `filing` + `/compact ${COMPACT_FOCUS}` on the target (server.ts `startCompaction`, `sendStep`), when `reported >= policy.moveWholeUnderK * 1000` (`decideStop`, the `compact` target field) | "1 · **A5** · Sonnet · full-clipped · Claude Code shape · 2.75 · −0.50 [-0.96, -0.21] · yes · $9.54"; "3 · A4 · Sonnet · full-clipped · CawCo · 2.50 · $11.76"; "4 · A1 · native /compact · 3.00 · $12.55" (limit table) |

Settled against today's summary: "6 · A2 · Sonnet · extract · CawCo · 2.50 · −0.75 [-1.03, -0.25] · within floor **no** · $9.23" in every table. A2 is the product's `summariserPrompt` over `Extracted.middle`, whose first line says what it hides: "Old tool output is hidden; failed calls keep the head of their error." (`packages/hub/src/continuation.ts`).

Settled on the floor under which everything moves whole: report §1 "`moveWholeUnderK` = 177k-177k: whole cheaper below, summarize above (E6)"; E6's 100-300k row has the two 177k cuts on either side (+11.26, −12.19). Today `DEFAULT_AT_LIMIT.moveWholeUnderK = 200`.

Not settled by a run: OpenCode and pi as summarisers (A7d: "the opencode-go account's key has expired (HTTP 401, api_key_expired, 2026-10-25)"; A7g: "the ChatGPT account … answered 'Codex error: The usage limit has been reached' on every probe"). Not run.

## 1. The setting

**Name and shape.** A `Compaction` policy in `packages/core/src/accounts.ts`, beside `AtLimit`, and a `compaction` field on `ProviderRouting`:

```ts
/** A method the benchmark ran: the harness's own /compact (A1), a summary by the summariser (A4), or nothing (A0). */
export type CompactMethod = "native" | "summary" | "whole";

/**
 * How a session's context is made small, by the moment the hub does it. A
 * context under `AtLimit.moveWholeUnderK` thousand tokens moves whole
 * whatever the method says.
 */
export interface Compaction {
  /**
   * Its account can still run it, and it is to move to another
   * organization (its account forecast to run out, on extra usage, or a
   * person's move): `native` files its open items and runs its harness's
   * /compact there, warm, then moves it; `summary` continues it from the
   * summariser's summary on the target; `whole` moves it as it is.
   */
  beforeMove: CompactMethod;
  /**
   * Nothing can run on its old account (its limit refused a turn, its
   * sign-in was refused): `summary` continues it from the summariser's
   * summary on the target; `native` moves it whole and runs its harness's
   * /compact there, cold; `whole` moves it as it is.
   */
  atLimit: CompactMethod;
  /**
   * Who writes a summary: the harness and model, and the account it runs
   * on. Absent account: placed as any start is.
   */
  summarizer: { harness: HarnessKind; model: string; account?: string };
}
```

Three values per moment, not one: a value per method the benchmark ran, and `whole` because A0 is in every table at the top quality (3.00) and within the floor. There is no field for the warm same-organization case: nothing of CawCo's runs there; the harness's own auto-compaction does (Claude Code `/autocompact`, `DISABLE_AUTO_COMPACT`; OpenCode `compaction.auto`, `OPENCODE_DISABLE_AUTOCOMPACT`; pi `compaction.enabled`), and the evidence says native. A person who wants a session kept whole sets that at the harness (§6, pick 8).

`AtLimit` keeps `move`, `waitMinutes`, `staleAfterHours`, `moveWholeUnderK` (the floor every method sits over) and loses `prepareAtPct` (§4, §5).

**Where it lives: the provider's routing, fleet-wide.** Stored as a JSON column `compaction` on `account_routing` (`packages/hub/src/db/schema.ts` 2416, beside `atLimit: storedJson(AtLimitSchema)("at_limit")`), with `CompactionSchema` in `packages/core/src/stored-shapes.ts` (beside `AtLimitSchema`, 1424) mirrored in `apps/dashboard/src/lib/cawco/stored-shapes.ts` (154). Carried by the one API that carries the policy, `PUT /api/accounts/routing/:provider` (server.ts 34446: body `yours`, `delegates`, `atLimit`), and read back in `db.accounts.routing(provider)`; `defaultRouting` and `ACCOUNT_RULES` gain `compaction: DEFAULT_COMPACTION` so the iOS app's `Words.Accounts.Rules` has it. Edited in Configure › Accounts' At the limit block (`apps/dashboard/src/lib/cawco/accounts/AtLimitBlock.svelte`, `RoutingEditor.svelte`; iOS `RoutingEditor.swift`): two pickers under the move switch, and the summariser's harness and model as the New Session form's `ModelSection` with `summarizerRefusal` (`NewSessionForm.svelte` 2424), which already refuses a model whose window does not fit `estimate.summariseInputTokens + SUMMARISER_OUTPUT_RESERVE_TOKENS`.

Why the routing and not a project or a session: every moment the setting names is a move the at-limit controller decides per provider (`decideStop` reads `policy: Pick<AtLimit, …>` off `db.accounts.routing(provider)`), the editor and the wire for that policy exist, and the benchmark varied nothing by project. A person's own Continue keeps its per-continuation summariser (the form's picker, `continueBody.summarizer`) and `continue_session` its `summarizer_harness`/`summarizer_model`; both now default to the policy's `summarizer` when absent instead of refusing ("Choose who summarises the session, or continue from your asks alone.", `continuationRefusal`).

## 2. Its default

```ts
export const DEFAULT_COMPACTION: Compaction = {
  beforeMove: "native",
  atLimit: "summary",
  summarizer: { harness: "claude", model: "claude-sonnet-5-5" },
};
```

- `beforeMove: "native"` rests on the cold table's first row, "1 · **A1cf** · native /compact first, then move · 3.00 · +0.00 [-0.24, +0.24] · yes · $9.26 · −$7.96 [-12.43, -6.77]", and the robustness rows "cold or cross-organization · all · 20 turns · A1cf $9.26, A5 $9.54, …" and "… · whole · A1cf $31.79, A4 $32.57, …". Compacting warm is cheap because the summarisation request reads the prefix from cache: Claude Code's docs, "While the cache is warm, that request reads your prefix from the cache. A mid-session /compact then costs a fraction of what the context size suggests" (https://code.claude.com/docs/en/prompt-caching, Compacting the conversation).
- `atLimit: "summary"` rests on the limit table's first row, "1 · **A5** · Sonnet · full-clipped · Claude Code shape · 2.75 · −0.50 [-0.96, -0.21] · yes · $9.54 · −$7.96", with A4 (same input, CawCo's sections) at "$11.76" over 20 turns and first over the whole horizon ("limit gone early · all · whole · A4 $32.57, A3 $33.10, A5 $33.20, A1 $34.54"). Native cold stays within the floor at $12.55.
- The summariser is Sonnet 5.5 (`common.py`: `SONNET … = "claude-sonnet-5-5"`), the model A4 and A5 ran on; Haiku (A3) is "within the floor over all cuts but outside it at 100-300k".
- The warm same-organization default is the harness's own compaction, "1 · **A1** · native /compact · $9.26" against "5 · A0 · whole · $16.41"; no field.

The summary's shape is not a setting: E4 (A5 − A4) is "not actionable: quality CI spans 0; |Δ| 0.00 < floor 0.75" (report §1). The one prompt the product keeps is CawCo's sections (A4): "A4 is the only summary arm that is never outside the floor in any band or horizon", where A5 is struck out at "limit gone early · 100-300k · 20 turns · A4 $8.44, A1 $8.55, A0 $11.05, ~~A5 $8.20~~" and at 300-600k over the whole horizon (§6, pick 3).

## 3. What each harness supports

Every harness says `compaction: true` (`packages/agent/src/harnesses/capabilities.ts` 25 `FULL_CAPABILITIES`, Claude `CLAUDE_CAPABILITIES = FULL_CAPABILITIES`, OpenCode `{ ...FULL_CAPABILITIES, tasks: false }`, pi `pi-services.ts` 217 `compaction: true`).

**Native (`native`, both moments).**
- Claude Code: the hub sends `/compact ${COMPACT_FOCUS}` as a user message (server.ts `sendStep`); "`/compact [instructions]` · Free up context by summarizing the conversation so far. Optionally pass focus instructions for the summary." (https://code.claude.com/docs/en/commands). Done when `compact_boundary` with `compact_metadata.trigger === "manual"` arrives (`observeCompaction`; agent session.ts `#noteCompact`), after which the process is relaunched (`COMPACT_RELAUNCH`, because of claude-code #92089's replay). The summary is written by the session's model and nothing can change that: claude-code #96316, "The context-compaction summary (auto-compact and `/compact`) is generated with the session model … there is no way to route it to a cheaper model" (open, 2026-09-23; https://github.com/anthropics/claude-code/issues/96316). The open items come back after it through the fleet's SessionStart hook on the `compact` source (`open-items.ts` header; server.ts 30665).
- OpenCode: `/compact` is not a registered command but the server's own call, `this.#client.session.compact({ sessionID })`, "on the session's own model" (`opencode-session.ts` 2956-2960, 3076-3084); ends on `session.compaction.ended` with the summary message `summary: true`, or `session.compaction.failed` (`compact_result: "failed"`). It takes no focus: `#compact(uuid)` has no text argument, so `COMPACT_FOCUS` is dropped there, and no SessionStart hook lists the open items after it. Refused value: none; the focus and the open-items listing are the loss, said in the move's line.
- pi: `/compact [focus]` runs `this.#session.compact(focus)` (`pi-runtime.ts` 1134-1144, `COMPACT_COMMAND`); "pi summarizes with the session's model (`const model = this.model` in AgentSession.compact and its auto-compaction)" (1013-1014); its `compaction_end` gives the boundary and summary. Settings: "`compaction.enabled` … `compaction.reserveTokens` 16384 … `compaction.keepRecentTokens` 20000 … `compaction.modelOverrides`" (https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md): token settings only, no summariser model. No open-items hook either.

**As the summariser (`summary`).** `summariserRun` (server.ts 17529) spawns any harness: `spawnFromHub(… { harness: summarizer.harness, model, account, title: "Summary of …", scratch: {} }, "summariser", "check", mode)`, sends the prompt ("Use no tools. Reply only with the summary."), and reads the stored answer. So all three harnesses take the value in the code. Only Claude (Sonnet, Haiku) was measured: A7d and A7g did not run. The policy editor offers every installed harness, and the report names the two unmeasured ones as checks (§7).

**Refused or unavailable values, from the code.**
- `native` at `beforeMove` on a session whose sign-in is refused: it cannot run where it is ("A refused credential can't go on where it is at all … and it is moved whole, never compacted", `decideStop` header), so `refused-credential` always takes `atLimit`.
- `native` on a session whose work item is finished: the at-limit port `compactable: (row) => !inputRefusal(row.id, { kind: "system", name: COMPACTION_ORIGIN })` (server.ts 29237); it "moves whole and is not compacted, never held behind a step that can't be sent". Unchanged.
- `summary` whose summariser cannot fit the input: `contextFitRefusal(window, summariseInputTokens + SUMMARISER_OUTPUT_RESERVE_TOKENS)` ("needs 1,100k context, has 1,000k", or "context window unknown"). What then is the owner's pick (§6, pick 4).
- `whole` on a context the target model's window cannot take: the benchmark's "Prompt is too long" at c20 (958k) and c23 (965k); today `decideStop` prices `Math.min(session.context, session.window)` and moves anyway. Pick 7.
- `summary` on a source the hub cannot read (`locateSession` answers `nowhere`, `away`, `unanswered`): `prepareContinuation` throws; the move is held with that word, as a Continue is refused today.

## 4. The summariser path

**Its input is A4's, not today's extract.** `packages/core/src/continuation-read.ts` builds `Extracted.middle` hiding old tool output; the bench's A4 is "full live scope with each tool result clipped (`render_conv`, 4,000 chars)" (PAPER §4.1), with the prompt's first line changed from `OLD_SENTENCE` to "Tool calls and their results are kept, each clipped to its head and tail." (arms.py `FULL_SENTENCE`). The change: the middle keeps every user turn, assistant text, tool call and tool result in order, each result clipped to 4,000 characters of head and tail, nothing hidden; the tail split stays (`TAIL_USER_TURNS = 6`, `TAIL_CHARS = 16_000`, which the bench checked against its own: "the bench's tail split differs from methods.cawco_extract's; the A4-A7 input would be wrong" stops a run). `summariserPrompt`'s first sentence says the new rule. One extract: the hiding one is deleted, not kept beside. `summariseInputTokens` grows with it, so the fit check and the form's `sizing` line matter more (check in §7).

**The prompt and the opening stay.** `SECTIONS` (Goal and constraints … Open items and next step) and `openingMessage` (summary, Open items from records, artifact index with the git section, the last turns verbatim) are what A4 opened with ("the CawCo opening: a header, the summary, an artifact index built by code, and the last turns verbatim", PAPER §4.1).

**Who writes it.** `Compaction.summarizer`: Sonnet 5.5 on the Claude harness by default; `account` absent, so `spawnFromHub` places it as any start (an account with room, never the one at its limit, which placement reads as out of room). Its transcript is scratch, left out of catalogs, as today.

**At the limit (`atLimit: "summary"`).** `decideStop` chooses the target account exactly as now (rules 1-9). Where today the hub calls `relaunchMoved(…, compact)` and `startCompaction`, it starts a hub-asked continuation under the one-session rule (server.ts 18854-18867): "a continuation anything but the person's own Continue asked for … is the session going on in a fresh conversation, never a second session. Once its opening has gone, the source is folded into the new session (db `foldContinued`): its id is a former id of it, so a send, a handoff, a tab or a link that names it reaches the new one". So the session keeps its id, title, work item and parent; its refused turn's message is "owed again, and goes with what it was owed, behind the opening", which is the carry-on; the new conversation starts on the target account, on the source's harness and model. No filing turn: nothing can run on the source; the opening's Open items section is built from the records as they stand (`openItems.read`). The move's line says it: "Moved to B, continued from a summary · Sonnet read 480k tokens once" (core `compactedMoveWords` rewritten for the three methods).

**Before a move (`beforeMove: "native"`).** The step machine that runs today on the target after the move (`carrying` → `filing` → `compacting`, `limit_compactions`) runs on the source before it: the filing turn (`filingPrompt("compacted")`), then `/compact ${COMPACT_FOCUS}` warm, each `ahead` of everything owed with every other send held, then the move with the compacted context, cold but small. A person's interrupt or stop of either step ends the compaction, and the move goes whole, as rule 8 would have moved it. `beforeMove: "summary"` is the same continuation as at the limit, with a filing turn first since the source can run (`filingPrompt("continued")`, as a person's Continue does). This replaces rule 8's "at a forecast … it is never compacted" and the "warm" stay.

**`moveWholeUnderK`.** Unchanged in meaning and in `decideStop` (`reported >= policy.moveWholeUnderK * 1000`): under it every method is `whole`. It stays in `AtLimit`, not in `Compaction`, because the forecast's cold-move floor also reads it (`decideStop` rule 8: `projectedMove(session, policy.moveWholeUnderK * 1000, …)`).

**`prepareAtPct`.** Deleted, not revived. Its reader went in a6d82ddc4 ("Removed: prepare, summariseOn, the kept-summary table, the in-place continuation"); the core comment says "Read by nothing (the summary written ahead of the limit it timed is gone)". The ahead-of-limit moment is the forecast, and `beforeMove` covers it with the cheapest method measured. It is "sent at its default only because the TestFlight builds 20261015 and 20261015.3 require it, which the hub's wire check holds to (packages/hub/scripts/openapi.ts). It goes in the change that expires them." Pick 6 says when.

## 5. The cutover: one path decides compaction

Deleted:
- `AtLimit.prepareAtPct`, `DEFAULT_AT_LIMIT.prepareAtPct`, the `prepareAtPct` fields of `continueBody`'s sibling `PUT /api/accounts/routing/:provider` body and its "Kept for the shipped apps" line, `AtLimitSchema.prepareAtPct` in both stored-shapes, `Accounts.swift`'s field (with the TestFlight expiry).
- `decideStop`'s inline `compact:` computation on `StopTarget` and the forecast branch of rule 8 (`cause === "forecast" && coldTier.length > 0 && warm` → `wait("warm")`), `stayWords`' `warm` case, and `at-limit.ts` header's "Nothing here summarises a session or starts a fresh conversation" and "At a forecast … it is never compacted".
- The extract that hides tool output in `continuation-read.ts`, and `summariserPrompt`'s "Old tool output is hidden" sentence.
- `continuationRefusal`'s "Choose who summarises the session" refusal (the policy's summariser stands in).
- `AccountMove.compact?: CompactStage` as a Claude-only four-stage field, and `compactedMoveWords`' "Claude Code's own /compact" wording.
- The dashboard words `accountsWords.atLimit.over` ("Compact it after the move if it's over") and `compacts` ("It files its open items, then Claude Code's own /compact runs"), and `AtLimitBlock.svelte`'s header comment.

Replaced by one function, `compactionPlan` in `at-limit.ts`, called by every mover (limit, refused credential, extra usage, forecast, a person's move), answering `{ method, when: "before" | "after", summarizer }` from `(cause, carries, reported, policy.moveWholeUnderK, routing.compaction)`:
- `carries` or `reported < moveWholeUnderK * 1000` → `whole`;
- the source can run (`forecast`, `extra-usage`, a person's move) → `compaction.beforeMove`, `when: "before"`;
- it cannot (`limit`, `refused-credential`) → `compaction.atLimit`, `when: "after"` for `native`, a continuation for `summary`.

Kept, moved: the step machine (`limit_compactions`, `startCompaction`, `sendStep`, `compactionSend`, `advanceCompaction`, `recoverCompaction`, `nextCompactionStep`, `stopCompaction`, `observeCompaction`) stays the one way a native compaction is run by the hub, gaining `when` (its `compacted` read from each harness's boundary: Claude `compact_boundary`, OpenCode `summary: true`, pi `compaction_end`, by `compactSummary` in core harness.ts 822-829) and the account to move to after it. Kept as is: `summariserRun`, `prepareContinuation`, `startTarget`, `foldContinued`, `openItems.read`, `filingPrompt`, `COMPACT_FOCUS`, the Continue form and `continue_session`.

The benchmark folder (`cawco-safe/compaction-bench-run`) is not part of the product and stays where it is.

## 6. Picks for the owner

1. **Where the policy lives.** (a) On each provider's routing, in the At the limit block, fleet-wide (recommended: the movers read the routing, the editor and wire exist). (b) One fleet-wide row under Configure, all providers alike. (c) Per project, with the routing as the default.
2. **The summariser's default model.** (a) Sonnet 5.5 (recommended: A4/A5's model; never outside the floor). (b) Haiku 5.5 (A3: $11.09, within the floor over all cuts, outside at 100-300k; cheapest only at 600k+). (c) The session's own model (unmeasured as a summariser; dearest).
3. **The summary's sections.** (a) CawCo's five (A4; recommended: the only summary arm never outside the floor; first over the whole horizon). (b) Claude Code's nine (A5; $2.22 cheaper over 20 turns, struck at 100-300k and at 300-600k over the whole horizon). Not both: E4 is not actionable.
4. **When `summary` cannot run** (the summariser's window does not fit the input, no account has room for it, the source cannot be read). (a) The session is held in Needs you with the refusal, as a refused Continue is today (recommended: no fallback). (b) It takes `native` for that move, said in its line.
5. **`moveWholeUnderK`.** (a) Keep 200 (recommended: E6's 177k cuts split one each way; the floor is the forecast's cold-move price too). (b) 177, the report's figure.
6. **`prepareAtPct` and the TestFlight builds.** (a) Expire builds 20261015 and 20261015.3 in this change and delete the field (recommended: the field is dead and the policy changes shape anyway). (b) Keep sending the default until a later change expires them.
7. **`whole` as a value.** (a) Offered at both moments (recommended: A0 is the top quality in every table and within the floor; a person who values nothing lost gets it); a context past the target's window is refused with "Prompt is too long"'s own words before the move. (b) Not offered: it is never the cheapest.
8. **The warm same-organization case.** (a) Left to the harness's auto-compaction, no field (recommended: nothing of CawCo's runs there and native wins). (b) A fleet switch that turns every harness's auto-compaction off (`DISABLE_AUTO_COMPACT`, `OPENCODE_DISABLE_AUTOCOMPACT`, pi `compaction.enabled: false`), for sessions to be kept whole until a person compacts.
9. **OpenCode and pi as summarisers before they are measured.** (a) Offered now; the editor says they were not measured (recommended: the code runs any harness; the owner asked "even from another harness"). (b) Refused until A7d and A7g have run.
10. **Native on OpenCode and pi after a move.** (a) `native` sends their own `/compact` without the focus (OpenCode) and without the open-items listing after it (both), said in the line (recommended). (b) `native` is refused for them and the policy's `summary` runs instead.

## 7. Checks the design still depends on (for the orchestrator)

- **A7d and A7g**: OpenCode (`opencode-go/…`) and pi (`openai-codex/…`) writing A4's prompt; not run (dead key; usage limit). Decides pick 9's wording and whether their rows join the ranking.
- **A4's input against the summariser's window**: the largest `make1.prompt.txt` under `out/runs/*/A4/*/` in tokens (`estimateTokens`) against Sonnet 5.5's window, per band; at 600k+ the full-clipped input may not fit a 1M window with `SUMMARISER_OUTPUT_RESERVE_TOKENS`, which decides how often pick 4 happens.
- **The product's summariser against the bench's call**: A4 ran as a bare model call (`llm.call`, no system prompt of a harness); the product runs it as a Claude Code session with the harness's system prompt and "Use no tools". One run of A4 through `summariserRun` at three cuts, judged as the bench judged, before the default is trusted.
- **OpenCode's `session.compact` body**: whether the SDK takes a model for the compaction (its `node_modules` are not in this clone; the config schema's `compaction` has `auto`, `keep.tokens`, `buffer`, `tail_turns` and no model). Decides whether OpenCode's native could ever run on a cheaper model.
- **A filing turn's worth at the limit**: the summary path cannot file first; the 2026-10-16 eval's "native compaction with the open items filed first 47%, and with only the records that already existed 17%" was measured on native, not on A4. A run of A4 with and without a filing turn, if the owner wants the number.
- **The warm compaction's window cost on the source before a forecast move**: E5's formula (0.2-0.4% of a session window per manual compaction) against the account's remaining room at the forecast, to confirm `beforeMove: "native"` never tips the source into its limit mid-step.

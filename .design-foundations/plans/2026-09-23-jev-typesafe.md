# Jev (TypeSafe) in CawCo — decisions and spec

Owner session 2026-09-23. This file is the record; every change to the plan below is appended to the
decision log at the bottom with the owner's words.

## Sources

| Claim | Source | Quote |
|---|---|---|
| Jev is on OpenRouter, billed to the OpenRouter key | https://openrouter.ai/docs/guides/community/jev | "`typesafe/jev-1.13` (or the `~typesafe/jev-latest` alias) is available to anyone with an OpenRouter API key" |
| Endpoint + model id mapping | https://openrouter.ai/docs/guides/community/typesafe-sdk | "`jev-latest` is routed as `~typesafe/jev-latest`" |
| Price | https://openrouter.ai/~typesafe/jev-latest | "$0.042/M input tokens and $0.00/M output tokens" |
| Context limit | same | "32,000 token context" |
| OAuth PKCE flow | https://openrouter.ai/docs/use-cases/oauth-pkce | "Localhost callbacks are supported on any port." |
| Jev does not generate text | https://docs.typesafe.ai/concepts/system-one.md | "System One models do not write replies, produce code, or generate explanations" |
| Questions run in parallel, one call | https://docs.typesafe.ai/introduction.md | "Every question is evaluated in parallel and in isolation against the same state" |
| Structured instructions allowed | https://docs.typesafe.ai/api.md | "Put the question in one field and the data in the others" |
| Claude can swap MCP servers only between turns | https://code.claude.com/docs/en/agent-sdk/typescript.md, https://github.com/anthropics/claude-code/issues/51238 | "tools from servers that connected are available on the next turn" |
| pi can swap tools at runtime | https://pi.dev/docs/latest/extensions | "Use `pi.setActiveTools()` to enable or disable tools … at runtime" |

## Standing rules (owner)

- No `.env`: all configuration lives in the hub DB and is edited on the Settings page.
- No fallbacks: when OpenRouter is not connected or Jev errors, the feature does not run and says so. Nothing
  silently degrades to keyword matching or to a full list.
- UI is a "really nice implementation, no cheap impls", animated, modern CSS (`moderncss` skill), FLIP on
  changing suggestions.

## 1. OpenRouter connection (shipped in 8738148)

- Settings page `/settings`, OpenRouter section: Connect (PKCE S256, verifier held in the hub), key stored in
  `openrouter_connection` in the hub DB, never sent to the browser. Disconnect deletes it.
- Supervisor LLM config moved to Settings; its `CAWCO_SUPERVISOR_*` env fallback deleted.

## 2. Meaning rules (shipped in 8738148)

- Rule match kind `meaning`: the pattern is a yes/no question. All in-scope meaning rules for a message/turn go in
  ONE Jev call; noul ≥ `MEANING_THRESHOLD` (0.8, own call, to tune) fires the rule through the same path a
  phrase match takes. Not allowed at `immediate` timing. State is the last 60,000 chars of the text.

## 3. Composer suggestions (in progress)

- When the owner pauses typing for `SUGGEST_PAUSE_MS` = 1500 ms (owner: "1-2 second debounce"), the composer
  asks the hub `/api/suggest`; the hub asks Jev one noul per candidate: "To carry out `prompt`, would the agent
  need to use `candidate`?"
- Chips (max `SUGGEST_MAX` 4, noul ≥ `SUGGEST_THRESHOLD` 0.6, both own calls) render in the composer; clicking one
  appends editable text (``Use the `x` skill.`` / ``Use the `x` MCP tools.`` / ``Use the `x` tool.``). The harness's
  tool set is never changed (owner: "instead of adjusting the tools in the harness itself").
- Candidate descriptions cut to `SUGGEST_DESC_CHARS` = 150 chars (owner: "shorten descriptions").
- Candidates are ranked by the owner's real usage and capped at the top `SUGGEST_CANDIDATE_LIMIT` = 50 across
  skills, tools and MCP servers together (owner: "keep track of skills that i'm using or not using and only send
  the top 50 i'm actually using often", "skillls/tools/mcps").
  - Usage: `capability_usage_daily` (kind `skill`|`tool`|`mcp`, name, day, count), counted by the hub from frames
    it already sees; backfilled once from the last 30 days of transcripts.
  - Score: Σ count × 0.5^(age_days / 14) (`USAGE_HALF_LIFE_DAYS`, own call). Candidates are ranked by **share
    within kind**: score ÷ the summed score of every sent candidate of the same kind (skill / tool / mcp), because
    raw tool counts are ~270× skill counts and cannot be compared across kinds. No per-kind quotas. Zero-score candidates are not sent,
    except skills installed in the last 7 days.
- Settings toggle "Suggest skills and MCP servers while typing", default off, disabled until OpenRouter is connected.
- Motion: staggered `@starting-style` entry, FLIP (`animate:flip`) on reorder, out-of-flow exits,
  `interpolate-size` row height, shimmer only after 150 ms in flight, all motion opt-in under
  `prefers-reduced-motion: no-preference`.

## Cost estimate (own calculation from the transcript index, 2026-08-24 → 2026-09-23)

Usage: ~170 prompts/day (peak 570), ~2,700 assistant messages/day. At $0.042/M input tokens:

| Feature | Per month |
|---|---|
| Meaning rules per turn | ~$0.30 |
| Meaning rules per message | ~$2.50 |
| Suggestions, top 50 candidates, 1.5 s pause, 150-char descriptions | ~$1 |

Measured 2026-09-23 on a copy of the live DB with the owner's key:

- `/api/suggest`, 169 candidates sent (every skill, tool and MCP server known), 50 asked after ranking:
  3,620 input tokens, $0.000152 per call, 532 ms round trip. At ~170 prompts/day and roughly one ask
  per prompt that is ~$0.026/day, ~$0.80/month.
- Meaning rule, one rule per turn: ~$0.0000135 per call (noul 0.97 on a fallback turn, 0.03 on a clean one).

Backfill on the same copy: 992 transcripts touched in 30 days → 288 skill, 77,072 tool, 11,535 MCP uses.
Of 124 scored candidates (47 skills, 66 tools, 11 MCP servers), 74 fall outside the top 50, including 37 of
the 47 used skills: tool counts outweigh skill counts by ~270×, so a single combined list is mostly tools.

After switching to share within kind (same copy, same 169 candidates): the top 50 is 34 skills (8 of them the
always-included new installs), 14 tools, 2 MCP servers; 17 used skills fall outside it (was 37). Live
`/api/suggest`: 50 asked, 3,509 input tokens, $0.000147 per call, 380 ms.

## Proposed, not approved

- Jev pre-gate for the supervisor: five audit nouls; call the GPU LLM only when one fires.
- Settings view of capability usage (used / unused skills, tools, MCP servers) to help prune the fleet.

## Decision log

- 2026-09-23 — "by adding openrouter oauth to cawco in settings then using jev latest via openrouter, no .envs"
- 2026-09-23 — "no fallbacks, it should be configurable in the settings page too" → supervisor env fallback removed, config in Settings.
- 2026-09-23 — Harness-level tool filtering considered and dropped in favour of composer chips ("instead of adjusting the tools in the harness itself").
- 2026-09-23 — "make sure you're doing a really nice implementation, no cheap impls here" / "and animated!" / "with FLIP on changing suggestions"
- 2026-09-23 — "ask only when i pause, like a 1-2 second debounce" / "shorten descriptions" → 1500 ms, 150 chars.
- 2026-09-23 — "only send the top 50 i'm actually using often" / "skillls/tools/mcps" → one usage-ranked top-50 across all three kinds.
- 2026-09-23 — "connecting openrouter seems to work" → key stored 07:10:14 UTC. First live call (2 nouls, short state): HTTP 200 in 0.68 s,
  model `typesafe/jev-1.13-20260917`, 349 input tokens, cost $0.0000147; shim question 0.97, "say the word" question 0.04.
- 2026-09-23 — The keyword rule on "backwards" fired twice on the orchestrator's replies that only named the rule and quoted a
  test sentence. Same reply through Jev: the loosely worded question scored 0.93 (would also misfire); a question that
  says "in its own work (not quoting, testing, or describing an example)" scored 0.08. Lesson for meaning-rule
  wording: say whose action counts and exclude quotes/examples. Proposed: convert that rule to a meaning rule with the
  sharp wording (awaiting owner).
- 2026-09-23 — "make these rules dynamic and trigger on each response … you analyze and decide". Evaluated candidate
  questions on 32 real assistant messages (2026-09-01→) in the engine's exact wording. Replaced the fleet's 7 keyword/LLM
  rules with 5 `meaning` rules, timing `message`, watch `text`, requireAck on, the owner's own reply texts:
  No compatibility code (7ba02151), Asks permission instead of doing it (a671da96), Hands work back to me (6793b53c),
  Shortcut or narrowed scope (b7127aac, absorbs "Doing it well"), Leaves a known problem unfixed (698fba22, absorbs
  "Honest Deez Nuts"). Removed 51ffc1d3 and 8939331e. Mid-stream interrupt is gone (meaning rules cannot run at
  `immediate`); replies queue at the next turn boundary. Live hub log confirms per-message evaluation at
  $0.000023–0.000028 per message → ~$2/month at ~2,700 messages/day, ~$0.27 on the busiest day (10,480 messages).
- 2026-09-23 — "there has been 0 instances where the models actually acknoweldged … it doesn't even tell the model that it
  needs to acknowledge them". Verified: 3 acks out of 100 requireAck fires; 97 pending across 81 sessions. Cause:
  `rules.ts#body` sends the reply verbatim by design ("no mention of cawco or of a tool") and the note tool is described
  as being for user concerns only. Orchestrator cleared the 97 stale pending fires through the hub's ack endpoint with a
  note saying who cleared them and why. Fix briefed (branch `rule-ack`): requireAck replies end with a line naming the
  harness's note tool; the tool's description covers rule messages.
- 2026-09-29 — reversed: "agents keep using a 'note for user' tool in cawco instead of simply replying to me, they are
  talking to the wall … they need to just acknoweldge it, i don't read these notes nor do i need them". The note tool, the
  ack endpoints, the appended line and the stored note are deleted. The reply goes out exactly as written; a pending rule
  re-arms when a later turn of that session ends without matching it again. `requireAck` is renamed `repeat` (fire again
  on every later match vs once per session); the ten-in-a-row ceiling stays.
- 2026-09-23 — `eff3036` live. Measured: combined top-50 by raw decayed score was mostly browser tools (tool calls ≈270× skill
  invocations), dropping 37 of 47 used skills — misses "top 50 i'm actually using often". Orchestrator decision: rank by
  share within kind (score ÷ kind's total), no quotas. Briefed to the suggestions delegate.
- 2026-09-23 — "Leaves a known problem unfixed" misfired 3× on progress updates whose open items were already delegated.
  Sharpened its question (exclude "remaining work already handed to someone doing it now"): the misfiring reply 0.90 → 0.40;
  eval true positives held (0.89/0.84/0.87); options-list false positive 0.85 → 0.77. Applied to rule 698fba22.
- 2026-09-23 — "when an auto reply is triggered, after i refresh, it shows as if it's my own message … styling is inconsistent".
  Cause: stored transcripts drop `origin`; rule messages carry no text marker (hand-offs/asks do), so a reload renders them as
  the owner's turn; live they borrow the peer bubble. Fix briefed on `rule-ack`: `[Rule: <name>]` marker line on every rule
  message (hub rules + supervisor), a dedicated `user.rule` row for live and stored, styled as a system row.
- 2026-09-23 — Owner: "the delegate auto responses should be styled like the app". Scope widened to all injected rows (rule,
  delegate report, hand-off, delegate ask) as one system-row family; briefed on branch `auto-rows`.
- 2026-09-23 — Share-within-kind ranking live (`0b4929a`): top 50 = 34 skills, 14 tools, 2 MCP servers. Live chip check on the
  owner's dashboard with real Jev: make-interfaces-feel-better 0.88, interfaces:better-ui 0.86, ui-observer 0.85, claude-in-chrome
  (skill) 0.76; setting restored to off. Found: MCP/tool candidates come only from a live `system.init`, so after a hub restart
  or reload an idle session offers skills only. Fix queued: hub stores each instance's latest init tooling.
- 2026-09-23 — `c33d4fe`: MCP usage is recorded under the `mcp__<server>__` prefix (`Exa_ai`) while the composer sends the
  display name (`Exa.ai`), so used servers were never asked about; ranking now looks usage up by the sanitised name. The Jev
  question became "Is `candidate` made for the task `prompt` describes?": deep-research 0.39 → 0.74 for "we should really
  research this", with typo/rename/commit prompts still under 0.6. Candidate descriptions go to Jev at 300 chars (at 150,
  impeccable lost "frontend interface").
- 2026-09-23 — Last agent message removed from the Jev state (`032c72c`, state is `{ prompt }`). Measured by bc5f9aed: Jev read
  "this" as the last message's topic; deep-research 0.44 with it, 0.83–0.84 without, across 3 live sessions, and 4 of 6 live
  sessions showed no chip because of it. Orchestrator decision: suggestions judge the draft alone.
- 2026-09-23 — Tooling persisted (`826f88f`): the hub stores each init's MCP servers and tools in `instances.tooling`
  (migration 0042) and the composer reads the row, so a reload or hub restart keeps them (396c6e7b had offered skills only).
  With tools now always present, the top-50 pool on c2fa7b78 became 33 skills / 15 tools / 2 MCP, and deep-research (1 lifetime
  use) fell out of it. Orchestrator decision: correct under the owner's rule — "only send the top 50 i'm actually using often" —
  so no per-kind quotas and no separate skills call.
- 2026-09-23 — MCP tools collapsed into their server chip: `mcp__<server>__…` tools are never candidates (hub rule, and the
  dashboard stops sending them). Before, "we should really research this" filled 3 of 4 chips with Exa (web_search_exa 0.92,
  Exa_ai 0.90, web_fetch_exa 0.87). Chips also tint by confidence (8% → 32% accent across noul 0.6 → 1), with Tab adding the top
  chip and Shift+Tab adding all (`79584e1`); owner: "color tinted based on confidence … sorted by confidence, with some kind of
  shortcut to insert them via keyboard, and a shortcut to insert all".
- 2026-09-23 — Auto-rows marker contract (`d33fc579`): every injected message (rule, supervisor reply, hand-off, workflow step
  brief and notice, delegate report and ask) opens with a marker line that `@cawco/core` builds and parses. The dashboard
  classifies live, mid-turn and stored copies through one function, so a reload renders the same system row; stored workflow
  briefs and notices no longer render as the owner's turn. Owner: "after i refresh, it shows as if it's my own message".
- 2026-09-23 — One chip per capability, by name: after thresholding, `suggest()` keeps only the likelier entry when the same
  name comes back as more than one kind. The final probe had returned both mcp:claude-in-chrome 0.81 and skill:claude-in-chrome
  0.66, and Shift+Tab inserted both sentences. Orchestrator decision, same rule as the MCP-tool collapse.

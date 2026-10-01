# Supervisor LLM — rule kind "LLM", per-session autopilot, real assistant panel

## Context

CawCo's operator wants an LLM that watches agent sessions and responds on their behalf —
primarily as an **adversarial "whip"** that beats bad patterns out of coding agents (false
done-claims, permission-seeking stalls, scope drift), plus a per-session **autopilot** with a
standing custom prompt that keeps long runs moving and escalates real decisions to the operator.
This is also the first slice of making the mocked assistant panel real.

**Exploration verdict (verified this session):** the hub already assembles "what the agent said"
at turn end (`lastAssistant` accumulator, `packages/hub/src/server.ts:3568-3583`) and already
does "turn ends → inspect → reply wakes session" (`RuleEngine`, `packages/hub/src/rules.ts:270-305`).
No LLM-calling code exists anywhere in the repo. The brain is **locallm-router** at
`http://localhost:30000` (same box as the hub): OpenAI-compatible passthrough, model
`qwen3.8-27b` (aliases `qwen3.8`/`default`), vLLM AWQ, 128K ctx,
`--enable-auto-tool-choice --tool-call-parser qwen3_xml`, no auth, lazy-loaded/idle-evicted
(cold start tens of seconds to minutes — the engine must tolerate slow/failed calls, never block
frames, never crash, never spam).

## Operator decisions (binding)

1. **Trigger shape: new rule kind "LLM"** — extend the rules engine; not a new concept, not the
   fleet-hooks system.
2. **Autopilot: per-session; toggle lives in the session composer** (popover with standing prompt).
3. **Permissions: escalate only.** The supervisor NEVER answers permission prompts.
4. **UI: build the real assistant panel** (mocked shell), containing supervisor status + autopilot
   state + intervention log. No chat composer this slice.
5. **Persona: adversarial by default** — the fixed harness is a skeptical auditor ("whip");
   the operator's prompt adds what to watch, not the stance.
6. **DW-9b.2 override recorded**: JOURNEY.md recorded "zero silent actions" for the assistant;
   the operator explicitly overrides that for supervisor/autopilot (opt-in per session/rule).
   Leaf C5 files the dated override in JOURNEY.md's decision log. The panel's own cross-session
   actions keep the DW-9b.2 approval contract; this slice does not build them.

**Interaction with qwen: Vercel AI SDK (operator decision).** The hub calls the router through
`ai` + `@ai-sdk/openai-compatible` (`createOpenAICompatible({baseURL})`): verdicts via
`generateObject` with a valibot schema (AI SDK v5 accepts any Standard Schema — valibot v1
implements it); streaming/`streamText`/tool loops come free for the future
assistant chat. Still no agent framework and not an opencode session (that would make the
supervisor a harness process with custody/transcript for a stateless verdict).

## Execution mode

Unlazy orchestrated. First implementation act: create `.unlazy-supervisor/` with `PLAN.md`
(the contracts below, frozen) + `gates/<leaf>.md` per leaf, mirroring `.unlazy-liveness/`.
Subagent routing (operator order 2026-09-01): ALL execution leaves run on opus (Opus 5); fable
is design-only; `model` passed explicitly on every Agent call; served model verified per leaf.

## Contracts (frozen before fan-out)

### C1 — Rule shape gains trigger/action/prompt (core)
`packages/core/src/rules.ts`:
```ts
export type RuleTrigger = 'pattern' | 'every-turn';   // default 'pattern'
export type RuleAction  = 'reply' | 'llm';            // default 'reply'
// Rule/RuleDraft gain: trigger: RuleTrigger; action: RuleAction; prompt: string | null;
```
Legal combos: `pattern+reply` (today, unchanged), `pattern+llm`, `every-turn+llm`.
`ruleProblem` refuses: `every-turn+reply`; `llm` with `timing !== 'turn'`; `llm` with
empty/short prompt; `llm` with `requireAck: true`. Pattern checks skipped when
`trigger === 'every-turn'`; `reply` not required when `action === 'llm'`. Extend
`ruleSentence`/`blankRule`/`draftOf`. Move `RuleEngine.#inScope` to core as `ruleInScope(scope,
facts)` (shared by both engines). **`RuleEngine.reload()` filters to `action === 'reply'`** —
the existing engine never sees LLM rules.

### C2 — Verdict contract (structured output, single shot — no tool loop)
One `generateObject` call per evaluation (AI SDK → `POST /v1/chat/completions` under the
hood) with the valibot schema below; default output strategy is the provider's structured-output
mode, and A3's live gate runs it against the real router before B1 — if vLLM's guided decoding
misbehaves, the recorded fallback is `generateObject`'s JSON mode with the schema demanded
in-prompt. Schema (valibot, shown as JSON):
```json
{ "verdict": "silent" | "reply" | "escalate" | "ask_operator",
  "message": "sent into session (reply) or shown to operator (escalate/ask); empty for silent",
  "note":    "one private line of rationale — logged, never sent" }
```
`ask_operator` honored only for autopilot; from a rule it's coerced to `escalate` (logged).
Parse failure / timeout / router refusal ⇒ verdict `error`, logged, **no-op toward the session**.

Prompt assembly:
- **system** = fixed adversarial harness + `"Operator instructions:"` + rule prompt or autopilot
  standing prompt. The harness stance (operator decision 5): you are the operator's supervisor
  over an AI coding-agent session and answer on their behalf; be a skeptical auditor —
  a completion claim without evidence is unverified, "would you like me to…" is a stall,
  numbers without a source are suspect, silently narrowed scope is desertion; you NEVER answer
  permission prompts (those go to the operator); default to `silent` when the turn is honest
  work in progress; the verdict contract.
- **user** = session metadata (cwd leaf, hostname, harness, model, title), turn attribution
  ("this turn was started by your own previous message: yes/no", consecutive count), files
  touched this turn (deduped from main-loop `tool_use` inputs — keys
  `file_path`/`path`/`notebook_path`, `command` for Bash rendered as commands; `glance` idiom
  `telegram.ts:187-194`; cap 40, our choice), the agent's final turn text (tail-clamped, per the
  `RULE_SCAN_LIMIT` tail precedent `core/rules.ts:153`), the supervisor's last 3 log rows for
  this session.
- Budget: user block ≤ 24,000 chars (our choice — ~6K tokens; cold AWQ 27B under VRAM contention
  argues lean); `max_tokens: 600`, `temperature: 0.2` (our choices — verdicts are short/stable).

### C3 — SupervisorEngine (new `packages/hub/src/supervisor.ts`)
Constructed inside `createServer` beside `RuleEngine` — **`HubServices`/`RegistryShape` do NOT
change** (keeps `stream-e2e.test.ts` compiling untouched). Deps: `db`, `agent(machineId)`,
optional `telegram`, `publish`, llm module (tests point config at a fake HTTP server).

- `observe(instanceId, msg)` called right after `ruleEngine.observe`, same throw-nothing
  envelope. Buffers turn text (same `spoken()`/`parent_tool_use_id` rules as
  `hub/src/rules.ts:62-66,153`) + tool files. On `result` `subtype !== 'aborted'`: schedule
  evaluation; `aborted`: flush only.
- **Selection — exactly one evaluation per (instance, turn end):** autopilot enabled ⇒ autopilot
  only; else first enabled in-scope `action:'llm'` rule whose trigger matches (`every-turn`
  always; `pattern` via core `ruleMatches`), `createdAt` asc. (Our choice: two responders into
  one session is incoherent.)
- **Loop guards (all four):**
  1. One in flight per instance; a turn ending mid-flight is logged `skipped` and dropped.
  2. Turn attribution by own-send flag: send sets `initiatedTurn`; next `result` consumes it —
     set ⇒ `consecutive++`, clear ⇒ reset 0. Supervisor-initiated turns ARE evaluated (autopilot
     must see whether it was obeyed) with attribution stated in the prompt.
  3. `SUPERVISOR_CONSECUTIVE_MAX = 3` (our choice — two self-corrections, then a human): at cap,
     `reply` is converted to forced `escalate` ("autopilot hit its consecutive-reply limit") and
     the instance is muted until a non-supervisor-initiated turn resets the counter.
  4. Staleness: evaluation records its `result` timestamp; a newer `result` before delivery ⇒
     `skipped(stale)`.
- Rule bookkeeping: non-silent rule verdicts call `db.noteRuleFire`, respect
  `RULE_FIRE_CEILING` (=10, sourced `core/rules.ts:117`) per (rule, instance); the
  once-per-session block for `requireAck:false` does NOT apply; `rule_state.status` never goes
  `pending`. Autopilot touches no `rule_state`.
- **Concurrency/timeouts:** global semaphore `SUPERVISOR_MAX_CONCURRENT = 2` (our choice — one
  GPU box; slot 2 stops cold-start head-of-line blocking; more would stampede), wait-queue cap
  16 then `skipped` (our choice). Per-evaluation budget 240,000 ms (sourced:
  `TRANSCRIBE_TIMEOUT_MS`, under the router's 255s socket cap), warm 120,000 / poll 3,000 /
  management 15,000 ms (sourced: telegram-media.ts:34-41). All evaluation off the frame path.
- **Delivery** (`reply`): re-check row + `registry.agent(machineId)` present; then the exact
  `RuleEngine.#fire` envelope, `shouldQuery: true`, `urgent: false`, origin per C7, body = LLM
  message **verbatim** (no header — rules-engine doctrine `rules.ts:307-324`).
  Unreachable/dead ⇒ `skipped(unreachable)`, no hub-side revive this slice (risk noted).
- **Escalation/ask:** always log row + broadcast frame; plus `telegram?.onSupervisor(instanceId,
  text)` — new bridge method mirroring `onError` (`telegram.ts:441-449`): header 🤖 + reason +
  agent's last text clipped 900 + dashboard link, sent and `track`ed ⇒ **a Telegram reply routes
  into the session via existing `talkBack` with no new code** (verified `telegram.ts:507-563`).
  Permission machinery untouched — escalations are ordinary tracked messages, never asks.

### C4 — LLM client (AI SDK) + provider config
`packages/hub` gains deps `ai` + `@ai-sdk/openai-compatible` + `valibot` (v1.x — operator
choice over zod; AI SDK v5 takes Standard Schema natively). New `packages/hub/src/llm.ts`:
- `verdictFor({baseUrl, apiKey?, model, system, user, timeoutMs}) → {verdict, latencyMs,
  model} | {error}` — `createOpenAICompatible({name:'supervisor', baseURL, apiKey?})` +
  `generateObject({model, schema: VerdictSchema (valibot), system, prompt, maxOutputTokens: 600,
  temperature: 0.2, maxRetries: 1, abortSignal: AbortSignal.timeout(timeoutMs)})`. Error
  mapping from `APICallError.statusCode`: 404 → unknown model, 507 → VRAM, 503 → cooldown,
  abort → timeout (refusal vocabulary mirrors telegram-media's `refusal`).
- `probe(baseUrl, handle)` — plain fetch of `GET /v1/models` (catalog/named idioms).
- No warm/poll dance (our choice — the router lazy-loads on the completion request itself and
  the 240s budget covers a cold start; fewer moving parts than telegram-media's warm loop).
  Streaming (`streamText`) deliberately unused this slice; it is the reason the SDK is here —
  the future assistant chat reuses this exact provider instance.

Config: configure it in Settings — the single-row table `supervisor_config` (`id`='supervisor',
`enabled` default false, `baseUrl`, `model`, `apiKey` nullable, `updatedAt`) is the only source;
precedent `fleetMemory`/`MEMORY_ID`. No row ⇒ disabled, status "not configured". (Amended
2026-09-23: the `CAWCO_SUPERVISOR_URL/_MODEL/_KEY` env bootstrap was removed.)

### C5 — Autopilot state
- `instances` gains JSON column `autopilot`: `{enabled, prompt, updatedAt} | null` (idiom:
  `rules.scope`). Disable keeps prompt; survives hub restart; dies on discard.
- `InstanceRow` gains optional `autopilot?` → flows through `listInstances` → `instancesFrame`
  additively.
- REST `PUT /api/autopilot/:instanceId` `{enabled, prompt}`; enabling requires prompt ≥ 10 chars
  (mirrors ack-note floor `server.ts:2344-2349`). Handler writes column +
  `publishInstances(machineId)`. No GET — the toggle reads `state.instances`. Engine reads the
  column at evaluation time (no cache ⇒ no reload hook).

### C6 — Intervention log
- New table `supervisor_events` mirroring `delegate_events` (`schema.ts:161-175`): id autoincr,
  `instanceId`, `source` ('rule'|'autopilot'), `ruleId?`, `verdict`
  ('silent'|'reply'|'escalate'|'ask'|'error'|'skipped'), `message?`, `note?`, `model?`,
  `latencyMs?`, `createdAt`; indexes instanceId + createdAt. Silent verdicts ARE recorded.
  Retention: prune to newest 5,000 at insert (our choice — bounded without a scheduler).
- `DbShape`: `recordSupervisorEvent`, `listSupervisorEvents({instanceId?, limit})`.
- Broadcast `{verb:'frames', …, payload:{kind:'supervisor_event', instanceId, event}}` exactly
  like `publishDelegateEvent` (`server.ts:1318-1325`); dashboard reads structurally like
  `delegateEventOf` (`client.svelte.ts:771-777`). `SupervisorEvent` type lives where
  `DelegateEvent` lives.

### C7 — Origin tag + transcript rendering
Origin `{kind:'system', name:'supervisor:autopilot'}` / `{kind:'system',
name:'supervisor:<rule name>'}`. `kind:'system'` already means harness echoes the injected frame
(`core/harness.ts:317-318`, `claude.ts:828-830`) and transcripts render it as cawco's word
(`frames.ts:477-485`). Extend `ruleLabel` (`frames.ts:1231`): names starting `supervisor:`
render "Autopilot" / "Supervisor — <rule>". Label only this slice; no new row component.

### C8 — Wire additions, enumerated exactly
- **No new Verbs. No agent/daemon changes. No RegistryShape changes. No HubServices changes.**
- REST beside `/api/rules`: `GET /api/supervisor` → `{config (apiKey redacted),
  status:{configured, reachable, resolvedModel?, error?}}` (live probe 15s);
  `PUT /api/supervisor/config`; `GET /api/supervisor/events?instanceId&limit` (default 100);
  `PUT /api/autopilot/:instanceId`. `ruleBody` typebox widened: optional
  `trigger`/`action`/`prompt`, defaulted for old clients.
- Frames: new structural kind `supervisor_event`; `instances` rows carry `autopilot` additively.
- `TelegramBridge` gains `onSupervisor(instanceId, text)`.

### C9 — Assistant panel slice + composer toggle + whip presets
New `apps/dashboard/src/lib/cawco/assistant/`:
- `AssistantOrb.svelte` — summon button; the **single** place `--accent-solid` is a solid fill
  (DESIGN.md L81; token verified in `app.css:276`). Rest placement fixed bottom-right 24px (our
  choice — mocks only show the open state; one-line CSS to move).
- `AssistantPanel.svelte` — shell per DW-9b.1 law (JOURNEY.md L699-701 + `mocks/v5-assistant.html`):
  width 380, top 40 / right 24, radius 16, header 47 (name + orb mark + "Assistant" role tag),
  scrim `var(--scrim-soft)`. Height `min(899px, 100dvh − 64px)` (our choice — clamp keeps the
  law on tall screens, honesty on short). Below 900px: full-bleed sheet, `role="dialog"`,
  `aria-modal`, background `inert`, Escape closes, focus returns to orb — port v3 mock's
  `syncModal` JS (`mocks/v3-assistant.html:619-668`) into Svelte. All colors/spacing via app.css
  tokens; zero new hues.
- Contents this slice: supervisor status block (`GET /api/supervisor`), focused session's
  autopilot state, live intervention log (seed via REST, then `supervisor_event` frames; newest
  first; row = time · session leaf · source · verdict badge · clipped message; click navigates).
  **No chat composer.**
- Store: `state.supervisorEvents` ring capped 200 in memory (our choice); `handleFrame` branch
  beside the delegate-event read.
- Composer toggle: `transcript/Composer.svelte` gains an optional `leading` snippet in `.ctrls`
  (`Composer.svelte:522-530`); `SessionPane.svelte` (~L749-768) passes new
  `AutopilotToggle.svelte` — toggle button (aria-pressed; active = accent-colored glyph, no
  solid fill — that stays the orb's) opening a popover (`NewProjectPopover.svelte` pattern) with
  standing-prompt textarea + enable switch + save → `PUT /api/autopilot/:id` via new
  `lib/cawco/autopilot.ts` (rules.ts fetch idiom).
- **Whip preset rack** (operator decision 5): `WHIP_PRESETS` const in the rules editor — 4
  prewritten LLM-rule templates, click-to-fill the form (client-side templates, not seeded DB
  rows — our choice: no migration, operator opts in): *done-claim without evidence → "run the
  tests and paste the output"*, *permission-seeking stall → "proceed; finish the whole list"*,
  *"rest as an exercise" / placeholder work → demand the complete version*, *files touched
  outside the brief → "revert and stay in your owned files"*.

## Standing constraints (every leaf brief, verbatim)
- Do NOT spawn subagents; do the reads yourself.
- `bun test <path>` from repo root; per-file lint only; no full-repo lint.
- Touch only OWNED FILES; needing another file = stop and report.
- Re-read files at execution time; line numbers in this plan go stale.
- One commit per leaf. No unsourced numbers — cite or label "our choice".
- Never write into `.data/`, `~/.claude`, or live project dirs.
- Reports end with `DEVIATIONS FROM SPEC` — empty or itemized.
- Wave-A first leaf captures test baselines; counts may grow, failures may not.
- UI leaves: quote ui-observer measurements verbatim or state "Layout: Not verified".

## Leaves, models, order

| Leaf | Scope (owned files) | Model | Waits on |
|---|---|---|---|
| A1 | Core contract: `core/src/rules.ts` (C1 + `ruleInScope`), `core/src/index.ts` (env vars, `InstanceRow.autopilot`, SupervisorEvent home) | opus | — |
| A2 | DB: `hub/src/db/schema.ts`, `db/index.ts`, generated migration (rule cols, `instances.autopilot`, `supervisor_events`, `supervisor_config`) | opus | A1 |
| A3 | LLM verdict caller: hub deps (`ai`, `@ai-sdk/openai-compatible`, `valibot`), new `hub/src/llm.ts` + `llm.test.ts` (fake HTTP server); gate includes a live-router `generateObject` transcript | opus | A1 |
| B1 | Engine: new `hub/src/supervisor.ts` + `supervisor.test.ts`; `hub/src/rules.ts` reload filter + test | opus | A2, A3 |
| B2 | Wiring: `hub/src/server.ts` (construct, observe site, REST, ruleBody, publish), `hub/src/telegram.ts` (`onSupervisor`) | opus | B1 |
| C1 | Dashboard plumbing: `client.svelte.ts` (ingest, state), new `lib/cawco/autopilot.ts` + `supervisor.ts`, `frames.ts` ruleLabel + tests | opus | A1 (B2 for live gates) |
| C2 | Rules editor: `routes/rules/*` + `lib/cawco/rules.ts` (trigger/action/prompt controls, sentence, validation, WHIP_PRESETS) | opus | A1 |
| C3 | Composer toggle: `transcript/Composer.svelte` (leading snippet), `SessionPane.svelte`, new `AutopilotToggle.svelte` | opus | C1 |
| C4 | Panel: new `assistant/AssistantPanel.svelte` + `AssistantOrb.svelte`, mount in `Shell.svelte`; a11y per v3 JS | opus | C1 |
| C5 | JOURNEY.md decision-log append: the DW-9b.2 autopilot override, dated, citing this plan | opus | — |
| D1 | Integration: new `hub/src/supervisor-e2e.test.ts` — real `createServer`, scratch db, scripted agent socket, fake OpenAI server | opus | B2 |
| D2 | Close: full suites + per-file lint, manual smoke vs live router, ui-observer pass, gate re-run | opus | all |

Concurrency: A1+C5 first; then A2 ∥ A3 ∥ C2; B1 → B2; C1 after B2; C3 ∥ C4 ∥ D1 after deps.
Peak 3. File-ownership collisions forcing the order: `core/index.ts` (A1), `server.ts` (B2),
`client.svelte.ts` (C1).

## Per-leaf gate sketches (runnable CHECK lines)

- **A1**: `bun test packages/core` · `npx eslint packages/core/src/rules.ts` · `ruleProblem`
  refusal sentences for all illegal combos test-asserted.
- **A2**: `bun test packages/hub/src/db-migration.test.ts` · migration file exists · scratch db
  round-trips an LLM rule + autopilot JSON + one supervisor event.
- **A3**: `bun test packages/hub/src/llm.test.ts` (fake server: happy, 507 VRAM, 503 cooldown,
  timeout, schema-violating output) · gates file contains the pasted transcript of a live
  `generateObject` run against `http://localhost:30000` returning a conformant verdict object
  (router down ⇒ recorded + JSON-mode fallback decision documented).
- **B1**: `bun test packages/hub/src/supervisor.test.ts` covering precedence, pattern-LLM rule,
  one-in-flight drop, consecutive cap → forced escalate + mute + reset, staleness drop,
  unreachable skip, aborted skip, files-touched extraction, noteRuleFire + ceiling, error
  verdict on bad JSON · `bun test packages/hub/src/rules.test.ts` (reload filter added, existing
  green).
- **B2**: `bun test packages/hub` · `bun test apps/dashboard/src/lib/cawco/stream-e2e.test.ts`
  (proves HubServices/RegistryShape untouched) · curl checks per new endpoint recorded.
- **C1**: `bun test apps/dashboard/src/lib/cawco/frames.test.ts` (supervisor label cases) ·
  dashboard baseline preserved.
- **C2**: `bun test apps/dashboard` · editor screenshot + live `ruleSentence` for an every-turn
  LLM rule quoted · each preset fills the form and validates.
- **C3/C4**: `bun test apps/dashboard` · ui-observer numbers quoted verbatim (panel 380px width /
  47px header / inset 40,24; toggle tap target; sub-900 sheet aria-modal + inert verified) — or
  "Layout: Not verified" + reason.
- **D1**: `bun test packages/hub/src/supervisor-e2e.test.ts` — scripted turn end → fake-OpenAI
  hit → `send` envelope on fake agent socket with origin `system`/`supervisor:*` +
  `shouldQuery:true`; escalation → no agent send + frame on dashboard socket + log row;
  mid-flight turn → `skipped` row; 30s-delayed verdict proves frames keep flowing.
- **D2**: all four suites 0 fail · manual smoke transcript pasted.

## Verification (manual smoke, D2, operator-timed)

1. `curl http://localhost:30000/v1/models` — confirm `qwen3.8-27b`/aliases.
2. `PUT /api/supervisor/config` `{enabled:true, baseUrl:'http://localhost:30000',
   model:'qwen3.8'}`; `GET /api/supervisor` shows reachable + resolved name.
3. Create an every-turn LLM rule scoped to a scratch project; run a trivial turn; watch the
   panel log a row with latency; confirm the "Supervisor — <rule>" transcript label on a reply.
4. Enable autopilot from the composer popover; end a turn with an open question; confirm the
   autopilot answers or escalates; confirm the Telegram message arrives and a Telegram reply
   lands in the session.
5. Cold-start tolerance: after idle-eviction, run a turn — evaluation warms/waits (latency in
   the tens of seconds), hub stays responsive; router-down logs `error` rows with zero session
   traffic.

## Risks

- `generateObject`'s structured-output mode vs vLLM guided decoding unexercised — settled by
  A3's live run; JSON mode (schema in-prompt) is the designed fallback.
- Files-touched sees only main-loop `tool_use` (same blindness as rules); stated in the harness
  preamble so the LLM doesn't over-trust the list.
- Turn attribution is flag-approximate under races; the cap is a guard, not bookkeeping.
- Verdicts to a session that died in the window drop with `skipped(unreachable)` — no hub-side
  revive this slice.
- Late verdict vs. operator's own reply: staleness guard covers new turns; a racing human send
  can still double-queue — origin label keeps the transcript honest.
- Orb rest placement + panel height clamp are our choices where mocks are silent.
- CLAUDE.md's "DESIGN.md does not exist yet" is stale — DESIGN.md exists and is law here.

## Out of scope (explicit) / fog for later maps

- Cross-session Q&A chat in the panel (DW-9a scope untouched; ships without a composer).
- Any permission auto-answering (`pending.ts`, `RESOLVE_PERMISSION`, ask flows untouched).
- Fleet-wide autopilot (an every-turn LLM *rule* with scope is the fleet-shaped tool; it cannot
  `ask_operator`).
- Hub-side session revival for delivery; AttentionQueue escalation surfacing; per-rule model
  overrides; streaming verdicts.
- **Fog (future graduations):** files-touched persisted as an index → answers "which sessions
  touched X" cross-session; verdict-derived session tags (drifting/stuck) feeding the board;
  assistant proposing rules from repeated operator corrections; qwen as an opencode provider for
  cheap local coding sessions supervised by the same supervisor.

## Status log (append-only)

- 2026-09-01: Plan approved by operator. Folder created on branch feature/supervisor. Chair: Opus 5.
- 2026-09-01: AMENDED by operator order: C4/C2/A3 switched from hand-rolled fetch to Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible` + zod `generateObject`); warm/poll dance dropped; streaming reserved for future assistant chat.
- 2026-09-01: AMENDED by operator order: valibot (Standard Schema) instead of zod for the verdict schema.
- 2026-09-01: OPERATOR POLICY: no new unit tests anywhere — verification via e2e (D1 supervisor-e2e stays, explicitly sanctioned), live smoke, Playwright/claude-in-chrome. Gates rewritten to match; leaf briefs must carry the ban.
- 2026-09-01: OPERATOR ROUTING: all execution leaves on opus (Opus 5); fable design-only. A1/C5 were already dispatched on sonnet before this order (C5 complete; A1 in flight) — later opus leaves and D2 re-verify their output.
- 2026-09-01: ROUTING RESOLVED: operator accepts claude-opus-4-6[1m] for execution leaves (claude-opus-5 unreachable mid-session: env alias mapping + agent-def pin bind at session start; forks inherit the parent session, currently fable-5). Served model still verified per leaf.
- 2026-09-01: OPERATOR ORDER (UI): the panel/toggle must be smooth like the mock — no compromise. UI leaves (C3, C4) MUST invoke the Skill tool with `impeccable` FIRST and follow its loaded playbook (craft-floor before editing) as ground truth over brief summaries; mock parity (mocks/v5-assistant.html shell + v3 modal JS) and motion polish (panel enter over --scrim-soft at --motion-base, DESIGN.md L81) are gate requirements, verified in-browser.
- 2026-09-01: OPERATOR CONTRACT CHANGE (C2/C7) — OPACITY: the supervisor is invisible to the session agent. Its replies must be indistinguishable from the operator typing: verdict `message` written in the operator's first-person voice, zero self-reference to being automated; delivery must not alter any model-visible bytes vs a human send (B1 verifies whether origin kind leaks into model input; if kind:'system' leaks, wire uses kind:'human' and the dashboard labels rows by correlating supervisor_events instead). Only the OPERATOR sees the "Autopilot"/"Supervisor" labels (dashboard transcript + panel log + Telegram); C7's ruleLabel rendering serves the operator, never the wire. The verdict model (qwen) itself still knows its role — opacity is toward the SESSION agent only.
- 2026-09-01: OPACITY RATIONALE + ANTI-TELL (C2 harness): a session model that detects automated/repetitive supervision adapts to evade it. Harness therefore enforces variation: never reuse prior intervention phrasing (last-3 log rows are in the payload for this), recurring same violation prefers escalate over a repeat reply, replies short and irregular like real operator messages.
- 2026-09-01: OPERATOR ORDER (C9 amendment) — MOBILE-FIRST: below 900px the assistant panel is a vaul-svelte drawer (dep already present: vaul-svelte ^1.0.0-next.7; use the existing ui/drawer wrapper if one exists), not the v3 full-bleed modal port; desktop (≥900px) stays the floating 380×899 pane exactly per the mock. Design mobile-first: the drawer experience is primary, the floating pane is the desktop enhancement. Same for the C3 autopilot popover: verify it degrades to a touch-friendly surface on mobile (drawer or the existing mobile popover idiom the composer already uses).
- 2026-09-01: CHAIR FIX (post-D1): D1's e2e exposed the mute bug — forced escalate never set initiatedTurn, so the next result frame cleared muted (mute lasted zero turns; supervisor could ping-pong with a canned rule, bounded only by RULE_FIRE_CEILING). Fix: muted now clears ONLY on a real human send — `SupervisorEngine.noteHumanSend()`, called from relaySend (dashboard sends, origin human/absent) and from Telegram talkBack via the new `setHumanSendObserver` (setAnswerRecorder idiom). Non-human turns still reset `consecutive` but never unmute. e2e 3e rewritten to prove mute-holds + human-unmute; D1's file also had 9 tsc errors (watch:'assistant', missing kind, loose port type) bun's runner never caught — fixed. Hub: 187 pass, tsc clean, lint clean.
- 2026-09-01: D2 CLOSE — supervisor build verified. Suites: core 5/hub 187/dashboard 340/agent 181, all 0 fail. Typecheck: hub clean, dashboard 6+2 pre-existing only. Lint: 23 files, 0 new errors; 1 surgical fix (server.ts:2427 unused `status` param in GET /api/supervisor — removed). Gate re-run: all 11 leaf gates carry filled evidence, 0 pending. Browser pass (chrome-in-chrome on scratch hub :3499 + dashboard :5299): panel measurements match shell law (380/40/24/47/16, height clamp correct), inert/Escape/focus-return verified, intervention log displayed 3 seeded events, rules editor trigger/action/sentence/presets/illegal-combo-refusal verified. Deferred to operator: (1) warm qwen verdict (507 "insufficient VRAM" — free VRAM, then re-run PLAN Verification steps 2-5 against deployed fleet after merge); (2) live-session autopilot end-to-end (toggle, standing prompt, supervisor reply, Telegram bridge); (3) mobile drawer on physical device (Chrome refused <900px resize; C4 iframe evidence covers code path).
- 2026-09-02: OPERATOR REDESIGN (C3 selection → composition + streaming): first-rule-wins selection was wrong — no rule is ditched. Autopilot ON: matched rules feed the autopilot's single evaluation as labeled context; it answers with everything in view (origin supervisor:autopilot). Autopilot OFF: streamed per-rule verdicts — streamText + Output.array, one verdict object per rule, each ACTED ON as its element completes (elementStream); per-rule origin supervisor:<rule>, per-rule events/bookkeeping, guards (mute/cap/staleness/unreachable) applied per element; stream errors after partial delivery keep what was delivered and record the error with the count. Fake OpenAI in the e2e grew an SSE branch (the SDK's array mode wraps in {"elements": [...]}); silent-empty streams are classified via awaiting result.output.

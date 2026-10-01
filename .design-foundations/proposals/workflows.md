# Workflows — node-graph orchestration across harnesses

Status: accepted 2026-09-22 (grilled; decisions in §12) · implementation phases in §11

## 0. The decision in one paragraph

A **workflow** is a graph the operator draws: nodes are steps, each with a harness, a
model, a prompt template and an output schema; edges carry a step's result to the next.
**The hub walks the graph. A model executes one step.** Every step runs as a fresh,
ephemeral session (the spawn path `delegation-actions.ts` already has), returns a
schema-validated result through one `submit_result` tool exposed on all three harnesses,
and the hub — plain code — validates it, evaluates gates, routes to the next node, pauses
on a human choice, and persists every transition. A run may be **supervised**: a session
sits beside the run, receives every step's report, answers steps' questions, and can steer
within bounded verbs (§3.7) — but it never chooses the path. An authored graph is the case
every runtime surveyed (Anthropic, LangGraph, Mastra, Inngest, OpenAI Agents SDK, Temporal —
and OpenProse's own Reactor harness) moves out of the model and into code.

The worked example is `~/.claude/skills/redesigning-ui-clean-slate/` — a six-phase pipeline
with code gates, a re-dispatch loop, a hard stop for a human choice, and a route-back from
audit to implement. §10 draws it as a graph.

## 1. Research conclusion

Cited brief from the research delegate (2026-09-22); sources inline.

- **Code walks, model steps.** Anthropic: workflows are "LLMs and tools orchestrated through
  predefined code paths"; agents are for when "you can't predict the subtasks needed"
  (anthropic.com/engineering/building-effective-agents). Inngest AgentKit: "start with
  code-based routing … the most deterministic", cap `maxIter` whenever an LLM routes
  (agentkit.inngest.com/concepts/routers). OpenAI Agents SDK: "orchestrating via code makes
  tasks more deterministic and predictable, in terms of speed, cost and performance"
  (openai.github.io/openai-agents-js/guides/multi-agent). Temporal: LLM calls are
  Activities, never Workflow code, because the walker is replayed
  (go.temporal.io/platform-hub/ai-engineering/ai-reference-architecture).
- **OpenProse** (github.com/openprose/prose, prose.md, 2026-01) is the "prose" prior art:
  Markdown contracts (`*.prose.md`, YAML frontmatter, `###` sections) with a fenced
  ProseScript block (`call`, `parallel`, `loop until … (max: n)`, `if`, `retry`) that the
  *model* executes as a VM. Its recommended deterministic harness, Reactor, moves the
  wake/commit decision out of the model ("no LLM judge"). Adopted here: the Markdown text
  form for authoring (§8.3). Rejected: model-as-VM — the hub is the VM.
- **State between steps is a schema-constrained final answer**, retried with the validation
  error fed back, under a hard cap. OpenCode's native mode defaults to 2 retries then
  `StructuredOutputError`; Claude Code's `--json-schema` yields `structured_output` and
  the docs tell the caller to re-validate (code.claude.com/docs/en/headless). Large
  payloads go to disk and pass a reference
  (anthropic.com/engineering/multi-agent-research-system).
- **Per harness:** Claude Code and OpenCode both implement structured output as a *forced
  tool call* validated at the tool layer; pi has no structured-output mode, only
  `customTools` (github.com/badlogic/pi-mono …/docs/sdk.md). → one hub-validated tool. §5.
- **Gates:** deterministic gates are pure functions over the result; an LLM judge is the
  evaluator-optimizer loop and needs a max-iterations stop. Bounds in the wild: 2–3 retries
  for malformed output, 3–5 evaluator iterations.
- **Human-in-the-loop** is durable state plus a resume token everywhere (LangGraph
  `interrupt`, Mastra `suspend`, Inngest `waitForEvent`).
- **Fresh context per step.** Claude Agent SDK: a subagent "starts fresh (no parent
  conversation)"; "the only channel from parent to subagent is the prompt string"
  (code.claude.com/docs/en/agent-sdk/subagents). A step may instead **continue** an
  upstream step's session (§4.2) when the author wants the transcript kept.

## 2. Terms

PRODUCT.md binds **session**, **run**, **delegate**. This feature adds:

| term | meaning |
|---|---|
| **workflow** | a saved graph: nodes, edges, inputs, settings. A run pins the graph JSON it started with. |
| **workflow run** | one execution of a workflow. Always two words in copy; PRODUCT.md's **run** is a session's turn. |
| **step** | one node's execution inside a workflow run. A step has one session and one or more **attempts** on it. |
| **node** / **edge** | graph vertex (§4) / directed link from an output port to a node, carrying a condition and a loop bound. |
| **gate** | a `check` node or an edge condition that decides pass / retry / fail in code. |
| **result** | the validated object a step returned through `submit_result`. |
| **supervisor** | the session, if any, that receives a run's reports and answers its steps' questions. |
| **child run** | a workflow run launched by a `workflow` node of another run (its **parent run**). |
| **workspace** | the project directory a run executes in — every step's `cwd`. CawCo never creates worktrees for steps; a step that wants isolation decides so itself, or its supervisor tells it. |

## 3. Execution model (hub, `packages/hub/src/workflows/`)

### 3.1 Engine

`engine.ts` is a state machine over `workflow_runs` / `workflow_steps` / `workflow_attempts`
(§6), event-driven off the frames the hub already relays (`server.ts`, the block that today
assembles a delegate's report) — it never polls a session.

1. **Launch** (`POST /api/workflows/:id/runs`). Validate the graph (§9.3), pin its JSON on
   the run, resolve the workspace (§3.4) and supervisor (§3.7), mark the run `running`,
   mark the Start node's successors `pending`.
2. **Schedule.** A node is *ready* when every incoming edge from a non-skipped source has
   fired. Ready `step` nodes spawn, up to `settings.concurrency` (default 4) live sessions
   per run. Ready `check` / `branch` / `map` / `end` nodes evaluate synchronously. Ready
   `ask` nodes park (§3.5). Ready `workflow` nodes launch a child run (§3.8).
3. **Spawn a step** = one `SpawnPayload` (§5.1) plus one opening `send` carrying the
   rendered prompt (§3.2). The instance row carries `workflowRunId` and `workflowStepId`
   (§6) so the rail nests it under the run and the frame observer routes its frames.
   **A step is spawned once.** Every later attempt re-prompts the same session; if that
   session's process is gone, the next attempt resumes its `sessionKey` in place. The
   transcript and the prompt-cache prefix survive every retry by construction.
4. **Observe.** For an instance with `workflowStepId`:
   - `submit_result` call (§5.2) → validate against the node's `outputSchema` (`ajv`);
     valid → store on the attempt, answer "Recorded. End your turn now.", mark the step
     `passed` when the turn's `result` frame arrives; invalid → answer with the validator's
     message, same turn continues, no attempt consumed.
   - `result` frame with nothing recorded → attempt ended without submitting. While
     `attempt.number ≤ node.retries` (default 2, max 5): new attempt on the same session
     with "You ended without calling submit_result. Call it now with an object matching the
     schema." Past the cap: step `failed`, reason `no-result`.
   - `result` frame with `is_error`, or an `error` envelope → attempt failed with the
     harness's words; next attempt resumes the session with `{{attempt.previousError}}`
     available to the prompt suffix; past the cap: step `failed`.
   - a parked question from a step (§3.6).
5. **Route.** On `passed`, evaluate every outgoing edge's `when` (§4.2) in order; every
   satisfied edge fires (fan-out); exclusivity is a `branch` node.
6. **Finish.** `done` when an `end` fires (its `outputs` become the run's result) or no
   node is pending/running/waiting; `failed` when a step fails with its `fail` port
   unwired; `cancelled` on the operator's or supervisor's word.

Every transition is one row write plus one `workflow` frame (§7.2). A hub restart
re-derives the schedule from rows: attempts whose instance the daemon still lists as
`running` are left alone; attempts whose instance is `sleeping`/`error`/`stopped` get the
next attempt by resume under the node's cap. A step is `running` only while its instance
is — the derived-liveness law (ARCHITECTURE.md) applied to steps.

### 3.2 Prompt templates

A `step`'s `prompt` is Markdown with `{{path}}` placeholders — no conditionals, loops or
filters; logic is nodes. Paths: `{{inputs.<name>}}` · `{{steps.<nodeId>.result.<field…>}}`
· `{{steps.<nodeId>.result}}` (pretty JSON) · `{{attempt.number}}` ·
`{{attempt.previousError}}` · `{{attempt.gateFindings}}` (filled by a `check` fail edge) ·
`{{map.item}}` / `{{map.index}}` · `{{workspace}}` · `{{supervisor.note}}` (§3.7).

Unresolved paths are a save-time problem and a launch-time refusal. Rendered prompts are
stored on the attempt verbatim; the run view shows exactly what the model was told.

Rendered prompt = the peer marker `delegate()` already uses
(`[Hand-off from the <workflow name> workflow — step <node title>, not the user]`) +
prompt + the contract suffix:

```
When the work is done, call submit_result exactly once with an object matching this
schema, then end your turn. Do not describe the result in prose instead of calling it.
<schema JSON>
```
Unsupervised runs add one line: `There is nobody to ask. Decide, and record any assumption
in your result.`

### 3.3 Gates and loops

- **Deterministic gate** = `check` node (§4.3): pure functions over a result and the
  workspace.
- **LLM judge** is not a node kind: an ordinary `step` with `{ pass: boolean, findings:
  string[] }` and a `branch` or edge condition on `result.pass`.
- **Loops** are backward edges; every cycle-closing edge carries `maxIterations`
  (default 3, editor-enforced). Exceeding it fails the run with `loop-bound:<edgeId>`.

### 3.4 Workspace

Launch names a project (or any directory on the chosen machine); every step's `cwd` is that
directory. CawCo does not create, suggest, or clean up worktrees for steps — isolation is
a step's own decision (it has a shell) or a supervisor's instruction. `map` bodies that
write files share the workspace like everything else; a graph author who needs them apart
says so in the step prompt.

### 3.5 Human choice (`ask` node)

Parks a question in the hub's pending ledger (`pending.ts`) with `requestKind: "question"`
— the shape `AskUserQuestion` parks — so it appears in the board's needs-you count, under
the run in the rail, and on Telegram via `telegram.onAsk`. The run is `waiting`. The answer
`{ choice, note? }` is the node's result. `answeredBy: "operator" | "supervisor"` (default
operator); `supervisor` on an unsupervised run is a launch-time refusal. `waitFor` (hours)
optional; expiry fails the run `ask-timeout`. Dismissal cancels the run.

### 3.6 Questions from steps

A step session may only ask when a supervisor exists. Unsupervised: claude steps get
`AskUserQuestion` in `denyTools`; any question opencode/pi park is answered by the hub with
`QUESTION_DISMISSED` immediately; the prompt suffix says so (§3.2). Supervised: the
question is delivered to the supervisor by the existing `deliverDelegateAsk` path and
answered with `answer_delegate` as today. Tool-permission prompts never occur: steps run
`bypassPermissions` like every delegate.

### 3.7 Supervisor

`supervisor: none | { instanceId }`. A session that calls `run_workflow` is its run's
supervisor. A dashboard launch may pick a delegate type to spawn as supervisor (fresh
session in the workspace, opened with the workflow's description and the run id) or none.
The supervisor receives, as queued peer messages: every step's report (`[Workflow <name> —
step <title> passed|failed]` + result JSON), every `ask` routed to it, and the run's end.
Its verbs, via `steer_workflow(runId, action)`:
`note(text)` — appended as `{{supervisor.note}}` to the next spawned step's suffix, consumed
once; `retry(stepId)` — a new attempt on a failed step; `answer(stepId, choice, note?)` —
an `ask` with `answeredBy: supervisor`; `cancel()`. It cannot choose an edge, skip a node,
or edit a prompt: the path stays the graph's.

### 3.8 Sub-workflows (`workflow` node)

A workflow may invoke another. A `workflow` node launches a **child workflow run** of the
named workflow with `inputs` mapped from the parent's scope (§3.2 paths), in the parent's
workspace, on the parent's machine, under the parent's supervisor (if any). The child is an
ordinary run — its own row, its own steps, its own run view — with `parentRunId` /
`parentStepId` set so the rail nests it under the parent run and the parent's run view
shows its status on the node. The child's graph is pinned when the child launches. When the
child reaches `done`, its `end` outputs are the node's result on port `out`; `failed` or
`cancelled` fires port `fail` with `{ failure }`. Cancelling a parent cancels its live
children; cancelling a child fails the parent's node. Bounds: validation rejects a call
cycle (A→B→A, walked transitively through saved graphs) and nesting is capped at depth 8
at launch (`workflow-depth` failure). A `map` body may contain a `workflow` node — fan-out
of whole workflows is the intended way to run one workflow per item.

### 3.9 Cancel and re-run

*Cancel run* stops every live step session, marks pending steps `skipped`, run
`cancelled`. *Re-run from step* creates a new run that copies every upstream result from
the old run and starts at the chosen node (`rerunOfRunId`). Old rows are never mutated.

## 4. Node kinds

Every node: `id`, `kind`, `title`, `position`, `notes?`. One input port on every kind but
`start`; output ports as listed. Edges: `{ id, from: {node, port}, to: {node}, when?,
maxIterations? }` — `when` is `{ path, op: eq|neq|gt|lt|contains|matches|truthy|falsy,
value? }`; absent = always.

**`start`** — `inputs: [{ name, label, type: text|path|select, options?, required, default? }]`. Port `out`.

**`step`** — the only kind that runs a model.
```
harness, model, effort?, delegateType?, skills?, denyTools? (claude only)
prompt: markdown template
outputSchema: JSON Schema, object at root
context: { mode: "fresh" } | { mode: "continue", from: <upstream step id, same harness> }
retries: 0–5 (default 2) · timeoutMinutes (default 60)
```
`continue` **forks** the upstream step's session (new session id, copied transcript; the
cache prefix is identical, the upstream transcript untouched, cost attributable per step).
Ports `out`, `fail`.

**`check`** — rules, all must hold: `schema` · `regex { path, pattern, mustMatch }` ·
`forbidden-words { path, words[] }` · `file-exists { path }` · `command { cmd, expectExit }`
(run in the workspace by its machine over the control channel, 5-minute cap). Ports
`pass`, `fail`; failing rules' messages fill `{{attempt.gateFindings}}` downstream.

**`branch`** — ordered cases over the incoming result, first match wins, `else` last; one
port per case.

**`map`** — `over` (path to an array), `body` (sub-graph rendered as a group), `concurrency`.
Port `out` with `{ items: [...] }`; port `fail` with `{ failed: [index] }`. No `ask` inside.

**`workflow`** — `workflowId` (never the calling workflow itself), `inputs: { <child input
name>: <template or path> }` covering every required input of the child's `start`. Ports
`out` (child's end outputs), `fail` (`{ failure }`). §3.8.

**`ask`** — `question`, `options: [{ label, description? }]` (labels may template),
`allowOther`, `answeredBy`, `waitFor?`. One port per option (+ `other`).

**`end`** — `outputs: { name: path }`. Several allowed; first to fire ends the run.

## 5. One step on each harness

### 5.1 SpawnPayload
```
{ instanceId, cwd: workspace,
  harness, model, effort, skills, denyTools (+ "AskUserQuestion" when unsupervised, claude),
  resume: continue ? { sessionKey: <from step's sessionId>, fork: true } : undefined,
  permissionMode: "bypassPermissions", canDelegate: false,
  title: `${workflow.name} · ${node.title}`,
  parent: supervisor ? { instanceId: supervisor } : undefined,   // asks route through it
  workflowRunId, workflowStepId }
```
Skills load through each harness's `skills` path; cawco tools are injected as today
(claude: in-process MCP `cawco`; opencode: plugin `cawco_*`; pi: `customTools`).

### 5.2 `submit_result` — one tool, three registrations
`HandoffActions.submitResult(result)` beside the hand-off tools in `delegation-actions.ts`;
surfaced as `mcp__cawco__submit_result` / `cawco_submit_result` / `submit_result`.
Body: `POST /api/workflow-steps/:id/result`; the hub validates and returns either
"Recorded…" or the validator's message verbatim. Registered **only** when the spawn carries
`workflowStepId`. Steps keep `send_to_user`, `show_preview`, `generate_image`; they never
get `SPAWNING_TOOLS`. This is the only result channel — final prose is never parsed.

### 5.3 Per-harness
claude: `resume.fork`, `skills`, `denyTools` already work. opencode: tool goes through the
plugin switch (`opencode.ts` ~L410); fork via the adapter's existing `fork_of` path. pi:
`defineTool` in `pi.ts` next to the hand-off tools; no `denyTools` (editor greys it).

## 6. Data model (`packages/hub/src/db/schema.ts`, `bun run db:push`)

```
workflows          id, name, slug, description, graph(json), source(text|null: the last
                   imported/exported markdown, §8.3), createdAt, updatedAt
workflow_runs      id, workflowId, graph(json pinned), inputs(json), workspace, machineId,
                   supervisorInstanceId|null,
                   runtime(json: the scheduler's durable state — fired edges, per-edge loop
                   counts, map bodies' progress, the supervisor's unconsumed note; written in
                   the same transaction as every step/attempt transition, never read by the UI),
                   status running|waiting|done|failed|cancelled, result(json|null),
                   failure|null, startedAt, endedAt, rerunOfRunId|null,
                   parentRunId|null, parentStepId|null (§3.8),
                   launchedBy dashboard|agent:<id>|skill:<machine>
workflow_steps     id, runId, nodeId, kind, status pending|running|waiting|passed|failed|
                   skipped|cancelled, instanceId|null (the step's one session),
                   childRunId|null (a `workflow` node's child run),
                   result(json|null), failure|null, mapIndex|null, startedAt, endedAt
workflow_attempts  id, stepId, number, renderedPrompt, result(json|null), failure|null,
                   startedAt, endedAt
instances          + workflowRunId|null, workflowStepId|null
```
Step liveness overlays through `withSessionPresence`; cost per step from the usage
buckets the hub keeps per instance.

## 7. API, frames, tools

### 7.1 REST
```
GET/POST        /api/workflows                     list · create { name, graph } | { markdown }
GET/PUT/DELETE  /api/workflows/:id                 read · save (returns problems[]) · delete (refused while a run is live)
GET             /api/workflows/:id/markdown        text form (§8.3)
POST            /api/workflows/:id/runs            { inputs, workspace: {path, machineId}, supervisor?: {delegateType} | {instanceId} }
GET             /api/workflows/:id/runs
GET             /api/workflow-runs/:id             run + steps + attempts (+ childRunId per `workflow` step), presence-overlaid
POST            /api/workflow-runs/:id/cancel · /rerun { fromNodeId } · /answer { stepId, choice, note? } · /steer { action }
POST            /api/workflow-steps/:id/result     submit_result's body; refused unless the caller's instance owns the step
```
### 7.2 WS — one frame kind `workflow` `{ runId, run, step?, attempt? }` on every transition.

### 7.2a Public edge state
`runtime` never leaves the hub, but the run the API and frames carry includes two
projections of it so the run view can paint the path without inferring it from step
statuses: `run.edges: Record<scope, Record<edgeId, "fired" | "skipped">>` and
`run.loops: Record<scope, Record<edgeId, number>>` (iterations consumed on cycle-closing
edges). `scope` is `"root"` for the top-level graph and `"<mapNodeId>[<index>]"` for each
map-body iteration. Present on `GET /api/workflow-runs/:id` and on every `workflow` frame.

### 7.3 Agent tools (sessions that may delegate)
`run_workflow(name, inputs, { workspace? })` → `{ runId }`; the caller becomes supervisor
(§3.7). `steer_workflow(runId, action)`. `create_workflow(markdown)` / `update_workflow(name,
markdown)` (§8.3). `list_workflows()`.

## 8. Where it sits

### 8.1 Navigation
Global nav gains **Workflows** between Delegates and Usage (`Sidebar.svelte`), Solar
duotone `IconWorkflow` (nodes-and-edges glyph) in `$lib/icons`. Routes: `workflows`,
`workflows/[id]` (editor; also "new"), `workflows/[id]/runs/[run]` (run view). The rail
nests a run's step sessions under a run row `<workflow> · run <id8>`; a `waiting` run counts
in **needs you**.

### 8.2 Slash commands on every machine
Every saved workflow is also a fleet-synced skill stub `~/.claude/skills/wf-<slug>/SKILL.md`
(and the opencode/pi equivalents the skill sync already writes) whose body is: "Call
`run_workflow('<slug>', inputs)` with the inputs below, then wait for its reports." with the
Start node's inputs listed. Typing `/wf-<slug>` in any session runs the workflow with that
session as supervisor. Stubs are regenerated on save and removed on delete through the
existing fleet skill push.

### 8.3 Text form (`*.workflow.md`)
Canonical storage is the JSON graph. The Markdown form round-trips with it:
```markdown
---
name: Clean-slate redesign
inputs: [screen, purpose, stack, oldPath, newPath, direction, requirementsPath]
concurrency: 4
---
### distill · step claude/opus effort:high retries:2
schema: { tom: string, openQuestions: string[] }
Read {{inputs.requirementsPath}} and {{inputs.oldPath}} …

### gate1 · check
forbidden-words tom: button, dropdown, tab, modal, card, toggle, field, form, screen, page, section, sidebar, header, panel
regex tom /frequency/ must-match

### choose · ask answeredBy:operator
Which structure? options: {{steps.architect.result.options[*].name}} allowOther

### review · workflow review-diff
files: {{steps.implement.result.files}}

```flow
start -> distill -> gate1
gate1.fail -> distill (max 2)
gate1.pass -> architect -> gate2 -> choose -> critique …
```
```
Positions are absent in text; import lays the graph out with `@dagrejs/dagre` and the
editor persists positions afterwards. Export writes the section per node and the `flow`
block from edges. Phase 5.

## 9. The node editor — page specs (JOURNEY.md format)

References examined on Mobbin (2026-09-22): OpenAI Platform Agent Builder
([palette · canvas · inspector; Agent/Classify/If-else/While/User approval/End](https://mobbin.com/screens/36df35a8-eb28-4c80-98aa-bc38b3c8504b)),
n8n ([Editor / Executions tabs, execution list beside the graph](https://mobbin.com/screens/d3af4413-04f9-4534-8aa4-01916d2b4910)),
StackAI ([run details: per-node gantt + input/output panel](https://mobbin.com/screens/bb0174f4-60aa-4e30-ac5f-73679b160f38)),
Retool ([block list with durations, log stream](https://mobbin.com/screens/391a84fe-1981-4bb8-8417-12103c7958e8)),
Runway ([sparse canvas, node cards carry their content](https://mobbin.com/screens/16aa61e3-22ee-4ce3-be85-054705981f11)).
Carried over: three-pane editor with the inspector owning all editing; Editor and Runs as
two tabs of one surface; a run view that is the same canvas with status painted on plus
one drawer per selected step. Not carried: rainbow node colours (DESIGN.md Never #2),
floating toolbars that hide controls, side-chat "AI assistants".

Stack: `@xyflow/svelte` bumped to current (1.6.6 at writing; the transcript `FlowView`
already uses it — `FlowAutoFit`, `FlowZoomTracker`, `FlowContextMenu` are reused), any
other dependency updated or added as the build needs (`ajv`, `@dagrejs/dagre`),
shadcn-svelte primitives in `$lib/components/ui`, DESIGN.md "Quiet Ledger" tokens.

### 9.1 `workflows` — list
**Purpose:** find a workflow, see whether a run needs you, start one.
**Blocks:** connection band · header with **New workflow** and **Import markdown** ·
table: name, last run chip (§9.7), last run age, runs count, *Run* per row. Rows open the editor.
**States:** Loading Tier 2. Empty: "No workflows yet. A workflow is a graph of steps that
run one after another across your fleet." + **New workflow**. Error inline,
connection-bound. **Density** `compact`. **Narrow:** two-line rows; *Run* in the overflow.

### 9.2 `workflows/[id]` — editor
**Layout (≥1024):** three panes via `ui/resizable`.
- **Palette (left, 232px → 48px rail):** **Flow** (Start, End, Branch, Map, Workflow) ·
  **Work** (Step, Check) · **People** (Ask); glyph + name + one-line meaning; drag or click to place.
  Below: **Templates** — delegate types, each dropping a pre-filled Step.
- **Canvas:** dotted grid, snap 8. Breadcrumb `Workflows / <name>` with inline-editable name.
  Top-right: **Runs** tab, *Validate*, **Run workflow** (primary, graphite). Bottom-centre:
  select/pan, zoom −/+, fit, undo/redo. Autosave, debounced 600ms, "Saved · 2s ago"; a
  failed save shows the error there and disables **Run workflow**.
- **Inspector (right, 360px):** the selection's form; nothing selected → **Workflow
  settings** (description, concurrency, default project, default machine, default
  supervisor: none / delegate type) and **Problems** (§9.3).

**Node card:** 260px, `--surface-raised`, radius 10, header: kind glyph (Solar duotone;
**fill** for kinds that run a model, **ring** for kinds that only route), title, and — run
view only — a status chip. Body by kind: Step → harness · model, first prompt line, a
"continues <step>" line when `context.mode === "continue"`; Check → rule count; Branch →
cases as port labels; Ask → the question; Map → `over` + group frame; Workflow → the child
workflow's name and mapped-input count (run view: the child run's chip and an **Open child
run** link); Start → input names; End → output names. Input handle left-centre; output handles right, labelled when >1.
Selected: 2px `--brand-solid` ring. Invalid: `needs you` chip with the first problem.

**Edge:** smooth-step, `--neutral-8`; `when` label at midpoint; backward edges route below
and carry `×n`; hover shows a delete handle.

**Inspector forms** (persistent labels; sections as inset wells):
- Step: Title · Run on (delegate type → fills below, or Manual) · Harness (segmented) ·
  Model (combobox from `/api/delegate-types` + free text) · Effort · Skills · Denied tools
  (claude only) · Context (Fresh / Continue from ⟨upstream same-harness step⟩) · Prompt
  (monospace; `{{` opens a path completer over inputs and upstream schemas) · Result
  schema (flat-field builder; **Edit as JSON**) · Retries · Timeout.
- Check: rule rows; **Add rule** menu. Branch: ordered cases + fixed `else`. Map: Over ·
  Concurrency · Edit body. Workflow: Workflow picker (every saved workflow but this one) ·
  one field per child input with the path completer. Ask: Question · options · Allow other
  · Answered by · Wait up to.
  Start: inputs. End: outputs. Edge: When · Max iterations (shown and required on cycles).

**States:** Loading Tier 3 skeleton. Empty: a Start node placed, "Drag a step from the
palette, or press **A** to add one." Error: save failure by the breadcrumb; hub
disconnected disables **Run workflow** / *Validate* with the reason in the band.
**Keyboard:** A add step · Delete · ⌘D · ⌘Z/⇧⌘Z · F fit · Esc · Tab cycles ports.
**Density** `comfortable` inspector, `compact` canvas. **Narrow (<1024):** palette is a
bottom sheet behind **+ Add node**; inspector is a sheet on tap; canvas full-bleed, pinch.

### 9.3 Validation (on save and *Validate*)
Exactly one Start; an End reachable from Start; every node reachable; every `{{}}` path
resolves; every output port of `step`/`check`/`branch`/`ask` wired or marked "ends the run
as failed"; every cycle-closing edge has `maxIterations`; `continue.from` is an upstream
same-harness step; `map` bodies contain no `ask`; every `workflow` node names an existing workflow other than
this one, maps every required child input, and closes no call cycle through saved graphs;
`answeredBy: supervisor` only when the
workflow's default supervisor is set or the launch supplies one; schemas are objects.
Problems list in the inspector and pin on nodes; a workflow with problems saves but cannot run.

### 9.4 Launch dialog
Start inputs · **Workspace**: project picker, or any directory via the existing
`DirectoryPicker` · **Machine** (online only; offline greyed "offline") · **Supervisor**:
None / ⟨delegate type⟩. Primary **Start run**. Success → run view.

### 9.5 `workflows/[id]/runs/[run]` — run view
The same canvas, read-only, every node with a status chip; Step nodes show duration and
cost (tabular figures); fired edges `--neutral-11`, unfired `--neutral-8`; the running step's
ring pulses once per 2s. **Step drawer** (right) for the selection: header (title, chip,
attempt n/m, duration, cost) · **Told** (rendered prompt) · **Returned** (result JSON or
the failure in the error formula) · **Session** link → `session/[id]` · **Attempts**.
Left: collapsible **Steps** list in schedule order — the narrow-width primary view. Header:
**Answer** (when `waiting`, inline options), **Cancel run** (destructive, leading, confirm
names live sessions), **Re-run from step** (drawer), **Supervisor** link when one exists.
**States:** Loading Tier 3. Running = Tier 4 by definition — the Steps list is the
step-and-count, Telegram is out-of-band, **Cancel run** is the interrupt. Waiting: `needs
you` on the ask node + **Answer**. Terminal: header chip; End node auto-selected with the
run result. Unknown (machine unreachable): step chip reads `unknown`, nothing claims running.
**Narrow:** Steps list first; canvas a secondary tab; drawer a sheet.

### 9.6 Runs tab (in the editor) — run list (chip, started, duration, launched by,
supervisor) beside the run view; filters All · Needs you · Failed.

### 9.7 Status chips (DESIGN.md "four hues, one meaning each")
running → live · waiting → needs you · passed/done → done · failed → failed ·
pending/skipped/cancelled/unknown → idle glyph + the word. Kind is the glyph, never a colour.

## 10. Worked example — the clean-slate skill as a graph

```
start(screen, purpose, stack, oldPath, newPath, direction, requirementsPath)
 → step distill      fresh   {tom, openQuestions}
 → check gate1       forbidden-words(tom, [button, dropdown, tab, modal, card, toggle, field, form, screen, page, section, sidebar, header, panel]); regex(tom, /frequency/, mustMatch)
     fail ─(×2)─▶ distill                       (gateFindings in the retry prompt)
 → step architect    fresh   {options:[{name, principle, wireframe, tradeoffs}]}   receives steps.distill.result.tom only — quarantine is the graph
 → check gate2       schema(options minItems 3); command("node scripts/wireframes-distinct.mjs")
     fail ─(×2)─▶ architect
 → ask choose        options {{steps.architect.result.options[*].name}}, answeredBy operator
 → step critique     fresh   {mustFix[], consider[], revisedWireframe}
 → branch            mustFix.length == 0 && attempt.number == 1 ─(×1)─▶ critique-again (step, context: continue from critique, "find three problems") ; else → implement
 → step implement    fresh   {files[], deviations[]}
 → check gate4       command("scripts/diff-against-old.sh {{inputs.oldPath}} {{inputs.newPath}}")
     fail ─(×2)─▶ implement
 → step audit        fresh   {mustFix:[{file,line,finding}], other[]}
 → branch            mustFix.length > 0 ─(×2)─▶ implement ; else → consolidate
 → step consolidate  fresh   {deleted[], before, after}
 → end               {files, audit, consolidation}
```

## 11. Implementation — leaf briefs

One `code` delegate per phase, working in the repo and committing and pushing to `main`
directly (push to main is the fleet deploy); each phase verified in the running app before
the next. No tests. Nothing shimmed: `submit_result` is the only result channel; dependency
bumps land with the code that exercises them.

1. **Core + schema + engine + tools (hub).** `@cawco/core` `workflow.ts` (types,
   `validateWorkflow`, `renderPrompt`, `evaluateWhen`); schema tables; `workflows/engine.ts`;
   REST §7.1 (all but `/markdown`); `workflow` frame; frame-observer hook; `submitResult`
   + three registrations; `run_workflow` / `steer_workflow` / `list_workflows` tools;
   supervisor routing; unsupervised question policy; `workflow` nodes (§3.8) with cascade
   cancel and cycle validation. Verify with curl: create the §10 graph
   (minus `command` rules), launch on a live machine → `distill` `running` with a live
   instance → `passed` after `submit_result`; a step that never submits retries on the same
   session then fails `no-result`; an `ask` shows in `/api/pending` and Telegram and resumes
   on answer; cancel stops the live session; a parent workflow whose `workflow` node calls
   the summarise workflow reaches `done` with the child's outputs on the node, the child run
   row carries `parentRunId`, cancelling the parent cancels the child, and saving A→B→A is
   refused with the cycle named.
2. **Dashboard: list, launch dialog, run view** (§9.1, §9.4, §9.5, §9.7). `show_preview` +
   `ui-observer` at 1280 and 390.
3. **Dashboard: editor** (§9.2, §9.3, §9.6) on current `@xyflow/svelte`, reusing
   `flow/FlowAutoFit`, `FlowZoomTracker`, `FlowContextMenu`. Verify by drawing §10 from
   empty, breaking a `{{}}` path to see the pinned problem, launching, watching live.
4. **Slash-command stubs** (§8.2) through the fleet skill sync; verify `/wf-<slug>` from a
   claude and an opencode session runs the workflow with that session as supervisor.
5. **Text form** (§8.3): parser/serialiser in core, `/markdown` route, `create_workflow` /
   `update_workflow`, **Import markdown** on the list, **View as markdown** in the editor.
6. **Review leaf**: `interface-craft` critique of editor and run view, `clearshot` on the
   Mobbin references vs the build; findings back to phase 3's leaf.

## 12. Decisions taken (grill session, 2026-09-22)

Hub walks the graph; supervisor is a bounded participant, toggled per run · per-step
harness/model · stored in the hub DB, synced to machines only as slash-command stubs ·
one `submit_result` tool · retries re-prompt the same session, resume if its process died,
never a fresh spawn · context policy per step, `continue` = fork · steps ask only when
supervised; `ask` nodes default to the operator · launch surfaces: dashboard, `run_workflow`,
slash stubs · workspace: the project directory named at launch; cawco never creates or
suggests worktrees for steps — a step decides, or its supervisor does · "workflow run"
two words · dependencies updated or added as needed · no spend cap · `map` and `check
command` in v1 · workflows invoke other workflows through a `workflow` node (child run,
cycle-checked, depth ≤ 8) · text form in phase 5.

Follow-up outside this feature: CLAUDE.md rule 5 (shared-tree / worktree rule) is, by the
owner's word, an agent artifact, not an owner rule — to be removed separately.

## 13. v2 — programs (Onyx model), 2026-09-22. Supersedes §3.1–§3.3, §6 `runtime`, §8.3.

Owner: "Adopt their model and make it map out from the node editor." Random Labs' Onyx
(randomlabs.ai/blog/onyx) states the same thesis as §0 — "the program owns the control
flow while agents do the side-effecting work" — but its unit is a **program**, not an
interpreted graph. From v2 a workflow's executable form is a program; the node editor is
the primary way to author one and compiles to it; a program can also be written by hand.
Everything the operator sees (runs, steps, attempts, chips, the run view) is unchanged.
The REST contract of §7 is unchanged. What changes is what the hub executes.

### 13.1 The program
A TypeScript module, stored in `workflows.program`, shaped:

```ts
import { z } from "zod";
export const inputs = z.object({ topic: z.string().describe("…") });
export default async function (w: Workflow<typeof inputs>) {
  const summary = await w.run({
    title: "summarise", harness: "claude", model: "claude-sonnet-4-6",
    prompt: `Write two sentences about ${w.inputs.topic}.`,
    output: z.object({ summary: z.string() }),
  });
  return { summary: summary.summary };
}
```
`inputs` (zod object) replaces the `start` node's input list and generates the launch
dialog and the slash stub. The default export's return value is the run's result (the
`end` node). A program is pure orchestration: no fs, net, env, timers or randomness — the
worker exposes only `w`, `z`, and the language.

### 13.2 The runtime API (`Workflow`)
| call | meaning | maps onto |
|---|---|---|
| `w.inputs` | validated launch inputs | — |
| `await w.run(spec)` → `z.infer<spec.output>` | one step, blocking. `spec`: `{ title, harness, model, effort?, skills?, denyTools?, prompt, output, retries? (default 2, max 5), timeoutMinutes? (default 60), continueFrom?: StepHandle }` | §3.1 step 3–4, §5 unchanged: one session, retries on the same session, `submit_result` validated against `zodToJsonSchema(output)` |
| `w.spawn(spec)` → `StepHandle` (`.result: Promise`, `.id`) | non-blocking step; `Promise.all` is fan-out (replaces `map`) | same |
| `await w.ask({ question, options, allowOther?, answeredBy?, waitFor? })` → `{ choice, note? }` | human choice (replaces the `ask` node) | §3.5 pending ledger, unchanged |
| `await w.exec(cmd, { timeoutMinutes? })` → `{ code, output }` · `await w.exists(path)` | machine-side gate rules (replaces `check` `command` / `file-exists`; regex and forbidden-words are plain TS) | §4.3 `runCommand` control, unchanged |
| `await w.workflow(slug, inputs)` → child result | sub-workflow (replaces the `workflow` node); cycle and depth rules of §3.8 unchanged | child run |
| `w.state(name, schema)` → `{ get, set, update }` | Onyx's shared store: named, zod-typed, persisted per run in `workflow_runs.state`; step sessions get `workflow_state_read(name)` / `workflow_state_write(name, value)` tools validated against the schema | new |
| `await w.checkpoint(label, data?)` | progress marker: a `workflow` frame, a line to the supervisor, visible in the run view | new |
| `await w.sleep(ms)` · `w.now()` | durable timer; journaled clock | new |
| `w.notify(text)` | message to supervisor if any, else operator (Telegram) | §3.7 |
| `w.log(text)` | run log line | new |

Failures are typed: `run`/`spawn` reject with `StepError { kind: "no-result" \| "attempt-timeout" \| "harness-error" \| "cancelled", stepId, attempts }`; `ask` with `AskError { kind: "timeout" \| "dismissed" }`; `workflow` with `ChildError`. An uncaught error fails the run with that error as `failure`; `try/catch` is the `fail` port. Supervisor verbs (§3.7) are unchanged; `note` is delivered as `w.notes()` (drained on read) and appended to the next `run` prompt suffix as before.

### 13.3 Execution and durability
The hub runs each program in an isolated Bun `Worker` per run with only the `w` bridge
crossing the boundary. Durability is **replay** (Temporal's model): every `w.*` effect is
journaled in `workflow_effects (runId, seq, kind, argsHash, result|failure, at)`; on hub
restart the worker re-executes the program from the top and each journaled call resolves
from the journal until the first unresolved one, which then runs live. A program must be
deterministic — the same calls in the same order; a mismatch (different kind or argsHash
at a seq) fails the run `nondeterministic` and names the seq. `w.now()`/`w.sleep()` are
journaled for this reason; `Date.now`/`Math.random` are not exposed. Steps in flight
across a restart resume exactly as §3.1 already does (same session, resume by sessionKey).
`workflow_runs.runtime` is removed; `workflow_steps`/`workflow_attempts` stay as the
public record of `run`/`spawn` calls.

### 13.4 The editor maps out to the program
The canvas remains the authoring surface. The graph JSON stays in `workflows.graph` as the
editor's model; on every save the hub compiles it to `workflows.program`
(`compileWorkflow(graph): string`, deterministic, formatted) and validates the program
(typecheck in the worker sandbox; problems pinned back onto nodes by the compiler's
node→line map). Emission per kind: `start` → `export const inputs`; `step` → `const
<id> = await w.run({...})` (or `w.spawn` when the node's only consumer is a `map`, with
`Promise.all`); `check` → an `if` over plain-TS regex/forbidden-words and `await
w.exec`/`w.exists`; `branch` → `if/else if/else`; a cycle-closing edge → a bounded `for`
with `maxIterations`; `ask` → `await w.ask`; `workflow` → `await w.workflow`; `end` →
`return {...}`; every edge traversal emits `w.trace(edgeId)` so `run.edges`/`run.loops`
(§7.2a) are still populated for editor-origin runs. Every node's output schema is emitted
as zod (`jsonSchemaToZod` at compile; `zodToJsonSchema` at spawn).

`workflows.origin: "editor" | "code"`. Editor-origin programs are regenerated on save and
shown read-only under **View as program**. Code-origin programs (written by hand, or by
an agent through `create_workflow(program)`) have no graph: the editor shows the program
in a code view, and the run view lays the graph out from the effect journal (`run`/`spawn`
= nodes, data flow = edges, `w.trace` absent) with `@dagrejs/dagre`. There is no
decompiler; the mapping is one-way, as the owner asked.

### 13.5 What this replaces
- `packages/hub/src/workflows/engine.ts` graph scheduler → program worker + effect journal + replay. Deleted, not wrapped.
- §8.3 Markdown text form, `workflow-markdown.ts`, `GET …/markdown`, `{ markdown }` bodies → the program: `GET /api/workflows/:id/program` (`text/typescript`), `{ program }` bodies on `POST/PUT`, tools `create_workflow(program)` / `update_workflow(name, program)`. `list_workflows` returns inputs from the zod schema.
- The `map`, `check`, `workflow`, `ask`, `end` **nodes stay in the editor** as authoring constructs; they no longer have interpreter semantics of their own — their meaning is the code they compile to.
- Slash stubs (§8.2) unchanged in behaviour; inputs come from the program's `inputs`.

### 13.6 Phases
7. **core**: `Workflow` API types, `StepError`/`AskError`/`ChildError`, `compileWorkflow(graph)` with node→line map, `programInputs(program)` (zod → inputs list for stubs/launch dialog), `jsonSchemaToZod`. Zod moves to `@cawco/core` deps.
8. **hub**: program worker + `w` bridge, `workflow_effects` table + replay, cutover of routes/tools/stubs from graph to program, deletion of engine scheduler and markdown code, `state` tools on the three harnesses. Verification: the whole phase-1 matrix (§11 phase 1) re-run against programs compiled from the same graphs, plus: a hand-written code-origin program runs; a hub restart mid-run replays to the same seq and continues; a program that calls `w.run` in a different order on replay fails `nondeterministic`; `w.state` written by a step is read by the program; `w.sleep(30_000)` survives a restart.
9. **dashboard**: **View as program** (read-only code view, editor-origin) / code editor (code-origin) replaces markdown buttons; run view for code-origin runs laid out from the journal; checkpoints and state in the step drawer.

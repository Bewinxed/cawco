/**
 * Each role's tool budget, measured (Projects spec §5.3: "Each role has a
 * tool budget measured in tokens"). A role's size is what its `tools/list`
 * answers a typical session in that role — the same `toolsFor` the MCP
 * server lists from — as JSON, in tokens by core's own estimate
 * (`estimateTokens`, the continuation's measure). `bun run roles:check`
 * prints each and fails over {@link ROLE_TOOL_BUDGET}.
 */
import {
  estimateTokens,
  type InstanceRow,
  SESSION_ROLES,
  type SessionRole,
} from "@cawco/core";
import { createActions } from "./actions";
import { createBrowserAsks } from "./browser-tools";
import { createCaw } from "./caw";
import { createConnectAsks } from "./connect-asks";
import { createDelegationMcp } from "./delegation-mcp";
import { createFleetWatch } from "./fleet-watch";
import { createHubTools } from "./hub-tools";
import { createIngress } from "./ingress";
import { makeLifetime } from "./lifetime";
import { createMemory, createTurnWatch } from "./memory";
import { createProjectSettings } from "./project-settings";
import { createRelay } from "./relay";
import { createRoutines } from "./routines";
import type { Tasks } from "./tasks";

/**
 * Tokens a role's listed tool definitions may take: each is its size as
 * measured at slice 9 (worker 16,592; delegate 4,019; lead 8,077; overseer
 * 2,382; web-facing 2,960) plus about 15%. A role that outgrows it splits a
 * tool or trims a description before it ships. The lead's grew at P3: it
 * runs its project's routines (§5.5), five `routine_*` tools of about 870
 * tokens, on top of the 9,295 it had reached. Both the lead and the worker
 * grew again with P3's ingress: eight `event_route_*` and `connector_poll_*`
 * tools of about 1,240 tokens (lead 11,403, worker 20,225 measured). P3's
 * approved actions add three `action_*` tools of about 560 tokens to both
 * (lead 11,967, worker 20,792 measured). P3's relay adds three `relay_*`
 * tools of about 316 tokens, descriptions already cut to a line (lead
 * 12,283, worker 21,108 measured). §5.10's four `artifact_*` tools take
 * the place of the preview's two, about 456 tokens more for the worker and
 * the delegate; the lead takes them in place of its two one-line decision
 * page tools, about 852 more (worker 21,587, delegate 4,727, lead 13,158
 * measured). The canvas (§5.10, slice 3a) gives `artifact_create` and
 * `artifact_update` their bounded skeleton `elements`, `mermaid` and
 * `delete`, and `artifact_read` its `png`, its words cut to a clause each:
 * about 560 tokens more for all three (worker 22,463, delegate 5,422, lead
 * 14,035 measured). 2026-10-13: +memory_note, memory_propose and task
 * context for PRD D8 memory tiers (measured lead 14,392, worker 22,680);
 * raised deliberately, not to absorb drift. The memory curator (§5.4), a
 * role of its own, lists five tools (1,019 measured). P5's fleet watch makes
 * the overseer a triage run: its one decision, `triage_decide`, with the
 * fleet and its task to read, and nothing that messages a session (668
 * measured). The person's pins (§5.7, slice 4b) add `comment_read`,
 * `comment_reply` and `comment_resolve` beside the artifact tools, the
 * agent's only way to read and answer a pin's thread: about 634 tokens more
 * for the worker, the delegate and the lead (worker 23,136, delegate 6,160,
 * lead 14,978 measured). `artifact_promote` (§5.10, slice 6), the agent's
 * only way to keep an artifact in its project's folder, adds about 197
 * tokens to the same three (worker 23,333, delegate 6,358, lead 15,175
 * measured). 2026-10-15: `runs_on` on task_create and task_update, and
 * project_settings' `set_runs_on`: an Apple task named a Mac nowhere, so
 * task_start placed it on Linux (tsk-7, tsk-15). About 80 tokens for the
 * worker, 95 for the lead, descriptions cut to a clause (worker 23,830,
 * lead 15,583 measured). project_settings' `set_apple_gate`: two commits
 * landed with iOS compile errors no Linux check saw. About 30 tokens for
 * the lead, its description cut to the kinds that always ask (lead 15,638
 * measured); gone on 2026-10-18, when a project's gate became its gate.md
 * (gate-file.ts). `artifact_delete` (a superseded artifact leaves the panel) fits
 * the same budgets: the artifact and comment tools' words were cut to pay
 * for it (worker 23,877, delegate 6,440, lead 15,641 measured).
 * 2026-10-15: `machine_pause` (machine-pause.ts), the orchestrator's way to
 * pause a machine for some minutes; with the Mac's agent stopped by hand, an
 * interrupted delegate there still ran the iOS build on battery. About 115
 * tokens for the worker alone (a leaf never has it), its words cut to a
 * line; interrupt_delegate now says its delegate stays idle, about 12 more
 * for the worker and the lead (worker 24,006, lead 15,654 measured).
 * 2026-10-16: admin_memory_read and admin_memory_write take a document's
 * `scope` (memory-scopes.ts): the fleet's orchestrator text reached every
 * leaf and every non-code project. About 160 tokens for the worker, the
 * groups' words cut to a clause each (worker 24,165 measured).
 * 2026-10-16: folder_write's `encoding` (base64), so the design-system flow
 * writes a project's fonts and images into `design/` itself
 * (project-folder.ts `folderContent`). About 11 tokens for the lead, its
 * description cut to a line (lead 15,664 measured).
 * 2026-10-16: `artifact_list` (the owner asked four times in a day which
 * previews were waiting on him; no tool answered it), about 110 tokens for
 * the worker, the delegate and the lead, deferred, not always loaded; and a
 * required `reason` on every `admin_*_write` (the owner approved writes he
 * could not explain), about 300 more for the worker (worker 24,575,
 * delegate 6,573, lead 15,799 measured). Raised deliberately.
 * 2026-10-16: a check's `host` (since removed with every check) and the
 * `inputs` of delegate and handoff, so a probe whose scratch fleet delegates
 * runs outside the sandbox and a delegate gets the files its boundary cannot
 * read. They fit the same budgets: delegate's own words and its `cwd`,
 * `machine`, `workspace` and `fork` were cut to pay for them, and a leaf,
 * with no delegate to hand inputs to, is not listed handoff's `inputs`
 * (worker 24,374, delegate 6,573, lead 15,799 measured).
 * 2026-10-16: the `sheet` kind (live components, D29): a component's
 * states as the project's own real component on its workspace's stage, the
 * agent's one way to show one, in artifact_create (`file`) and
 * artifact_read (its stories, stage and errors), its words cut to a clause
 * each; the design-preview clause shortened to pay for part of it. About
 * 110 tokens for the worker, the delegate and the lead (worker 24,488,
 * delegate 6,703, lead 15,913 measured). Raised deliberately.
 * 2026-10-16: `task_result` (task-tools.ts), the one way an attempt hands
 * in its words, what to check and its artifacts for the task's review, is
 * listed to a work item's session alone; its description asks for the work
 * shown with artifact_create and that artifact handed in first: the review
 * draws it, never a file's format. About 230 tokens for the delegate, its
 * description cut to two sentences (the worker's measure is a session with
 * no work item, which is not listed it) (delegate 6,931 measured). Raised
 * deliberately.
 * 2026-10-16: the hub's own tools counted (hub-tools.ts, the list sessions
 * are given): `update_machines` (164 tokens) and `design_write` (187) put
 * the worker 242 over and the delegate 178 over. They fit the same budgets:
 * generate_image's, handoff's, list_sessions', list_delegate_types' and
 * send_to_user's words were cut to what the schema and each parameter's own
 * description do not already say (worker 24,557, delegate 6,842, lead
 * 15,744 measured).
 * 2026-10-16: live components, slice 2 (spec §5, §6): the person shapes a
 * component from its sheet, and the agent writes the same: artifact_update's
 * `args` (a story's values set and dropped) and `story` (add, duplicate,
 * remove, move), artifact_read's `sheet` (args and props), and
 * `design_map` (the component library), deferred. Their words say only what
 * the schema does not (what a write answers, where `dir` starts), and the
 * story name's pattern is left to the route and the stage, which say why
 * they refuse: 305 tokens for the worker, the delegate and the lead (worker
 * 24,862, delegate 7,147, lead 16,049 measured with the hub's tools). Raised
 * deliberately, by those 305 each.
 * 2026-10-16: artifact_create's `serve` (core `ServeSpec`), the one way a
 * workspace's server is shown: the command CawCo runs and keeps up on the
 * port, required with a workspace's port, so no preview hangs on a server
 * the agent's own shell started; one clause in the description, the field's
 * words its folder's alone. About 100 tokens for the worker, the delegate
 * and the lead (worker 24,992, delegate 7,248, lead 16,150 measured).
 * Raised deliberately; the lead's fits as it stands.
 * 2026-10-16: artifact_create's `to: "parent"`, listed only to a session
 * with a parent, so the delegate alone carries it: a delegate's one way to
 * put what it made in front of the person, in its parent's panel, instead of
 * its parent rebuilding it. One sentence and the bare field: about 50 tokens
 * (delegate 7,303 measured). Raised deliberately; the worker and the lead
 * are measured without a parent and do not change.
 * 2026-10-16: design system proposals and checks (design-system.ts,
 * design-verify.ts): design_write takes `why` and says a change to a
 * system the project had is a proposal, its other words left to the
 * design-system skill and its own refusals; `design_verdict` is listed to a
 * design check's verifier alone (delegation-mcp.ts), so no role's typical
 * session carries it. Within the same budgets (worker 24,991, delegate
 * 7,300 measured).
 * 2026-10-16: acceptance checks removed (the owner: "Remove the tool"):
 * delegate declares none and no tool replaces them; the hub's landing gate alone
 * stands between finished work and main, and the delegate's report is the
 * proof. finish_item's description asks the report to quote the output of
 * each command that proves the work, with a "Not run:" list, its other words
 * cut to pay for it, and task_create's `checks` says the attempt runs them
 * (worker 24,991 → 24,278, delegate 7,291 → 7,239, lead 16,199 → 15,487,
 * web-facing 2,837 → 2,784, curator 1,121 → 1,069 measured). The same
 * budgets.
 * 2026-10-16: a memory document's scope takes `delegateTypes`, `model` and
 * `briefer`, and a rule's `role` and `delegateType` (memory-scopes.ts,
 * briefings.ts): guidance for briefing a model reached the model instead of
 * the session writing the brief, and the model-keyed SessionStart hook's
 * text was summarized away at each compaction. About 150 tokens for the
 * worker alone, the memory group's words and the rule scope's cut to a
 * clause each (worker 24,278 → 24,426 measured). Within the same budgets.
 * 2026-10-16: native compaction (open-items.ts): `open_items`, a session's
 * open items built from its records, the one reader the fleet's SessionStart
 * hook on Claude Code's `compact` source calls (`cawco tool open_items`), so
 * every compaction lists them; and todo_write's one clause saying so, so
 * sessions file what is open there rather than only in chat (the
 * continuation evaluation: 16% with native compaction alone, 47% with open
 * items filed). continue_session's words cut to its one mode. About 55
 * tokens for the worker, the delegate and the lead (worker 24,445, delegate
 * 7,325, lead 15,574 measured). Raised deliberately for the delegate; the
 * worker's and the lead's fit as they stand.
 * 2026-10-17: a declared wait ends on work of the session's own, not on any
 * turn (work-items.ts `worked`), and a cold hand-off goes by what the
 * target's workspace holds on no remote before Jev (delegation-actions.ts
 * `unlandedVerdict`), with delegate's `from` to finish committed work in a
 * fresh session. wait_item says what ends a wait and what leaves it on;
 * handoff says the cold rule with Jev on and off, its old one sentence cut
 * to that, and delegate points to it. Both are behaviour a leaf acts on
 * (two waiting builders and five refused hand-offs stranded work on
 * 2026-10-16/17). About 60 tokens for the delegate (7,392 measured), the
 * words already cut twice. Raised deliberately for the delegate; the
 * worker's and the lead's fit as they stand.
 * 2026-10-18: `memory_recall` (since replaced by `find`), the owner's pick of the
 * memory upgrade ("core and session search"): "have we tried this before",
 * answered from a project's past sessions, for the worker, the delegate and
 * the lead. memory_note gains `since`, memory_propose takes `files` and
 * names the fact line's shape. Every new description cut to a clause and its
 * parameters to a few words; the tool's schema alone is about 220 tokens.
 * About 300 tokens for each (worker 24,877, delegate 7,624, lead 16,466
 * measured). Raised deliberately for the delegate and the lead; the
 * worker's fits.
 * 2026-10-18: decision pages as OpenUI programs (Projects spec §5.8, the
 * owner's picks of 2026-10-18): artifact_create's `program` and
 * artifact_update's `statements`, the page clause of each rewritten to
 * name them, and the lead's decision_add, decision_link and decision_group
 * gone with decisions.json (the graph is derived from the programs). About
 * 70 tokens for the worker and the delegate, about 300 fewer for the lead
 * (worker 25,192, delegate 7,693, lead 16,148 measured, landed together
 * with memory_recall). Raised deliberately for the worker and the delegate,
 * both owner-picked features; the lead's lowered to what it measures.
 * 2026-10-18, after them: `discard_workspace` (work-items.ts `discardFor`): a held
 * workspace is its delegating session's to decide, told by a notice, no
 * longer the owner's from the places list (38 sat there for him to sort),
 * and a discard still writes a carry. One sentence and a one-line argument,
 * about 70 tokens for the worker and the lead (worker 25,314, delegate
 * 7,693, lead 16,270 measured beside `memory_recall` and the decision
 * programs). Raised deliberately for the worker and the lead, both at their
 * budgets.
 * 2026-10-19: the component canvas (the owner's design system, "a canvas
 * where the agent can interactively build components and show it to me"):
 * artifact_create's and artifact_update's `about`, `edges`, `group` and
 * `dials`, artifact_read's `detail`, `story`, `state` and `render`, and
 * design_map in place of components_list (dir, query, component, paging).
 * Every field description past an example was cut; what stays is the shape.
 * About 1,260 tokens for the worker, the delegate and the lead (worker
 * 26,577, delegate 8,956, lead 17,533 measured beside the decision
 * programs, memory_recall and discard_workspace). Raised deliberately, by
 * that, for each.
 * 2026-10-19: `find` (find-tool.ts) in place of `memory_recall`, the owner's
 * ask ("why not give yourself the tool to do this?"): the dashboard's Find
 * as a tool, every kind it finds across the fleet, narrowed by project,
 * machine, since and who said it, paged, with `around` to read a hit's
 * turns. One tool where there was one; its description cut to what it finds
 * and when to reach for it, each parameter to a few words, the kinds the
 * engine's own enum. About 233 tokens more than memory_recall's for the
 * worker, the delegate and the lead (worker 26,810, delegate 9,189, lead
 * 17,766 measured). Raised deliberately, by that, for each.
 * 2026-10-19, after it: `forge_post` (forge-posts.ts, docs/forge-adapters.md),
 * the owner's "an obvious yes" to GitLab and Gitea: an issue, a pull or merge
 * request or a comment on any forge with the machine's own sign-in, which
 * only gh inside a workspace did before, for GitHub alone. Its fields carry
 * no description their names already give. About 329 tokens for the worker
 * and the delegate (worker 27,142, delegate 9,520 measured beside
 * `find`). Raised deliberately, by that, for both.
 * 2026-10-19, after that: `find`'s `before` (YYYY-MM-DD, evidence at or
 * before that day: past.dev's `queryTimestamp`), the memory audit's dated
 * recall moved onto find; its description names the dated branch in four
 * words. About 28 tokens for the worker, the delegate and the lead (worker
 * 27,170, delegate 9,549, lead 17,794 measured beside
 * `forge_post`). Raised deliberately, by that, for each.
 * 2026-10-19, after it: artifact_read's `verify` (component canvas E1, a
 * design system round asked in a chat), the read's words cut to make room
 * for it: about 5 tokens for each, inside the budgets above (worker 27,178,
 * delegate 9,557, lead 17,802 measured). No raise.
 * 2026-10-19, after those: `browser_ask` (browser-tools.ts, Projects spec
 * §5.11, the owner's approved browser take-over): a session asks the person
 * to take over its browser for a sign-in, a code or a payment, with a
 * reason and an origin. Three sentences and two one-line arguments, about
 * 235 tokens for every role that drives a browser (worker 27,415,
 * delegate 9,792, lead 18,044, web-facing 3,149 measured beside `verify`). Raised
 * deliberately, by that, for the worker, the delegate and the lead;
 * web-facing fits.
 * 2026-10-19, after it: artifact_create's `to: "parent"` hands up unopened
 * (the owner's "this just showed up" on a delegate's canvas): its sentence
 * says the parent opens it with artifact_show and the delegate keeps update
 * and read, no longer show. About 15 tokens for the delegate (9,807
 * measured beside `browser_ask`). Raised deliberately, by that; the worker
 * and the lead have no parent and do not change.
 * 2026-10-19, after `to: "parent"`: every artifact carries its ask (the
 * artifact purpose spec, the owner's "any agent trying to use the artifact
 * tool to show me something actually has something for me to do"):
 * artifact_create's `does` and `ask` in place of `about`, its description
 * rewritten around what the person does there and the nothing branch,
 * artifact_update's `ask`, artifact_list's `does`, `ask` and `sent`, and the
 * group line's pointer to the `show` skill, each the spec's own words. About
 * 157 tokens for the worker, the delegate and the lead (worker 27,572,
 * delegate 9,964, lead 18,201 measured beside `to: "parent"`). Raised
 * deliberately, by that, for each.
 * 2026-10-19, after the ask: a maker's change to an artifact its parent
 * opened waits as its next version (artifacts service.ts `holdNext`, the
 * orchestrator's "nothing changes in front of the owner until the parent
 * opens it"): the `to` sentence says so and names the answers' `held`, so
 * a delegate whose update opens nothing knows why. About 28 tokens for the
 * delegate (9,992 measured beside the ask). Raised deliberately, by that;
 * the worker and the lead have no parent and do not change.
 * 2026-10-20: `project_setup` (caw.ts), the owner's "I should be able to
 * trigger the setup anytime naturally via caw": Setup's steps for the
 * lead's project, which he follows in any thread the person asks in. One
 * sentence and two one-line arguments, the parts it asks again an enum.
 * About 128 tokens for the lead alone (lead 18,338 measured beside the
 * held change). Raised deliberately, by that.
 * 2026-10-20, after it: artifact_read and artifact_list read the delegation
 * tree's artifacts (delegation-tree.ts `treeSessions`, so a review leaf
 * judges a sibling's canvas handed to its parent): a clause each, paid for
 * by cutting their own words (worker 27,534, delegate 9,991, lead 18,337
 * measured). No budget moves.
 * 2026-10-21: a work item's `outputs` take folders (work-items.ts
 * `outputsProbe`, a decision page or preview is a folder of a page and its
 * pictures, refused three times as missing): `delegate`'s `outputs` says
 * files or folders with an example of each, and `lands`'s 'none' names
 * folders. About 16 tokens for the worker and the lead (worker 27,551, lead
 * 18,354 measured beside the tree's reads); the worker fits. Raised
 * deliberately, by that, for the lead.
 * 2026-10-21, after it: `artifact_browse` (the owner found no agent could
 * open its own decision page or preview and click it, so every proof asked
 * him to): a session's own browser into one
 * artifact it may read and its embeds, behind a pass of its own. Two
 * sentences and the artifact tools' one `id`, about 225 tokens for the
 * worker, the delegate and the lead (worker 27,776, delegate 10,215, lead
 * 18,580 measured beside `outputs`). Raised deliberately, by that, for each.
 * 2026-10-22: delegate's and handoff's `inputs` show every kind they take
 * (core handed-input.ts), 278 tokens each. They fit the same budgets: what
 * delegate's description said its parameters say again, the `owns` and
 * `group` words three tools share, and what find's and todo_write's schemas
 * already list were cut (worker 27,743, delegate 10,102, lead 18,558
 * measured; `--tools <role>` lists them per tool).
 * 2026-10-28: Caw reads and changes his project's whole dispatch config
 * (tsk-127, GitHub issue #1: no lead tool read or set auto-start, the
 * attempt cap or the budget, and none turned Caw on): project_settings
 * reads with no changes and takes set_dispatch, set_max_attempts,
 * set_review_limit, set_budget and set_caw, one value each; routine_update
 * takes a routine's target, delegate type, lands and budget, its
 * description cut to "any field it was made with". About 340 tokens for
 * the lead, 170 for the worker (worker 25,950, lead 18,624 measured).
 * Raised deliberately, by that, for the lead; the worker fits.
 * 2026-10-28: a task's external items are data (tsk-128): task_create and
 * task_update take `links` (GitHub and Linear URLs), and task_read finds
 * the tasks linking an item by `link` in place of a `github` field the
 * routine matched as text. About 45 tokens for the lead and the worker
 * (lead 18,684 measured). Raised deliberately, by that, for the lead; the
 * worker fits.
 * 2026-10-29: a project's own tools follow scope, not role (one-session
 * design §6, slice 1): a session you started in its project's place lists
 * view_draft, view_query, folder_read, folder_write, project_setup,
 * project_settings, routine_result and memory_propose, as Caw does. About
 * 1,530 tokens for the worker (worker 27,652 measured), the lead unchanged.
 * The worker fits.
 * 2026-10-30: Caw is a plain session (one-session design §6, slice 3): his
 * toolset is the worker's and his project's threads, in place of the
 * board-only list the hub's gate kept him to. About 9,400 tokens for the
 * lead (lead 28,058 measured). Raised deliberately, to the worker's budget
 * and his two thread tools.
 */
const ROLE_TOOL_BUDGET: Record<SessionRole, number> = {
  worker: 27_805,
  delegate: 10_224,
  lead: 28_300,
  overseer: 770,
  "web-facing": 3400,
  curator: 1200,
};

/**
 * A typical session of each role: a session you started, a leaf work item, a
 * project's Caw, triage, a web-facing work item. The worker and the delegate
 * are in a project, and each sample works in its project's place: one in
 * none, or elsewhere, is listed fewer tools (delegation-mcp.ts
 * `PROJECT_ONLY`, roles.ts `allows`), and the budget holds the most a role
 * is listed.
 */
const SAMPLES: Record<SessionRole, Partial<InstanceRow>> = {
  worker: { projectId: "project" },
  delegate: {
    parentInstanceId: "parent",
    workItemId: "item",
    canDelegate: false,
    projectId: "project",
  },
  lead: { role: "lead", projectId: "project" },
  overseer: { role: "overseer" },
  "web-facing": {
    role: "web-facing",
    parentInstanceId: "parent",
    workItemId: "item",
    canDelegate: false,
  },
  curator: {
    role: "curator",
    projectId: "project",
    parentInstanceId: "routine:curator",
    workItemId: "item",
    canDelegate: false,
  },
};

export interface RoleSize {
  budget: number;
  /** Each listed tool's own tokens, by the same measure, largest first. */
  byTool: { name: string; tokens: number }[];
  role: SessionRole;
  tokens: number;
  tools: number;
}

/** One role's tools, as a session of it is listed them on Claude Code: their definitions, as the model reads them. */
export interface RoleTools {
  role: SessionRole;
  tools: { name: string; inputSchema: unknown }[];
}

/** Each role's listed tools, their count and size against its budget, on Claude Code. */
export const measureRoles = (): RoleSize[] =>
  listRoleTools().map(({ role, tools }) => ({
    role,
    tools: tools.length,
    tokens: estimateTokens(JSON.stringify(tools).length),
    budget: ROLE_TOOL_BUDGET[role],
    byTool: tools
      .map((tool) => ({
        name: tool.name,
        tokens: estimateTokens(JSON.stringify(tool).length),
      }))
      .toSorted((a, b) => b.tokens - a.tokens),
  }));

/** Every role's tools as a session of it is listed them ({@link RoleTools}), from one stood-up delegation MCP whose tools are read, never called. */
export const listRoleTools = (): RoleTools[] => {
  const rows = SESSION_ROLES.map((role): InstanceRow => ({
    id: role,
    machineId: "machine",
    cwd: "/",
    harness: "claude",
    launchDir: "known",
    sessionId: null,
    status: "running",
    kind: "mainline",
    ...SAMPLES[role],
  }));
  // The server's sweeps start with it; closed below, through the one path.
  const lifetime = makeLifetime();
  const mcp = createDelegationMcp({
    lifetime,
    // Every sample is in its project's place ({@link SAMPLES}).
    inPlace: () => true,
    instancesByIds: (ids) => rows.filter((row) => ids.includes(row.id)),
    runningOf: (harness) =>
      rows.filter((row) => row.harness === harness && row.status === "running"),
    instanceById: (id) => rows.find((row) => row.id === id),
    instancesByShortId: () => [],
    threads: {
      byId: () => [],
      hand: () => Promise.reject(new Error("A budget read hands nothing")),
    },
    fleet: { instances: () => rows, machines: () => [] },
    formerIds: () => ({}),
    forward: () => Promise.resolve(),
    callKeys: { once: (_actor, _name, _key, run) => run() },
    spawn: () => Promise.reject(new Error("A budget read starts nothing")),
    deliver: () => Promise.reject(new Error("measuring")),
    credentialActor: () => undefined,
    knownCredential: () => false,
    toolListing: () => undefined,
    refreshTools: () => undefined,
    putToolListing: () => undefined,
    // Only the definitions are read: nothing is called.
    tasks: {} as Tasks,
    projectFromSession: () => Promise.reject(new Error("measuring")),
    askPerson: () => Promise.reject(new Error("measuring")),
    sendToUser: () => {
      throw new Error("measuring");
    },
    cawTools: (actor) =>
      createCaw({
        asks: () => [],
        blocks: {} as never,
        caps: {} as never,
        // Caw reads back the turns his leads are in as he is made: none here.
        db: { leadTurns: () => [] } as never,
        proposeType: () => Promise.reject(new Error("measuring")),
        end: () => undefined,
        inTurn: () => false,
        interrupt: () => undefined,
        posted: () => undefined,
        replied: () => undefined,
        sends: {} as never,
        tail: () => undefined,
        fleetChoicesSet: () => false,
        relayOffer: () => null,
        upstreamAnswered: () => false,
        folderChanged: () => undefined,
        leadHome: () => Promise.resolve(undefined),
        makeNote: () => Promise.reject(new Error("measuring")),
        online: () => false,
        projectsChanged: () => undefined,
        publish: () => undefined,
        send: () => false,
        stops: { running: () => [], stop: () => undefined },
        spawn: () => Promise.resolve(),
        task: () => Promise.reject(new Error("measuring")),
        triage: () => Promise.resolve(undefined),
        turnEnded: () => undefined,
        views: {} as never,
      }).tools(actor),
    routineTools: (actor) =>
      createRoutines({
        anyOnline: () => false,
        caw: {} as never,
        curatorBrief: () => Promise.reject(new Error("measuring")),
        db: {} as never,
        hubCheckout: () => Promise.reject(new Error("measuring")),
        jevAccess: () => undefined,
        lifetime,
        online: () => false,
        pauses: () => undefined,
        push: {} as never,
        quiets: () => undefined,
        types: () => [],
        workItems: {} as never,
      }).tools(actor),
    ingressTools: (actor) =>
      createIngress({
        connections: {} as never,
        db: {} as never,
        dispatcher: {} as never,
        eventLanded: () => undefined,
        externalItems: {} as never,
        jevAccess: () => undefined,
        lifetime,
        routines: {} as never,
      }).tools(actor),
    actionTools: (actor) =>
      createActions({
        connections: {} as never,
        db: {} as never,
        lifetime,
        publish: () => undefined,
        push: {} as never,
        tasks: {} as never,
      }).tools(actor),
    relayTools: (actor) =>
      createRelay({
        askPerson: () => Promise.reject(new Error("measuring")),
        connections: {} as never,
        db: {} as never,
        funnel: {} as never,
        ingest: () => undefined,
        lifetime,
      }).tools(actor),
    memoryTools: (actor) =>
      createMemory({
        curator: () => ({
          ensure: () => undefined,
          inboxPassed: () => undefined,
        }),
        db: {} as never,
        folderChanged: () => undefined,
        notice: () => undefined,
        park: () => undefined,
        settle: () => undefined,
        threadOf: () => undefined,
        watch: createTurnWatch({
          fleetHosts: () => [],
          get: () => undefined,
          mcpUrl: () => undefined,
          put: () => undefined,
        }),
      }).tools(actor),
    projectSettings: createProjectSettings({
      ask: () => Promise.reject(new Error("measuring")),
      caw: () => undefined,
      connections: {} as never,
      db: {} as never,
      dispatch: {} as never,
      edit: () => Promise.reject(new Error("measuring")),
      note: () => undefined,
      publish: {} as never,
    }),
    triageTools: (actor) =>
      createFleetWatch({
        asking: () => false,
        // Read once as it is made; nothing else is read while measuring.
        db: { fleetWatchOn: () => false, watchNotices: () => [] } as never,
        end: () => undefined,
        interrupt: () => undefined,
        lifetime,
        line: () => undefined,
        name: () => "",
        notices: () => undefined,
        online: () => false,
        push: () => undefined,
        send: () => undefined,
        spawn: () => Promise.reject(new Error("measuring")),
        stop: () => undefined,
        wakeCaw: () => Promise.reject(new Error("measuring")),
      }).tools(actor),
    // The hub's own tools, from the one list the server gives sessions.
    hubTools: createHubTools({
      askPerson: () => Promise.reject(new Error("measuring")),
      designVerdict: () => Promise.reject(new Error("measuring")),
      designWrite: () => Promise.reject(new Error("measuring")),
      find: () => Promise.reject(new Error("measuring")),
      machineIds: () => [],
      pairing: () => false,
    }),
    // The browser ask, from the one list the server gives sessions.
    browserTools: (actor) =>
      createBrowserAsks({
        browserFor: () => {
          throw new Error("measuring");
        },
        park: () => undefined,
        settle: () => undefined,
      }).tools(actor),
    // The connect ask, from the one list the server gives sessions.
    connectTools: (actor) =>
      createConnectAsks({
        facts: () => {
          throw new Error("measuring");
        },
        park: () => undefined,
        servers: () => [],
        settle: () => undefined,
      }).tools(actor),
  });
  try {
    return SESSION_ROLES.map((role) => {
      const listed = mcp.list(role);
      if (!listed) {
        throw new Error(`No measuring session for role ${role}.`);
      }
      // What the model reads: a tool's `_meta` (its alwaysLoad mark) is
      // Claude Code's to act on, never part of the definition it sends.
      return {
        role,
        tools: listed.tools.map(({ _meta, ...tool }) => tool),
      };
    });
  } finally {
    lifetime.close();
  }
};

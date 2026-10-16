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
import { createCaw } from "./caw";
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
 * lead 15,583 measured). project_settings' `set_apple_gate` (apple-gate.ts):
 * two commits landed with iOS compile errors no Linux check saw, and the
 * gate that stops that is the person's per project. About 30 tokens for
 * the lead, its description cut to the kinds that always ask (lead 15,638
 * measured). `artifact_delete` (a superseded artifact leaves the panel) fits
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
 * `components_list` (§6's discovery), deferred. Their words say only what
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
 */
export const ROLE_TOOL_BUDGET: Record<SessionRole, number> = {
  worker: 25_000,
  delegate: 7310,
  lead: 16_220,
  overseer: 770,
  "web-facing": 3400,
  curator: 1200,
};

/**
 * A typical session of each role: a session you started, a leaf work item, a
 * project's Caw, triage, a web-facing work item. The worker and the delegate
 * are in a project: one in none is listed fewer tools (delegation-mcp.ts
 * `PROJECT_ONLY`), and the budget holds the most a role is listed.
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
  role: SessionRole;
  tokens: number;
  tools: number;
}

/** Each role's listed tools, their count and size against its budget. */
export const measureRoles = (): RoleSize[] => {
  const rows = SESSION_ROLES.map((role): InstanceRow => ({
    id: role,
    machineId: "machine",
    cwd: "/",
    launchDir: "known",
    sessionId: null,
    status: "running",
    ...SAMPLES[role],
  }));
  // The server's sweeps start with it; closed below, through the one path.
  const lifetime = makeLifetime();
  const mcp = createDelegationMcp({
    lifetime,
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
    cawTools: (actor) =>
      createCaw({
        asks: () => [],
        blocks: {} as never,
        caps: {} as never,
        // Caw reads back the turns his leads are in as he is made: none here.
        db: { leadTurns: () => [] } as never,
        end: () => undefined,
        inTurn: () => false,
        interrupt: () => undefined,
        fleetChoicesSet: () => false,
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
        wakeSent: () => undefined,
        refreshPlace: () => Promise.resolve(),
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
      connections: {} as never,
      db: {} as never,
      edit: () => Promise.reject(new Error("measuring")),
      note: () => undefined,
      publish: {} as never,
      runsOn: () => Promise.reject(new Error("measuring")),
    }),
    triageTools: (actor) =>
      createFleetWatch({
        asking: () => false,
        // Read once as it is made; nothing else is read while measuring.
        db: { fleetWatchOn: () => false } as never,
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
      machineIds: () => [],
      pairing: () => false,
    }),
  });
  try {
    return SESSION_ROLES.map((role) => {
      const listed = mcp.list(role);
      if (!listed) {
        throw new Error(`No measuring session for role ${role}.`);
      }
      // What the model reads: a tool's `_meta` (its alwaysLoad mark) is
      // Claude Code's to act on, never part of the definition it sends.
      const tools = listed.tools.map(({ _meta, ...tool }) => tool);
      return {
        role,
        tools: tools.length,
        tokens: estimateTokens(JSON.stringify(tools).length),
        budget: ROLE_TOOL_BUDGET[role],
      };
    });
  } finally {
    lifetime.close();
  }
};

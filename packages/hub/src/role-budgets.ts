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
  KIND_SEED,
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
 * last measured when it was raised deliberately, plus a little room. A role
 * that outgrows it splits a tool or trims a description before it ships.
 * Every raise and what it bought is in this block's history (`git log -L`
 * on it), from slice 9's first measure on.
 * 2026-10-30: one kind of session. The project's own tools (view_draft,
 * view_query, folder_read, folder_write, project_setup, project_settings,
 * routine_result, memory_propose) are a worker's wherever its folder is in a
 * project, and the conversation tools of a separate role are gone (worker
 * 27,907 measured). The worker's budget is lowered to it.
 * 2026-10-31: a canvas's elements say that text wraps at its width and a
 * childless frame takes what it covers, which agents had worked out by hand
 * (worker 27,968 measured).
 * 2026-10-31: every role lists no_reply_needed, the one way Claude Code takes
 * a turn with no text (worker 28,065, curator 1,292 measured).
 * 2026-10-31: the prompt audit gave the bare parameters of task_read,
 * task_result, machine_pause, answer_delegate and forge_post their contracts,
 * and no_reply_needed and open_items theirs (worker 28,665, delegate 10,716,
 * curator 1,332 measured).
 * 2026-10-31: only a session that talks with the person lists no_reply_needed,
 * so no work item and no triage run does (worker 28,632, delegate 10,550,
 * curator 1,166 measured). The delegate's and curator's budgets are lowered to it.
 * 2026-10-31: admin_subagents_read and admin_subagents_write, so a fleet
 * subagent is changed with the owner's approval like every other kind of
 * fleet configuration (worker 29,065 measured).
 * 2026-11-02: delegate_list takes a `target` (and its steps' `page`): one
 * delegate in full, its steps, context, made so far and last words, in
 * place of reading its transcript by hand; 143 tokens (worker 29,221
 * measured, from 29,078). Only a session that may start delegates lists it,
 * so the delegate's role is unchanged.
 * 2026-11-02: a project's setup and a view's ask carry the person's words
 * alone; their procedures moved to the project-setup and project-view skills
 * and their facts to tools: project_setup answers data, project_name names a
 * project made from New project's words, view_guide answers how a view is
 * written (worker 29,365 measured).
 * 2026-11-04: generate_image takes a `provider` (ChatGPT by default, the
 * Antigravity CLI on asking), so an agent can make an image through the
 * owner's Gemini subscription too, and says a JPEG lands as .jpg (worker
 * 29,456 measured).
 * 2026-11-04: generate_image's provider may be the Gemini API on a held
 * key, which takes a `model` of its four, and its default is the fleet's
 * setting (worker 29,540, delegate 10,569 measured).
 */
const ROLE_TOOL_BUDGET: Record<SessionRole, number> = {
  worker: 29_600,
  delegate: 10_600,
  overseer: 770,
  "web-facing": 3400,
  curator: 1200,
};

/**
 * A typical session of each role: a session you started, a leaf work item,
 * triage, a web-facing work item, a memory curator run. The worker and the
 * delegate are in a project: one in none is listed fewer tools
 * (delegation-mcp.ts `PROJECT_ONLY`, roles.ts `allows`), and the budget holds
 * the most a role is listed.
 */
const SAMPLES: Record<SessionRole, Partial<InstanceRow>> = {
  worker: { projectId: "project" },
  delegate: {
    parentInstanceId: "parent",
    workItemId: "item",
    mayStart: [],
    projectId: "project",
  },
  overseer: { role: "overseer" },
  "web-facing": {
    role: "web-facing",
    parentInstanceId: "parent",
    workItemId: "item",
    mayStart: [],
  },
  curator: {
    role: "curator",
    projectId: "project",
    parentInstanceId: "routine:curator",
    workItemId: "item",
    mayStart: [],
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
export const listRoleTools = (): RoleTools[] => standUp().roles;

/**
 * The tools a group lists that the hub routes elsewhere (delegation-mcp.ts
 * `unrouted`): each is listed to a session and refused at its call.
 */
export const unroutedTools = (): string[] => standUp().unrouted;

/** One stood-up delegation MCP's listings and unrouted tools, read, never called. */
const standUp = (): { roles: RoleTools[]; unrouted: string[] } => {
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
    decidesKinds: () => KIND_SEED,
    instancesByIds: (ids) => rows.filter((row) => ids.includes(row.id)),
    runningOf: (harness) =>
      rows.filter((row) => row.harness === harness && row.status === "running"),
    instanceById: (id) => rows.find((row) => row.id === id),
    instancesByShortId: () => [],
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
    personOwed: () => {
      throw new Error("Listing the tools asks nothing");
    },
    sendToUser: () => {
      throw new Error("measuring");
    },
    cawTools: (actor) =>
      createCaw({
        answered: () => undefined,
        blocks: {} as never,
        caps: {} as never,
        db: {} as never,
        proposeType: () => Promise.reject(new Error("measuring")),
        end: () => undefined,
        folderChanged: () => undefined,
        leadHome: () => Promise.resolve(undefined),
        machines: { name: (machineId) => machineId, online: () => [] },
        rename: () => Promise.reject(new Error("measuring")),
        noted: () => undefined,
        online: () => false,
        projectsChanged: () => undefined,
        send: () => false,
        stops: { running: () => [], stop: () => undefined },
        spawn: () => Promise.resolve(),
        task: () => Promise.reject(new Error("measuring")),
        conversationStarted: () => undefined,
        turnEnded: () => undefined,
        views: {} as never,
        workPlace: () => ({ kind: "none", why: "measuring", fix: "" }),
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
        pauses: () => undefined,
        push: {} as never,
        quiets: () => undefined,
        types: () => [],
        workItems: {} as never,
        workPlace: () => ({ kind: "none", why: "measuring", fix: "" }),
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
        tell: () => Promise.reject(new Error("measuring")),
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
        watch: createTurnWatch({
          fleetHosts: () => [],
          get: () => undefined,
          mcpUrl: () => undefined,
          put: () => undefined,
        }),
      }).tools(actor),
    projectSettings: createProjectSettings({
      accounts: () => [],
      areas: {} as never,
      inEffect: () => Promise.reject(new Error("measuring")),
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
        tell: () => Promise.reject(new Error("measuring")),
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
        handedBack: () => undefined,
      }).tools(actor),
    // The connect ask, from the one list the server gives sessions.
    connectTools: (actor) =>
      createConnectAsks({
        denials: () => ({ fleet: [] }),
        facts: () => {
          throw new Error("measuring");
        },
        heal: () => Promise.resolve({ kind: "unanswered" }),
        park: () => undefined,
        servers: () => [],
        settle: () => undefined,
      }).tools(actor),
  });
  try {
    const roles = SESSION_ROLES.map((role) => {
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
    return { roles, unrouted: mcp.unrouted() };
  } finally {
    lifetime.close();
  }
};

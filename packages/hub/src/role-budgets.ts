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
import { createIngress } from "./ingress";
import { makeLifetime } from "./lifetime";
import { createMemory, createTurnWatch } from "./memory";
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
 * measured).
 */
export const ROLE_TOOL_BUDGET: Record<SessionRole, number> = {
  worker: 23_800,
  delegate: 6500,
  lead: 15_500,
  overseer: 770,
  "web-facing": 3400,
  curator: 1200,
};

/** A typical session of each role: a session you started, a leaf work item, a project's Caw, triage, a web-facing work item. */
const SAMPLES: Record<SessionRole, Partial<InstanceRow>> = {
  worker: {},
  delegate: {
    parentInstanceId: "parent",
    workItemId: "item",
    canDelegate: false,
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
  const rows = SESSION_ROLES.map(
    (role): InstanceRow => ({
      id: role,
      machineId: "machine",
      cwd: "/",
      launchDir: "known",
      sessionId: null,
      status: "running",
      ...SAMPLES[role],
    })
  );
  // The server's sweeps start with it; closed below, through the one path.
  const lifetime = makeLifetime();
  const mcp = createDelegationMcp({
    lifetime,
    instancesByIds: (ids) => rows.filter((row) => ids.includes(row.id)),
    runningOf: (harness) =>
      rows.filter((row) => row.harness === harness && row.status === "running"),
    instanceById: (id) => rows.find((row) => row.id === id),
    fleet: { instances: () => rows, machines: () => [] },
    formerIds: () => ({}),
    forward: () => Promise.resolve(),
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
        caps: {} as never,
        // Caw reads back the turns his leads are in as he is made: none here.
        db: { leadTurns: () => [] } as never,
        end: () => undefined,
        inTurn: () => false,
        interrupt: () => undefined,
        fleetChoicesSet: () => false,
        folderChanged: () => undefined,
        leadHome: () => Promise.resolve(undefined),
        makeNote: () => Promise.reject(new Error("measuring")),
        online: () => false,
        publish: () => undefined,
        send: () => false,
        stops: { running: () => [], stop: () => undefined },
        spawn: () => Promise.resolve(),
        task: () => Promise.reject(new Error("measuring")),
        triage: () => Promise.resolve(undefined),
        turnEnded: () => undefined,
        views: {} as never,
        wakeSent: () => undefined,
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
        park: () => undefined,
        settle: () => undefined,
        watch: createTurnWatch({
          fleetHosts: () => [],
          get: () => undefined,
          mcpUrl: () => undefined,
          put: () => undefined,
        }),
      }).tools(actor),
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
  });
  try {
    return SESSION_ROLES.map((role) => {
      const listed = mcp.list(role);
      if (!listed) {
        throw new Error(`No measuring session for role ${role}.`);
      }
      const { tools } = listed;
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

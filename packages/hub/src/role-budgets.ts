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
import { createIngress } from "./ingress";
import { makeLifetime } from "./lifetime";
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
 * measured).
 */
export const ROLE_TOOL_BUDGET: Record<SessionRole, number> = {
  worker: 22_000,
  delegate: 5000,
  lead: 13_500,
  overseer: 2800,
  "web-facing": 3400,
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
        online: () => false,
        publish: () => undefined,
        send: () => undefined,
        stops: { running: () => [], stop: () => undefined },
        spawn: () => Promise.resolve(),
        task: () => Promise.reject(new Error("measuring")),
        views: {} as never,
      }).tools(actor),
    routineTools: (actor) =>
      createRoutines({
        anyOnline: () => false,
        caw: {} as never,
        db: {} as never,
        hubCheckout: () => Promise.reject(new Error("measuring")),
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

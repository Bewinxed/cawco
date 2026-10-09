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
import { createCaw } from "./caw";
import { createDelegationMcp } from "./delegation-mcp";
import { makeLifetime } from "./lifetime";
import type { Tasks } from "./tasks";

/**
 * Tokens a role's listed tool definitions may take: each is its size as
 * measured at slice 9 (worker 16,592; delegate 4,019; lead 8,077; overseer
 * 2,382; web-facing 2,960) plus about 15%. A role that outgrows it splits a
 * tool or trims a description before it ships.
 */
export const ROLE_TOOL_BUDGET: Record<SessionRole, number> = {
  worker: 19_000,
  delegate: 4600,
  lead: 9300,
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
    instances: () => rows,
    instanceById: (id) => rows.find((row) => row.id === id),
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
        db: {} as never,
        end: () => undefined,
        fleetChoicesSet: () => false,
        folderChanged: () => undefined,
        leadHome: () => Promise.resolve(undefined),
        pages: {
          show: () => Promise.reject(new Error("measuring")),
          choices: () => {
            throw new Error("measuring");
          },
        },
        online: () => false,
        publish: () => undefined,
        send: () => undefined,
        spawn: () => Promise.resolve(),
        task: () => Promise.reject(new Error("measuring")),
        views: {} as never,
      }).tools(actor),
  });
  try {
    return SESSION_ROLES.map((role) => {
      const { tools } = mcp.list(role);
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

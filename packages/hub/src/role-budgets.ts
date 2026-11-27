/**
 * Each role's listed tools (`listRoleTools`), and their measured token count
 * (`measureRoles`), read from the tool definitions alone.
 */
import { estimateTokens } from "@cawco/core/continuation";
import {
  ANY_TYPE,
  SESSION_ROLES,
  type SessionRole,
} from "@cawco/core/delegate-types";
import type { InstanceRow } from "@cawco/core/protocol";
import {
  definedTools,
  listedFor,
  listedTools,
  toolViewOf,
  withFeedback,
} from "./delegation-mcp";

/**
 * A typical session of each role: a session you started, a leaf work item,
 * triage, a web-facing work item, a trim run. The worker and the
 * delegate are in a project: one in none is listed fewer tools
 * (delegation-mcp.ts `PROJECT_ONLY`, roles.ts `allows`).
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
  trimmer: {
    role: "trimmer",
    projectId: "project",
    parentInstanceId: "routine:trim",
    workItemId: "item",
    mayStart: [],
  },
};

export interface RoleSize {
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

/** Each role's listed tools, their count and size in tokens, on Claude Code. */
export const measureRoles = (): RoleSize[] =>
  listRoleTools().map(({ role, tools }) => ({
    role,
    tools: tools.length,
    tokens: estimateTokens(JSON.stringify(tools).length),
    byTool: tools
      .map((tool) => ({
        name: tool.name,
        tokens: estimateTokens(JSON.stringify(tool).length),
      }))
      .toSorted((a, b) => b.tokens - a.tokens),
  }));

/**
 * Every role's tools as a session of it is listed them ({@link RoleTools}),
 * read from the tool definitions alone: the hub's own listing of a session
 * (delegation-mcp.ts `listedTools`), none of its tools called.
 */
export const listRoleTools = (): RoleTools[] =>
  SESSION_ROLES.map((role) => {
    const row = sampleOf(role);
    // The most a role is listed: usability feedback on.
    const listed = listedTools(
      row,
      withFeedback(definedTools(toolViewOf(row, undefined)), true),
      []
    );
    // What the model reads: a tool's `_meta` (its always-load marks) is
    // the harness's to act on, never part of the definition it sends.
    return {
      role,
      tools: listed.map(listedFor(row)).map(({ _meta, ...tool }) => tool),
    };
  });

/** The sample session of `role`: its id the role's name. */
const sampleOf = (role: SessionRole): InstanceRow => ({
  id: role,
  machineId: "machine",
  cwd: "/",
  harness: "claude",
  launchDir: "known",
  sessionId: null,
  status: "running",
  kind: "mainline",
  // A session nobody delegated work to, as a person's: a role's sample
  // that is a delegate says its own.
  mayStart: [ANY_TYPE],
  startingSet: null,
  ...SAMPLES[role],
});

/**
 * What binds a fleet row (an MCP server, a hook, a harness config) to a
 * place, kept out of fleet.ts so the rows' owners can sit below it.
 */

/**
 * Where a fleet row applies, in Claude Code's own vocabulary:
 *
 * - `user` — every machine, every project. The default, and what most rows
 *   want.
 * - `local`, `project` — one project ({@link FleetPlacement.projectId}),
 *   or every project in one area ({@link FleetPlacement.areaId}):
 *   the hub sends the row once to a machine that holds the project
 *   ({@link MachineFleetConfig.projects}), the machine places a copy at each
 *   checkout and workspace clone of it there, and each session in that
 *   folder takes it. An MCP server, a hook, Claude Code
 *   settings, an OpenCode plugin and a pi extension reach the folder's
 *   sessions through CawCo's own files and their launch (agent
 *   fleet-mcp-set.ts, fleet-harness-set.ts), never a file in the checkout.
 *   A skill is placed in `<cwd>/.claude/skills/` under either scope, kept
 *   out of the checkout's status.
 */
export type FleetScope = "user" | "project" | "local";

/**
 * What binds a row to a place. An absent `scope` reads as `user`, so every
 * row written before scopes existed still means what it meant.
 */
export interface FleetPlacement {
  /**
   * The hub `areas` row this is bound to, in place of one project: every
   * project in that area as the hub reads it (core areas.ts). A machine is
   * sent it under each such project it holds, as that project's own row
   * (hub project-placements.ts); a project's own row of the same key wins.
   * One of `projectId` and `areaId` is required unless `user`, never both.
   */
  areaId?: string;
  /**
   * The folder this copy is written into: set by the machine as it places a
   * project's row at one of the project's places there (agent
   * fleet-place.ts), never by the hub, which sends each row once.
   */
  cwd?: string;
  /**
   * The place this copy is for ({@link placeKeyOf} of its folder), on a
   * copy the machine placed: its converge keys what the copy came to under
   * `<key>@<placeId>`, and its report says it per place
   * ({@link FleetSyncReport.placed}).
   */
  placeId?: string;
  /** The hub `projects` row this is bound to. One of it and `areaId` is required unless `user`. */
  projectId?: string;
  scope?: FleetScope;
}

/**
 * Why a row's binding is not one place, in a sentence naming its kind
 * (`a hook`), or nothing when it is: a project's or an area's row names
 * exactly one of them; a `user` row names neither.
 */
export const placementProblem = (
  row: FleetPlacement,
  kind: string
): string | undefined => {
  if (row.projectId && row.areaId) {
    return `${kind} is bound to one project or one area, not both.`;
  }
  if (row.scope && row.scope !== "user" && !(row.projectId || row.areaId)) {
    return `${kind} bound to a project needs its project or its area. Choose one, or make it fleet-wide.`;
  }
  return undefined;
};

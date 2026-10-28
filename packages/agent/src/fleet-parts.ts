/**
 * The parts a machine's fleet converge is cut into, one per kind of thing it
 * writes, and which item kinds move each (core fleet-items.ts). A delta runs
 * the converge of the parts its items moved and no other (fleet.ts
 * `converge`, each harness's `syncFleet`), and each consumer of what was
 * written (a live session's servers and settings, a boundary's form) is told
 * only when a part it reads moved: Kubernetes' controllers "operate on one
 * item at a time" and act on the difference alone
 * (https://github.com/kubernetes/community/blob/master/contributors/devel/sig-api-machinery/controllers.md).
 */
import type { FleetReportSection } from "@cawco/core";
import {
  type FleetItemKind,
  itemKind,
  projectItemOf,
} from "@cawco/core/fleet-items";
import { unhandled } from "@cawco/core/unhandled";

/**
 * - `mcp`: the fleet's MCP servers and each project's placed copies, as the
 *   fleet MCP set and each harness's server config hold them;
 * - `plugins`: the marketplaces, plugins and their vendored payloads;
 * - `skills`, `placedSkills`: the fleet's skills in each harness's skills
 *   dir; a project's in its places' `.claude/skills`;
 * - `memory`, `memoryDocs`, `placedMemory`: each harness's memory file; the
 *   fleet's linked documents; a project's in its places' `.claude/rules`;
 * - `hooks`: the fleet's and each project's hooks, their scripts, the user
 *   settings that register the fleet's, and the harness set's entries;
 * - `harnessConfig`: the fleet's and each project's Claude Code settings,
 *   OpenCode plugins and pi extensions.
 */
export type FleetPart =
  Exclude<FleetReportSection, "marketplaces"> | "placedSkills" | "placedMemory";

/** Every part, in the order a converge runs them. */
export const FLEET_PARTS: readonly FleetPart[] = [
  "mcp",
  "plugins",
  "skills",
  "placedSkills",
  "memory",
  "memoryDocs",
  "placedMemory",
  "hooks",
  "harnessConfig",
];

/** What a project's place holds: every part a checkout added or taken away moves. */
const PLACED_PARTS: readonly FleetPart[] = [
  "mcp",
  "placedSkills",
  "placedMemory",
  "hooks",
  "harnessConfig",
];

/** The parts an item of `kind` moves; none for the policy, written as it arrives. */
const partsOfKind = (kind: FleetItemKind): readonly FleetPart[] => {
  switch (kind) {
    case "policy":
      return [];
    case "mcp":
    case "projectMcp":
      return ["mcp"];
    case "marketplace":
    case "plugin":
    case "pluginPayload":
    case "hubOnly":
      return ["plugins"];
    case "skill":
      return ["skills"];
    case "projectSkill":
      return ["placedSkills"];
    case "memory":
      return ["memory"];
    case "memoryDoc":
      return ["memoryDocs"];
    case "projectMemory":
      return ["placedMemory"];
    case "hook":
    case "projectHook":
      return ["hooks"];
    case "harnessConfig":
    case "projectHarnessConfig":
      return ["harnessConfig"];
    case "projectCheckout":
      return PLACED_PARTS;
    default:
      unhandled("kind", kind);
  }
};

/**
 * What a converge's items moved: its parts, the kinds of fleet-wide items
 * among them, and each project whose rows moved with the parts they did.
 */
export interface FleetMoves {
  parts: ReadonlySet<FleetPart>;
  projects: ReadonlyMap<string, ReadonlySet<FleetPart>>;
  wide: ReadonlySet<FleetItemKind>;
}

/** The moves of items `ids`; every part of every kind for `all` (a person's Sync). */
export const movesOf = (ids: Iterable<string>, all = false): FleetMoves => {
  const parts = new Set<FleetPart>(all ? FLEET_PARTS : []);
  const wide = new Set<FleetItemKind>();
  const projects = new Map<string, Set<FleetPart>>();
  for (const id of ids) {
    const kind = itemKind(id);
    const moved = partsOfKind(kind);
    for (const part of moved) {
      parts.add(part);
    }
    const project = projectItemOf(id)?.projectId;
    if (project === undefined) {
      wide.add(kind);
      continue;
    }
    const held = projects.get(project) ?? new Set<FleetPart>();
    for (const part of moved) {
      held.add(part);
    }
    projects.set(project, held);
  }
  return { parts, projects, wide };
};

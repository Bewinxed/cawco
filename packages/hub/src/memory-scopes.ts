/**
 * Which of the fleet's scoped memory documents a session launches with
 * (core fleet.ts `MemoryScope`): by its role, the delegate type it started
 * as, its model and its project. The hub picks them as it grants a launch
 * (server.ts `grantLaunch`), so every launch, restore and relaunch carries
 * what the fleet says now; the harness puts them in the session's own
 * instructions, which a compaction keeps. A document scoped to projects
 * alone is placed in the projects' folders instead (project-placements.ts),
 * and a briefer's reaches the session that delegates (briefings.ts); neither
 * is picked here.
 */
import type {
  DocumentFacts,
  InstanceRow,
  MemoryScope,
  SessionInstruction,
} from "@cawco/core";
import { sessionTakes } from "@cawco/core";
import type { PlacementPlace } from "./project-placements";
import { memoryRoleOf } from "./roles";

/** A document as the picking needs it. */
interface ScopedDoc {
  content: string;
  path: string;
  scope?: MemoryScope;
}

/** The session as the picking needs it. */
interface Launching {
  cwd: string;
  machineId: string;
  projectId?: string | null;
}

/** Whether `cwd` is `folder` or lies inside it. */
const inside = (cwd: string, folder: string): boolean =>
  cwd === folder ||
  cwd.startsWith(folder.endsWith("/") ? folder : `${folder}/`);

/**
 * The checkouts and workspaces on a session's machine that hold its folder,
 * the deepest first, where places nest.
 */
export const placesHolding = (
  session: Launching,
  places: readonly PlacementPlace[]
): PlacementPlace[] =>
  places
    .filter(
      (place) =>
        place.machineId === session.machineId &&
        (place.kind === "checkout" || place.kind === "workspace") &&
        inside(session.cwd, place.path)
    )
    .sort((a, b) => b.path.length - a.path.length);

/**
 * The project a session works in: the one it was started from, else the one
 * whose checkout or workspace holds its folder, which is where its
 * project-scoped documents are placed.
 */
export const sessionProject = (
  session: Launching,
  places: readonly PlacementPlace[]
): string | undefined =>
  session.projectId || placesHolding(session, places)[0]?.projectId;

/**
 * The documents a session launches with: each whose scope picks sessions by
 * role, delegate type or model, and whose every field this session meets
 * (core fleet.ts `sessionTakes`). In path order, as the fleet lists them.
 */
export const sessionInstructions = (
  docs: readonly ScopedDoc[],
  facts: DocumentFacts
): SessionInstruction[] =>
  docs.flatMap(({ path, content, scope }) =>
    sessionTakes(scope, facts) ? [{ path, content }] : []
  );

/** What a launching session's row says about it, as a document's scope reads it. */
export const documentFacts = (
  row: InstanceRow,
  places: readonly PlacementPlace[]
): DocumentFacts => ({
  role: memoryRoleOf(row),
  delegateType: row.delegateType ?? null,
  model: row.model ?? null,
  projectId: sessionProject(row, places),
});

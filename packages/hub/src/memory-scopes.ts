/**
 * Which of the fleet's role-scoped memory documents a session launches with
 * (core fleet.ts `MemoryScope`). The hub picks them as it grants a launch
 * (server.ts `grantLaunch`), so every launch, restore and relaunch carries
 * what the fleet says now; the harness puts them in the session's own
 * instructions. A document scoped to a project alone is placed in the
 * project's folders instead (project-placements.ts) and is not picked here.
 */
import type { MemoryRole, MemoryScope, SessionInstruction } from "@cawco/core";
import type { PlacementPlace } from "./project-placements";

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
 * The documents scoped to `role` that a session of it in `projectId` loads:
 * each with that role and no projects, and each with that role whose
 * projects include this one. In path order, as the fleet lists them.
 */
export const roleInstructions = (
  docs: readonly ScopedDoc[],
  role: MemoryRole,
  projectId: string | undefined
): SessionInstruction[] =>
  docs.flatMap(({ path, content, scope }) =>
    scope?.role === role &&
    (!scope.projectIds ||
      (projectId !== undefined && scope.projectIds.includes(projectId)))
      ? [{ path, content }]
      : []
  );

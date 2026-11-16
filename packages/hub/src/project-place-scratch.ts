/**
 * A project's checkout outlives the session that made it, so none stands in
 * its machine's scratch root (core paths/roots.ts `workspaceScratchRoot`):
 * every workspace's and session's `TMPDIR` is a folder there, removed when
 * it ends. Each way a place is made (a project created or joined from a
 * folder, a place added, a move's target) refuses one there with
 * {@link scratchPlaceRefusal}.
 */
import type { MachinePath } from "@cawco/core/machine-path";
import { workspaceScratchRoot } from "@cawco/core/paths/roots";
import { projectPlaceWords } from "@cawco/core/words/project-place";
import { problem } from "elysia";

/** A place refused for standing in its machine's scratch root. */
export type ScratchPlaceProblem = ReturnType<
  typeof problem<400, { code: "project-place-scratch"; detail: string }>
>;

/**
 * The refusal of a project's checkout at `path` on a machine whose home is
 * `home` (as its daemon reported it), when `path` is that machine's scratch
 * root or inside it; undefined when it is not, or the home is not known
 * (a path under `~` there is refused before this, core machine-path.ts).
 */
export const scratchPlaceRefusal = (
  home: string | null | undefined,
  path: MachinePath
): ScratchPlaceProblem | undefined => {
  if (!home?.startsWith("/")) {
    return;
  }
  const root = workspaceScratchRoot(home);
  if (path !== root && !path.startsWith(`${root}/`)) {
    return;
  }
  return problem(400, {
    code: "project-place-scratch",
    detail: projectPlaceWords.inScratch(path, root),
  });
};

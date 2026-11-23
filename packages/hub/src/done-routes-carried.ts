/**
 * Review before done, carried into Who decides once: a project whose
 * review was off when it became the `done` kind (migration 0472) gets a
 * decides.md line handing marking tasks done to Caw, so its sessions go on
 * closing their own tasks; one whose review was on follows the fleet's
 * `done`, which is You (core `DEFAULT_ROUTES`), and is owed nothing. Each
 * line is one commit by the hub, as the hub starts. A decides.md that does
 * not read, or a folder that refuses the write, keeps its project owed
 * (every kind is the person's meanwhile, `done` included) and is tried
 * again at the next start.
 */

import { BUILT_IN, DONE_KIND, type FleetDecides } from "@cawco/core/decides";
import type { decidesFileWith } from "./decides";

export interface DoneRoutesCarriedDeps {
  readonly carried: (projectId: string) => void;
  /** Project `projectId`'s decides.md with `routes` set over its own (decides.ts `decidesFileWith`). */
  readonly fileWith: typeof decidesFileWith;
  readonly fleet: () => FleetDecides;
  readonly owed: () => string[];
  readonly write: (
    projectId: string,
    content: string,
    message: string
  ) => Promise<{ response: { detail: string } } | undefined>;
}

const MESSAGE =
  "decides: marking tasks done goes to Caw, as Review before done was off";

export const carryDoneRoutes = async (
  deps: DoneRoutesCarriedDeps
): Promise<void> => {
  const owed = deps.owed();
  let written = 0;
  for (const projectId of owed) {
    const file = await deps.fileWith(projectId, deps.fleet(), {
      [DONE_KIND]: BUILT_IN.caw.id,
    });
    const refused =
      typeof file === "string"
        ? await deps.write(projectId, file, MESSAGE)
        : file;
    if (refused) {
      console.warn(
        `[done routes] ${projectId}: its decides.md kept no line for marking tasks done, tried again at the next start: ${refused.response.detail}`
      );
      continue;
    }
    deps.carried(projectId);
    written += 1;
  }
  if (owed.length > 0) {
    console.info(
      `[done routes] ${written} of ${owed.length} project(s) hand marking tasks done to Caw, as their Review before done was off`
    );
  }
};

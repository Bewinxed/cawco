import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { snapshot } from "./place-guard";
import { commandsIn, workProcesses } from "./processes";
import { readRetiring, starting } from "./state";

/** How often the boundaries of an older form are looked at. */
export const STALE_LOOK_MS = 5000;

/** The workspaces whose boundary is of an older form, to hand over. */
export const stale = new Map<string, WorkspaceRef>();

/** The workspaces with an older boundary still running beside the current one. */
export const retiring = new Set<string>();

/**
 * The workspaces whose running sandbox holds an srt mount point, a file,
 * where a dir stands in (`stand-ins.ts`): left by a sandbox started before
 * the stand-ins, or covered again by one started beside it. Unlinking it on
 * the host would drop the deny inside that sandbox, so the boundary is
 * replaced once nothing runs in it, and its new host makes the dir. Each
 * with the commands running at the last look that left it as it is
 * ({@link drainable}).
 */
export const stubbed = new Map<
  string,
  { readonly ref: WorkspaceRef; commands: readonly number[] }
>();

/**
 * Why the start-up pass left each older boundary of workspaces `ids`
 * running (control.ts `closeLeftRetiring`), in the log: a start of the
 * workspace's boundary under way, which the look passes over, or what still
 * runs in it ({@link busyOld}).
 */
export const sayWhyLeft = async (ids: readonly string[]): Promise<void> => {
  if (ids.length === 0) {
    return;
  }
  const seen = await snapshot();
  for (const id of ids) {
    for (const old of await readRetiring(id)) {
      const [commands, work] = await Promise.all([
        commandsIn(seen, id, old.gen),
        workProcesses(seen, id, old),
      ]);
      const why = starting.has(id)
        ? "a start of its boundary is under way"
        : `commands ${commands.join(", ") || "none"}, processes ${work.join(", ") || "none"} run in it`;
      console.info(
        `[workspace] ${id}: its older boundary ${old.pid} (form ${old.form ?? "none"}) stays up past the start-up pass: ${why}`
      );
    }
  }
};

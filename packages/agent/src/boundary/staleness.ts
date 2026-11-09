import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { snapshot } from "./place-guard";
import { commandsIn, workProcesses } from "./processes";
import { isStarting, readRetiring } from "./state";
import { lookAtOlder } from "./unasked";

/** How often the boundaries of an older form are looked at. */
const STALE_LOOK_MS = 5000;

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
      const why = isStarting(id)
        ? "a start of its boundary is under way"
        : `commands ${commands.join(", ") || "none"}, processes ${work.join(", ") || "none"} run in it`;
      console.info(
        `[workspace] ${id}: its older boundary ${old.pid} (form ${old.form ?? "none"}) stays up past the start-up pass: ${why}`
      );
    }
  }
};

/**
 * The workspaces whose boundary of an older form, or on a retiring keeper,
 * is kept as it is because its work still runs (lifecycle.ts `replaceOlder`), each
 * with what it runs as last said ({@link workLeft}), said once per change,
 * and the commands running at the last look that kept it ({@link
 * drainable}). Each stays {@link stale}, looked at until the last of its
 * work ends, then handed over.
 */
export const keptRunning = new Map<
  string,
  { readonly said: string; readonly commands: readonly number[] }
>();

let staleTimer: ReturnType<typeof setInterval> | undefined;

/** Replaces workspace `ref`'s boundary once nothing runs in it ({@link stubbed}). */
export const restartWhenIdle = (ref: WorkspaceRef): void => {
  if (!stubbed.has(ref.id)) {
    stubbed.set(ref.id, { ref, commands: [] });
  }
  lookSoon();
};

export const forgetStubbed = (id: string): void => {
  stubbed.delete(id);
  stopLooking();
};

/** The look at the older boundaries under way ({@link lookAtStale}): one at a time. */
export let staleLook: Promise<void> | undefined;

/** A look at the older boundaries: the one under way, or one begun now. Never throws: what fails is said. */
export const lookOnce = (): Promise<void> => {
  staleLook ??= lookAtOlder()
    .catch((error: unknown) => {
      console.warn(
        `[workspace] the older boundaries could not be looked at: ${error instanceof Error ? error.message : String(error)}`
      );
    })
    .finally(() => {
      staleLook = undefined;
    });
  return staleLook;
};

/** Looks at the older boundaries each {@link STALE_LOOK_MS} while there are any ({@link lookAtStale}). */
const lookSoon = (): void => {
  if (staleTimer) {
    return;
  }
  staleTimer = setInterval(() => {
    if (!staleLook) {
      lookOnce();
    }
  }, STALE_LOOK_MS);
  staleTimer.unref();
};

/** Hands workspace `ref`'s boundary, of an older form, over at the next look. */
export const replaceSoon = (ref: WorkspaceRef): void => {
  stale.set(ref.id, ref);
  lookSoon();
};

/** Closes workspace `id`'s older boundaries as nothing runs in each any more. */
export const closeWhenIdle = (id: string): void => {
  retiring.add(id);
  lookSoon();
};

const stopLooking = (): void => {
  if (
    stale.size === 0 &&
    retiring.size === 0 &&
    stubbed.size === 0 &&
    staleTimer
  ) {
    clearInterval(staleTimer);
    staleTimer = undefined;
  }
};

export const forgetStale = (id: string): void => {
  stale.delete(id);
  keptRunning.delete(id);
  stopLooking();
};

export const forgetRetiring = (id: string): void => {
  retiring.delete(id);
  stopLooking();
};

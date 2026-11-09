/**
 * Which boundaries are stale or stubbed, and the words for what they leave
 * running.
 */

import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { snapshot } from "./place-guard";
import { commandsIn, workProcesses } from "./processes";
import { isStarting, readRetiring, type UnaskedCalls } from "./state";

/** How often the boundaries of an older form are looked at. */
const STALE_LOOK_MS = 5000;

/** The workspaces whose boundary is of an older form, to hand over. */
const stale = new Map<string, WorkspaceRef>();

/** Whether workspace `id`'s boundary waits to be handed over ({@link stale}). */
export const isStale = (id: string): boolean => stale.has(id);

/** The workspaces whose boundary waits to be handed over, now. */
export const staleNow = (): WorkspaceRef[] => [...stale.values()];

/** The workspaces with an older boundary still running beside the current one. */
const retiring = new Set<string>();

/** The workspaces with an older boundary still beside the current one, now. */
export const retiringNow = (): string[] => [...retiring];

/**
 * The workspaces whose running sandbox holds an srt mount point, a file,
 * where a dir stands in (`stand-ins.ts`): left by a sandbox started before
 * the stand-ins, or covered again by one started beside it. Unlinking it on
 * the host would drop the deny inside that sandbox, so the boundary is
 * replaced once nothing runs in it, and its new host makes the dir. Each
 * with the commands running at the last look that left it as it is
 * (processes.ts `drainable`).
 */
const stubbed = new Map<
  string,
  { readonly ref: WorkspaceRef; commands: readonly number[] }
>();

/** One of the workspaces {@link stubbed} holds, as a look reads it. */
export interface StubbedWorkspace {
  readonly commands: readonly number[];
  readonly ref: WorkspaceRef;
}

/** Whether workspace `id` waits for its boundary to be replaced ({@link stubbed}). */
export const isStubbed = (id: string): boolean => stubbed.has(id);

/** The workspaces waiting for their boundary to be replaced, now. */
export const stubbedNow = (): StubbedWorkspace[] => [...stubbed.values()];

/** The commands running at the last look that left `entry` as it is, as long as `entry` is still the one waiting. */
export const noteStubbedCommands = (
  entry: StubbedWorkspace,
  commands: readonly number[]
): void => {
  const waiting = stubbed.get(entry.ref.id);
  if (waiting === entry) {
    waiting.commands = commands;
  }
};

/**
 * Why the start-up pass left each older boundary of workspaces `ids`
 * running (control.ts `closeLeftRetiring`), in the log: a start of the
 * workspace's boundary under way, which the look passes over, or what still
 * runs in it (processes.ts `busyOld`).
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

/** What keeps a boundary of an older form, or on a retiring keeper, as it is ({@link keptRunning}). */
export interface KeptRunning {
  readonly commands: readonly number[];
  readonly said: string;
}

/**
 * The workspaces whose boundary of an older form, or on a retiring keeper,
 * is kept as it is because its work still runs (ensure.ts `replaceOlder`), each
 * with what it runs as last said (narrowing.ts `workLeft`), said once per change,
 * and the commands running at the last look that kept it (processes.ts `drainable`). Each stays {@link stale}, looked at until the last of its
 * work ends, then handed over.
 */
const keptRunning = new Map<string, KeptRunning>();

/** What is kept running in workspace `id`'s boundary, if it is kept ({@link keptRunning}). */
export const keptRunningOf = (id: string): KeptRunning | undefined =>
  keptRunning.get(id);

/** Records why workspace `id`'s boundary is kept as it is ({@link keptRunning}). */
export const markKeptRunning = (id: string, kept: KeptRunning): void => {
  keptRunning.set(id, kept);
};

let staleTimer: ReturnType<typeof setInterval> | undefined;

/** Puts workspace `ref` among the waiting to be replaced ({@link stubbed}). */
const markStubbed = (ref: WorkspaceRef): void => {
  if (!stubbed.has(ref.id)) {
    stubbed.set(ref.id, { ref, commands: [] });
  }
};

/** Puts workspace `ref` among the waiting to be handed over ({@link stale}). */
const markStale = (ref: WorkspaceRef): void => {
  stale.set(ref.id, ref);
};

/** Puts workspace `id` among those whose older boundaries close as nothing runs in each ({@link retiring}). */
const markRetiring = (id: string): void => {
  retiring.add(id);
};

/** Replaces workspace `ref`'s boundary once nothing runs in it ({@link stubbed}). */
export const restartWhenIdle = (
  ref: WorkspaceRef,
  unasked: UnaskedCalls
): void => {
  markStubbed(ref);
  lookSoon(unasked);
};

export const forgetStubbed = (id: string): void => {
  stubbed.delete(id);
  stopLooking();
};

/** The look at the older boundaries under way (stale-look.ts `lookAtStale`): one at a time. */
let staleLook: Promise<void> | undefined;

/** The look at the older boundaries under way, if any. */
export const lookUnderWay = (): Promise<void> | undefined => staleLook;

/** A look at the older boundaries: the one under way, or one begun now. Never throws: what fails is said. */
export const lookOnce = (unasked: UnaskedCalls): Promise<void> => {
  staleLook ??= sayingWhatFails(unasked).finally(() => {
    staleLook = undefined;
  });
  return staleLook;
};

/** One look at the older boundaries, what fails said: an `async` function, so nothing it runs can throw past the timer that called it. */
const sayingWhatFails = async (unasked: UnaskedCalls): Promise<void> => {
  try {
    await unasked.lookAtOlder();
  } catch (error) {
    console.warn(
      `[workspace] the older boundaries could not be looked at: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Runs `look` each {@link STALE_LOOK_MS} while any workspace is waiting; the
 * last to leave ends it ({@link stopLooking}). This file holds the timer's
 * handle because stop.ts `stopNow` calls the forget functions below, and
 * stop.ts sits under what `look` ends up calling: the look itself is passed.
 */
const lookEvery = (look: () => void): void => {
  if (staleTimer) {
    return;
  }
  staleTimer = setInterval(look, STALE_LOOK_MS);
  staleTimer.unref();
};

/** Looks at the older boundaries each {@link STALE_LOOK_MS} while there are any (`unasked.lookAtOlder`). */
const lookSoon = (unasked: UnaskedCalls): void =>
  lookEvery(() => {
    if (!staleLook) {
      lookOnce(unasked);
    }
  });

/** Hands workspace `ref`'s boundary, of an older form, over at the next look. */
export const replaceSoon = (ref: WorkspaceRef, unasked: UnaskedCalls): void => {
  markStale(ref);
  lookSoon(unasked);
};

/** Closes workspace `id`'s older boundaries as nothing runs in each any more. */
export const closeWhenIdle = (id: string, unasked: UnaskedCalls): void => {
  markRetiring(id);
  lookSoon(unasked);
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

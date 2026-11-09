/**
 * The look at the older boundaries, each few seconds while there are any: each
 * boundary of an older form handed over, each older one nothing runs in closed,
 * and each one holding an srt mount point replaced once idle.
 */

import { rm } from "node:fs/promises";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { boundaryProcId, isBoundaryOf } from "../proc-id";
import { hasLeftDirs } from "../stand-ins";
import {
  behindGate,
  decided,
  ownKeeperOwed,
  reasonsOf,
  recordDecision,
} from "./decisions";
import { ensureBoundary } from "./lifecycle";
import { supersededPorts, tellStopped, workIn, workLeft } from "./narrowing";
import { type Seen, snapshot } from "./place-guard";
import {
  busyOld,
  commandsEnded,
  commandsIn,
  drainable,
  type Work,
} from "./processes";
import { sandboxes } from "./sandboxes";
import {
  forgetRetiring,
  forgetStale,
  forgetStubbed,
  keptRunning,
  retiring,
  stale,
  stubbed,
} from "./staleness";
import { start } from "./start";
import {
  type Boundary,
  type Held,
  keepers,
  readHeld,
  readRetiring,
  retiringFileOf,
  running,
  sessiond,
  starting,
} from "./state";
import { cleanGeneration, stopBoundary, stopGeneration } from "./stop";

/**
 * Closes every older boundary of workspace `id` that nothing runs in any
 * more, that is no longer running, or whose work a newer generation took
 * over ({@link supersededPorts}), with every process in it, and cleans its
 * files; one that still runs something of its own is left as it is. Answers
 * whether any is left.
 */
const closeIdle = async (seen: Seen[], id: string): Promise<boolean> => {
  const now = process.platform === "linux" ? await sandboxes(id) : [];
  let left = false;
  for (const old of await readRetiring(id)) {
    const alive = Boolean(await running(id, old));
    let closed = alive
      ? "has nothing left running in it and is closed"
      : "is gone";
    let why: "gone" | "idle" | "superseded" = alive ? "idle" : "gone";
    let taken: readonly number[] = [];
    if (alive && (await busyOld(seen, id, old))) {
      // A command still running there keeps it, whatever its work listens
      // on and whoever listens there since ({@link commandsIn}).
      const ports =
        (await commandsIn(seen, id, old.gen)).length > 0
          ? undefined
          : await supersededPorts(seen, old, now);
      if (!ports) {
        left = true;
        continue;
      }
      // What still runs there is the delegate's: it is said to it.
      const line = await tellStopped(
        id,
        `a newer boundary of this workspace listens on every port its older one's work listened on (${ports.join(", ")}), so the older one was closed`,
        await workIn(id, old)
      );
      closed = `is closed with what runs in it: a newer generation listens on every port its work listened on (${ports.join(", ")})${line ? `; said to the delegate: ${line}` : ""}`;
      why = "superseded";
      taken = ports;
    }
    await stopBoundary(id, old);
    await cleanGeneration(id, old);
    await rm(retiringFileOf(id, old), { force: true });
    console.info(
      `[workspace] ${id}: its older boundary ${old.pid} (form ${old.form ?? "none"}) ${closed}`
    );
    await recordDecision(id, {
      ...decided(old),
      decision: "older-closed",
      ports: taken,
      why,
    });
  }
  return left;
};

/**
 * Each staleness.ts `STALE_LOOK_MS`: hands over every running boundary of an older
 * form ({@link ensureBoundary}), then closes every older boundary nothing
 * runs in any more ({@link closeIdle}), reading the processes once for all
 * of them, after the handovers. A workspace leaves the first set once its
 * boundary is handed over, current, or no longer running, and the second
 * once no older boundary of it is left.
 */
export const lookAtStale = async (): Promise<void> => {
  await handOverStale();
  if (retiring.size > 0) {
    await closeRetiring();
  }
  if (stubbed.size > 0) {
    await restartStubbed();
  }
};

/**
 * Replaces each {@link stubbed} workspace's boundary when nothing runs in it:
 * no older boundary beside it, no command past its gate, nothing in its
 * sandbox but what was there when its runner was ready. As a look at a kept
 * boundary does ({@link handOverStale}): one idle, or running commands alone,
 * each new since the look before, has the gate put up first; those past it
 * are let end ({@link commandsEnded}), the next ones wait at it, and it is
 * read and replaced under the same gate ({@link restartIfIdle}), each
 * waiting command then running through the new one. A session's commands a
 * second apart would leave a look with the gate down little moment between
 * them. A command seen at the look before runs long and is waited for with
 * the gate down; so are a listener and a process a command left. A workspace
 * with no boundary running, or no such mount point left, is forgotten: its
 * next start makes the stand-in. Not while this build's keeper is owed the
 * machine's endpoint ({@link ownKeeperOwed}): the new one starts on the
 * keeper that stays.
 */
const restartStubbed = async (): Promise<void> => {
  if (await ownKeeperOwed()) {
    return;
  }
  for (const entry of [...stubbed.values()]) {
    const { ref } = entry;
    try {
      const held = await readHeld(ref.id);
      // On every keeper: the current one, and a retiring one still running one.
      const alive = (await keepers.held())
        .filter((proc) => proc.alive && isBoundaryOf(proc.procId, ref.id))
        .map((proc) => proc.procId);
      if (!held || alive.length === 0 || !(await hasLeftDirs(ref.path))) {
        forgetStubbed(ref.id);
        continue;
      }
      if (
        alive.some((procId) => procId !== boundaryProcId(ref.id, held.gen)) ||
        starting.has(ref.id)
      ) {
        // An older boundary closes first, once idle ({@link closeIdle}).
        continue;
      }
      const work = await workLeft(ref.id, held);
      if (work && !drainable(work, entry.commands)) {
        entry.commands = work.commands;
        continue;
      }
      // The wait is outside `starting`: an ensure under way meanwhile, a
      // tool call's from a command past the gate, never waits on it.
      await behindGate(ref.id, async () => {
        const past = await commandsEnded(ref.id, held.gen);
        if (past.length > 0) {
          entry.commands = past;
          return;
        }
        // Read again: what waited may have replaced it meanwhile.
        const now = await readHeld(ref.id);
        if (starting.has(ref.id) || now?.gen !== held.gen) {
          return;
        }
        const restart = restartIfIdle(ref, now);
        // An ensure meanwhile gets the boundary that runs once it settles.
        const runs = restart.then((settled) =>
          "fresh" in settled ? settled.fresh : now
        );
        // Its failure is said below; an ensure awaiting it gets it too.
        runs.catch(() => undefined);
        starting.set(ref.id, runs);
        const tried = await restart.finally(() => starting.delete(ref.id));
        if ("kept" in tried) {
          entry.commands = tried.kept.commands;
        }
      });
    } catch (error) {
      console.warn(
        `[workspace] ${ref.id}: its boundary could not be started again around its harness config yet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

/**
 * {@link restartStubbed}'s one workspace, behind the gate: its work read once
 * ({@link workLeft}: the commands past the gate, never one waiting at it, and
 * what its sandbox runs), and with none left a new boundary on the current
 * keeper, the one before stopped on whichever keeper runs it. Answers the new
 * boundary, or the work that keeps this one.
 */
const restartIfIdle = (
  ref: WorkspaceRef,
  held: Held
): Promise<{ readonly fresh: Boundary } | { readonly kept: Work }> =>
  behindGate(ref.id, async () => {
    const work = await workLeft(ref.id, held);
    if (work) {
      return { kept: work };
    }
    const stuck = await stopGeneration(ref.id, held);
    if (stuck) {
      throw new Error(stuck);
    }
    const fresh = await start(await sessiond(), ref);
    forgetStubbed(ref.id);
    console.info(
      `[workspace] ${ref.id}: its boundary ${held.pid} held an srt mount point where a dir stands in, had nothing running and is replaced by ${fresh.pid}`
    );
    await recordDecision(ref.id, {
      ...decided(held),
      decision: "replaced",
      reasons: reasonsOf({ leftDirs: true }),
      to: decided(fresh),
    });
    return { fresh };
  });

/**
 * Hands over each {@link stale} boundary that still runs. Not while this
 * build's keeper is owed the machine's endpoint ({@link ownKeeperOwed}): each
 * waits for it, so its one handover lands on the keeper that stays.
 */
const handOverStale = async (): Promise<void> => {
  if (stale.size === 0 || (await ownKeeperOwed())) {
    return;
  }
  for (const ref of [...stale.values()]) {
    if (starting.has(ref.id)) {
      continue;
    }
    try {
      const held = await readHeld(ref.id);
      if (!(held && (await running(ref.id, held)))) {
        forgetStale(ref.id);
        continue;
      }
      // One kept while its work runs (lifecycle.ts `replaceOlder`) is only looked
      // at, not ensured: an ensure is a use, and its quiet time must run.
      // A narrowing meanwhile is the narrowing look's ({@link recheckNarrowed}).
      const kept = keptRunning.get(ref.id);
      if (!kept) {
        await ensureBoundary(ref);
        continue;
      }
      const work = await workLeft(ref.id, held);
      if (work && !drainable(work, kept.commands)) {
        keptRunning.set(ref.id, { ...kept, commands: work.commands });
        continue;
      }
      // Idle, or its commands alone, each new since the look before: a
      // session's, a second apart, leave a look little moment between them,
      // and one starting while the ensure reads it again kept it (nightly
      // f4b526231, 2026-10-21: kept "while its work runs a command" for 60 s
      // after its listener stopped). So the gate goes up first: those past
      // it are let end, the next ones wait at it, and the ensure reads it
      // and hands it over under the same gate (lifecycle.ts `handOverWhenIdle`).
      // An ensure under way meanwhile, a tool call's, never waits on it.
      await behindGate(ref.id, async () => {
        const past = await commandsEnded(ref.id, held.gen);
        if (past.length > 0) {
          keptRunning.set(ref.id, { ...kept, commands: past });
          return;
        }
        await ensureBoundary(ref);
      });
    } catch (error) {
      console.warn(
        `[workspace] ${ref.id}: its older boundary could not be handed over yet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

const closeRetiring = async (): Promise<void> => {
  const seen = await snapshot();
  for (const id of [...retiring]) {
    if (starting.has(id)) {
      continue;
    }
    try {
      if (!(await closeIdle(seen, id))) {
        forgetRetiring(id);
      }
    } catch (error) {
      console.warn(
        `[workspace] ${id}: its older boundary could not be closed yet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

import { lstat, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { workspaceNeeds } from "@cawco/core/workspace-needs";
import { isPlace } from "@cawco/core/workspace-policy";
import { ensureGateToken } from "../browser/gate";
import { isGitDir } from "../git-dir";
import { ensureView, layerOf, ownModules } from "../layer";
import { boundaryProcId, isBoundaryOf } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { hasLeftDirs } from "../stand-ins";
import { armHook } from "./arm";
import {
  behindGate,
  decided,
  type NarrowCause,
  nestedSeatbelt,
  ownKeeperOwed,
  reasonsOf,
  recordDecision,
} from "./decisions";
import { liveAt } from "./holding";
import {
  keeperTakingOver,
  type Narrowed,
  narrowedCause,
  narrowedGenerations,
  tellStopped,
  unknownGrant,
  type WorkProcess,
  workIn,
  workLeft,
} from "./narrowing";
import { formMoveWords, formOf, REASONS_SAID } from "./plan";
import type { Work } from "./processes";
import { endMembers } from "./sandboxes";
import {
  closeWhenIdle,
  forgetRetiring,
  forgetStale,
  forgetStubbed,
  keptRunning,
  replaceSoon,
  restartWhenIdle,
  stale,
  stubbed,
} from "./staleness";
import { start } from "./start";
import {
  type Boundary,
  closing,
  type Held,
  keepers,
  type Retiring,
  readHeld,
  readRetiring,
  refusal,
  retiringFileOf,
  running,
  sessiond,
  starting,
  writeWhole,
} from "./state";
import { cleanGeneration, stopBoundary, stopGeneration } from "./stop";

/**
 * {@link ensureBoundary} with the hook already armed: the start-up rewrite's
 * own hand-over (arming.ts `rearmOne`). A quiet close under way finishes first
 * ({@link closeQuietly}), and this one starts the boundary again. Each ensure
 * is a use: the workspace's quiet time counts from it ({@link liveAt}).
 */
export const ensureNow = (ref: WorkspaceRef): Promise<Boundary> => {
  liveAt.set(ref.id, Date.now());
  const pending = starting.get(ref.id);
  if (pending) {
    return pending;
  }
  const started = (async () => {
    await closing.get(ref.id);
    return await ensure(ref);
  })().finally(() => {
    starting.delete(ref.id);
    liveAt.set(ref.id, Date.now());
  });
  starting.set(ref.id, started);
  return started;
};

/**
 * Refuses a boundary for a workspace whose folder is not there to hold
 * (`why`), and closes each of its boundaries still running, on every keeper,
 * with everything in them: nothing runs in a path that is gone, and a
 * handover of one (stale-look.ts `handOverStale`) or a restart (stale-look.ts
 * `restartStubbed`) is never tried again. Its records stay for its archive.
 */
const refuseGone = async (ref: WorkspaceRef, why: string): Promise<never> => {
  forgetStale(ref.id);
  forgetStubbed(ref.id);
  forgetRetiring(ref.id);
  const alive = (await keepers.held()).filter(
    (proc) => proc.alive && isBoundaryOf(proc.procId, ref.id)
  );
  await Promise.all(
    alive.map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
  );
  await endMembers(ref.id);
  if (alive.length > 0) {
    console.info(
      `[workspace] ${ref.id}: ${why}, so its boundary ${alive.map((proc) => proc.pid).join(", ")} is closed`
    );
  }
  throw refusal(ref.id, why);
};

/**
 * The folder a boundary holds, ready for it: a place, whatever folder it is
 * over, which stays as the person keeps it; or a delegate's layer of its
 * folder (layer.ts): a folder there, and on Linux its view running, which
 * the srt host then enters ({@link viewOfBoundary}). A delegate's copy that
 * held a repository and whose `.git` is no repository any more (a deleted
 * clone a sandbox refilled with stand-ins, `stand-ins.ts`) has no boundary:
 * one would stand in there again; retirement takes it away. One that is not
 * there is refused, and its boundaries closed ({@link refuseGone}).
 */
const placeReady = async (ref: WorkspaceRef): Promise<void> => {
  const place = await stat(ref.path).catch(() => undefined);
  if (!place?.isDirectory()) {
    await refuseGone(ref, `${ref.path} is not a folder`);
    return;
  }
  if (isPlace(ref.id)) {
    return;
  }
  const layer = await layerOf(ref.id, ref.path);
  if (!layer) {
    await refuseGone(ref, `${ref.path} holds no layer of a folder`);
    return;
  }
  if (layer.form === "overlay") {
    await ensureView(ref.id, layer);
    return;
  }
  const git = await lstat(join(ref.path, ".git")).catch(() => undefined);
  if (
    layer.kind === "repo" &&
    !(git && (await isGitDir(join(ref.path, ".git"))))
  ) {
    await refuseGone(
      ref,
      `${ref.path} is not a git clone any more: its .git is no repository`
    );
  }
  if (layer.modules === "linked") {
    ownModules(ref.id).catch((error: unknown) =>
      console.warn(
        `[workspace] ${ref.id}: its own clone of node_modules was not made, so it reads its folder's through the link: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
};

const ensure = async (ref: WorkspaceRef): Promise<Boundary> => {
  if (process.platform !== "linux" && process.platform !== "darwin") {
    throw refusal(
      ref.id,
      `workspace boundaries run on Linux and macOS, and this machine runs ${process.platform}`
    );
  }
  // Its walls' tools; a workspace's checkout is refused before it is cut (workspace.ts).
  const walls = workspaceNeeds(undefined, "walls");
  if (!walls.available) {
    throw refusal(ref.id, walls.reason ?? "");
  }
  const nested = process.platform === "darwin" ? nestedSeatbelt() : undefined;
  if (nested) {
    throw refusal(ref.id, nested);
  }
  await placeReady(ref);
  // Its door to the project's browser (browser/gate.ts), minted once and
  // kept in its state dir for the workspace's life.
  await ensureGateToken(ref.id);
  // Asked before the keeper is: the endpoint only ever moves on to this
  // build's keeper, so a keeper dialled after "not owed" is this build's.
  const owed = await ownKeeperOwed();
  const client = await sessiond();
  const held = await readHeld(ref.id);
  const holder = held ? await running(ref.id, held) : undefined;
  if (!(held && holder)) {
    await stopUnvouched(ref.id, held);
    return start(client, ref);
  }
  // Access is never kept past its removal: a generation that grants what the
  // workspace's policy no longer does is stopped now with what runs in it,
  // said to the delegate, whatever runs there or whichever keeper is owed
  // the endpoint ({@link replaceNarrowed}).
  const narrowed = await narrowedGenerations(ref, held);
  if (narrowed) {
    const runs = await replaceNarrowed(
      client,
      ref,
      held,
      narrowed,
      owed,
      "use"
    );
    if (narrowed.current.length > 0) {
      return runs;
    }
  }
  // One of an older form, one a retiring keeper holds, or one whose grant
  // this build cannot compare with its policy (narrowing.ts `compareGrant`) is
  // handed over to one of this build's form on the current keeper, as soon
  // as nothing runs in it.
  const unknown = await unknownGrant(ref, held);
  if (unknown && saidUnknown.get(ref.id) !== held.pid) {
    saidUnknown.set(ref.id, held.pid);
    console.info(
      `[workspace] ${ref.id}: its boundary ${held.pid}'s grant cannot be compared with this build's policy (${unknown}), so it is not stopped as narrowed: it is kept as it is while its work runs, and handed over once that ends`
    );
  }
  if (
    unknown ||
    held.form !== (await formOf(ref)) ||
    holder.epoch !== client.epoch
  ) {
    return replaceOlder(client, ref, held, owed, unknown);
  }
  forgetStale(ref.id);
  // Written again each time: one an earlier agent started may have no hook
  // yet, or one that reaches cawco another way.
  return armHook(ref.id, held);
};

const replaceOlder = async (
  client: SessiondClient,
  ref: WorkspaceRef,
  held: Held,
  owed: boolean,
  grant: string | undefined
): Promise<Boundary> => {
  if (owed) {
    // The keeper the endpoint names now retires as soon as this build's
    // takes the endpoint: the boundary runs on as it is, armed, and is
    // handed over once, at the first look after this build's keeper is
    // the machine's (stale-look.ts `handOverStale`).
    if (!stale.has(ref.id)) {
      console.info(
        `[workspace] ${ref.id}: its boundary ${held.pid} (form ${held.form ?? "none"}) is handed over once this build's session keeper is the machine's`
      );
      await recordDecision(ref.id, {
        ...decided(held),
        decision: "kept",
        reasons: reasonsOf({ grant: grant ?? null, keeperOwed: true }),
        to: null,
      });
    }
    replaceSoon(ref);
    return armHook(ref.id, held);
  }
  if (process.platform === "linux" && (await hasLeftDirs(ref.path))) {
    // A boundary started beside it would bind the same mount point and
    // keep it; this one is replaced whole once nothing runs in it.
    forgetStale(ref.id);
    if (!stubbed.has(ref.id)) {
      await recordDecision(ref.id, {
        ...decided(held),
        decision: "kept",
        reasons: reasonsOf({ grant: grant ?? null, leftDirs: true }),
        to: null,
      });
    }
    restartWhenIdle(ref);
    return armHook(ref.id, held);
  }
  // Every command after a handover runs in the new sandbox: its own pid
  // namespace, where nothing the work left running in this one can be seen
  // or signalled, and its own network, where nothing listens. A dev server
  // answered its previews but never its own next curl (5be5bfbb, 2026-10-15:
  // its server on 5222 "gone" at each turn after a handover), and a `setsid
  // nohup` loop was "gone" at the next turn (9b87c52b, 2026-10-19). So a
  // boundary whose work runs anything is kept as it is, armed, and handed
  // over at the first look after the last of it ends ({@link
  // handOverStale}); one nothing holds closes once quiet ({@link
  // sweepQuiet}), with what runs in it, and its next start is of this form.
  // Whether it is idle is read again behind the gate, and the handover
  // follows under the same gate ({@link handOverWhenIdle}): read with the
  // gate down, a command could start between an idle reading and the
  // handover (nightly f4b526231, 2026-10-21: twice an idle look, then "kept
  // as it is while its work runs a command (executor 6824)").
  const found = await workLeft(ref.id, held);
  const tried = found
    ? { kept: found }
    : await handOverWhenIdle(client, ref, held, grant);
  if ("fresh" in tried) {
    forgetStale(ref.id);
    return tried.fresh;
  }
  const work = tried.kept;
  replaceSoon(ref);
  if (keptRunning.get(ref.id)?.said !== work.words) {
    console.info(
      `[workspace] ${ref.id}: its boundary ${held.pid} (form ${held.form ?? "none"}) is kept as it is while its work ${work.words}, and handed over once that ends${await formMoveWords(ref, held)}`
    );
    await recordDecision(ref.id, {
      ...decided(held),
      decision: "kept",
      reasons: reasonsOf({
        commands: work.commands,
        grant: grant ?? null,
        listening: work.ports,
        processes: work.processes,
      }),
      to: null,
    });
  }
  keptRunning.set(ref.id, { said: work.words, commands: work.commands });
  return armHook(ref.id, held);
};

/**
 * Stops what this machine can no longer vouch for before a boundary starts,
 * never joining it: the boundary `held` names, which is no longer running as
 * it was started, and any other boundary process of the workspace that no
 * record names, on every keeper, each with everything it started. An older
 * boundary still running beside it is left alone, with everything in it
 * ({@link handOver}).
 */
const stopUnvouched = async (
  id: string,
  held: Held | undefined
): Promise<void> => {
  const older = await readRetiring(id);
  const kept = new Set(older.map((old) => boundaryProcId(id, old.gen)));
  const recorded =
    held && (await keepers.holding(boundaryProcId(id, held.gen)));
  if (held) {
    await stopBoundary(id, held);
    await cleanGeneration(id, held);
  }
  const unrecorded = (await keepers.held()).filter(
    (proc) =>
      proc.alive && isBoundaryOf(proc.procId, id) && !kept.has(proc.procId)
  );
  await Promise.all(
    unrecorded.map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
  );
  const ended = [
    ...(recorded
      ? [
          `${recorded.procId} (pid ${recorded.pid}, its record naming pid ${held?.pid})`,
        ]
      : []),
    ...unrecorded.map((proc) => `${proc.procId} (pid ${proc.pid}, no record)`),
  ];
  if (ended.length > 0) {
    console.info(
      `[workspace] ${id}: before a boundary starts, what it cannot vouch for is killed: ${ended.join(", ")}`
    );
  }
  await endMembers(
    id,
    older.map((old) => old.gen)
  );
};

/**
 * Hands workspace `ref`'s boundary `held`, of an older form or on a retiring
 * keeper, over to one of this build's form ({@link handOver}) if nothing runs
 * in it, decided and done behind one gate ({@link behindGate}): its work is
 * read once with the gate up ({@link workLeft}), and with none left it is
 * handed over under the same gate, so no command starts in it between that
 * reading and the handover; each command that arrived meanwhile waits at the
 * gate and runs through the new one. Answers the new boundary, or the work
 * that keeps this one: a command running, a listener, a process a command
 * left. `grant` is why its grant is not comparable, if that is why.
 */
const handOverWhenIdle = (
  client: SessiondClient,
  ref: WorkspaceRef,
  held: Held,
  grant: string | undefined
): Promise<{ readonly fresh: Boundary } | { readonly kept: Work }> =>
  behindGate(ref.id, async () => {
    const work = await workLeft(ref.id, held);
    return work
      ? { kept: work }
      : { fresh: await handOver(client, ref, held, grant) };
  });

/**
 * Stops every generation of workspace `ref` whose access the workspace's
 * policy has narrowed since it started (`narrowed`, narrowing.ts `narrowing`), now,
 * as stale-look.ts `restartIfIdle` stops one: the gate goes up, each is stopped with
 * everything in it, and, when the current one `held` was, a boundary of the
 * policy as it stands starts, on the keeper taking over when one is owed the
 * endpoint ({@link keeperTakingOver}). What their work still ran is said,
 * each process by its command and the pid its commands saw: in the agent's
 * log, and as a line the delegate's next command shows ({@link noticeOf}),
 * so it can start it again. Nothing it ran is lost silently, and no access
 * outlives its removal. Said in the log and recorded ({@link
 * recordDecision}) with `cause`, what looked. Answers the boundary that runs.
 */
export const replaceNarrowed = async (
  client: SessiondClient,
  ref: WorkspaceRef,
  held: Held,
  narrowed: Narrowed,
  owed: boolean,
  cause: NarrowCause
): Promise<Boundary> =>
  behindGate(ref.id, async () => {
    const stopping: Held[] = [
      ...(narrowed.current.length > 0 ? [held] : []),
      ...narrowed.older.map((one) => one.boundary),
    ];
    const why = [
      ...new Set([
        ...narrowed.current,
        ...narrowed.older.flatMap((one) => one.why),
      ]),
    ];
    const stopped: WorkProcess[] = [];
    for (const boundary of stopping) {
      stopped.push(...(await workIn(ref.id, boundary)));
      const stuck = await stopGeneration(ref.id, boundary);
      if (stuck) {
        throw new Error(stuck);
      }
      await rm(retiringFileOf(ref.id, boundary), { force: true });
    }
    const runs =
      narrowed.current.length > 0
        ? await (async () => {
            forgetStale(ref.id);
            return start(await keeperTakingOver(client, owed), ref);
          })()
        : await armHook(ref.id, held);
    const line = await tellStopped(ref.id, narrowedCause(why), stopped);
    console.info(
      `[workspace] ${ref.id}: its boundary ${stopping.map((one) => one.pid).join(", ")} (form ${held.form ?? "none"}) is stopped now, as its access narrowed, and ${runs.pid} runs: ${line ?? `nothing ran in it (${why.slice(0, REASONS_SAID).join("; ")})`}`
    );
    await recordDecision(ref.id, {
      cause,
      decision: "narrowed-stopped",
      narrowed: why,
      runs: decided(runs),
      stopped: stopping.map(decided),
      work: stopped.map((one) => one.pid),
    });
    return runs;
  });

/**
 * Hands workspace `ref`'s boundary `old`, of an older form, over to a new
 * one of this build's form, started beside it, behind the gate its caller
 * holds ({@link handOverWhenIdle}): an executor on its way in waits and then
 * runs through the new one. The older one is recorded before the new one
 * replaces its record, so no agent loses it, and runs on untouched with every
 * process in it; it closes once nothing runs in it (stale-look.ts `closeIdle`). Said
 * in the log and recorded ({@link recordDecision}), with `grant`, why its
 * grant was not comparable, if that is why.
 */
const handOver = async (
  client: SessiondClient,
  ref: WorkspaceRef,
  old: Held,
  grant: string | undefined
): Promise<Boundary> => {
  const record = retiringFileOf(ref.id, old);
  const kept: Retiring = old;
  const moved = await formMoveWords(ref, old);
  await writeWhole(record, `${JSON.stringify(kept)}\n`, 0o644);
  const fresh = await start(client, ref).catch(async (error: unknown) => {
    await rm(record, { force: true });
    throw error;
  });
  console.info(
    `[workspace] ${ref.id}: its boundary ${old.pid} (form ${old.form ?? "none"}) is handed over to ${fresh.pid}; it closes once nothing runs in it${moved}`
  );
  await recordDecision(ref.id, {
    ...decided(old),
    decision: "handed-over",
    reasons: reasonsOf({ grant: grant ?? null }),
    to: decided(fresh),
  });
  closeWhenIdle(ref.id);
  return fresh;
};

/** The boundary each workspace's unknown grant was last said for ({@link ensure}): said once per boundary. */
const saidUnknown = new Map<string, number>();

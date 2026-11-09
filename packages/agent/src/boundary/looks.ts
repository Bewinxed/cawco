/**
 * The boundary's periodic looks: the narrowing look after a policy change, and
 * the quiet sweep that closes a boundary nothing holds.
 */

import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  workspaceProjectFile,
  workspacesDir,
} from "@cawco/core/paths/workspace";
import { commandLines } from "@cawco/core/process-identity";
import { isDamagedRecord, readRecord } from "@cawco/core/state-file";
import { until } from "@cawco/core/until";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { isPlace } from "@cawco/core/workspace-policy";
import { z } from "zod";
import { closeGithubDoor } from "../github-door";
import { closeGitDoor } from "../hub-git";
import type { HeldProc } from "../keepers";
import { isBoundaryOf, isJudgeOf, judgeProcId } from "../proc-id";
import { closeToolDoor } from "../tool-door";
import { armState, ensureBoundary, rearming } from "./arming";
import {
  behindGate,
  decided,
  type NarrowCause,
  ownKeeperOwed,
  recordDecision,
} from "./decisions";
import { ensureNow, replaceNarrowed } from "./ensure";
import {
  type BoundaryHolders,
  commandsNow,
  inUse,
  type LiveFacts,
  liveAt,
  liveWhy,
  recentlyHeld,
} from "./holding";
import {
  JUDGE_SOCKET,
  type JudgeAnswer,
  judgeAnswer,
  judgeBuildOf,
  judgeScripts,
} from "./hook-judge";
import { settling } from "./judge-process";
import {
  NARROW_CAUSE_WORDS,
  NARROW_LOOK_MS,
  narrowedGenerations,
} from "./narrowing";
import { type Seen, snapshot } from "./place-guard";
import { formNow, movedParts, SYNCED_PART } from "./plan";
import { busyOld, executors, lookAtPreTag, QUIET_SWEEP_MS } from "./processes";
import { endMembers } from "./sandboxes";
import { forgetRetiring, forgetStale, forgetStubbed, stale } from "./staleness";
import {
  closeEnded,
  closeUnderWay,
  holding,
  isClosing,
  isStarting,
  keepers,
  markClosing,
  markStarting,
  readHeld,
  readRetiring,
  retiringFileOf,
  STOP_TIMEOUT_MS,
  sessiond,
  startEnded,
  stateDir,
  writeWhole,
} from "./state";
import { cleanGeneration, endUsers, stopBoundary } from "./stop";
import { cloneLooks, hubLive } from "./watch";

/**
 * Keeps `project` as the project workspace `id`'s work belongs to
 * ({@link workspaceProjectFile}): its policy reads that project's folder on
 * the hub's machine. Written only when it changes, so the boundary's form
 * changes only then.
 */
export const setProject = async (
  id: string,
  project: string
): Promise<void> => {
  const file = workspaceProjectFile(id);
  // A damaged record is written over with the project the hub names now.
  const kept = await readRecord(file, z.unknown()).catch((error: unknown) => {
    if (!isDamagedRecord(error)) {
      throw error;
    }
  });
  if (kept === project) {
    return;
  }
  await mkdir(stateDir(id), { recursive: true });
  await writeWhole(file, `${JSON.stringify(project)}\n`, 0o644);
  // Another project's folder: the one before is no longer read, now.
  if (kept !== undefined) {
    recheckNarrowed("project", [id]).catch(() => undefined);
  }
};

/** Each workspace's narrowing check under way, and whether another was asked meanwhile ({@link recheckNarrowed}). */
let narrowLook: Promise<void> | undefined;

let narrowAgain: { readonly cause: NarrowCause } | undefined;

/**
 * Checks the running boundaries for a narrowed access now (narrowing.ts `narrowing`),
 * and stops each generation whose access narrowed, its current boundary
 * replaced ({@link replaceNarrowed}), as a start of its own (an ensure under
 * way checks for itself, and a close under way ends it): every workspace with
 * a boundary running on any keeper, or only `ids`. One check at a time; one
 * asked meanwhile runs once it ends. Never rejects.
 *
 * THE LIST of what a workspace's policy reads (core workspace-policy.ts
 * `workspacePolicy`) and what says each changed, so its boundaries are
 * checked for a narrowed access ({@link recheckNarrowed}) at once:
 *
 * - its accounts (`accounts.json`) and its sessions' spill folders
 *   (`spills.json`), which only grow: written by {@link boundaryFor} and the
 *   workspace's create, each followed by an ensure, which checks
 *   ({@link ensure});
 * - its project (`project.json`): a change of it checks at once
 *   ({@link setProject}, written by those and a browser door's);
 * - its project's folder on the hub (`projectFolder`): moved away only by
 *   the hub (a project's delete or merge), which then syncs every machine's
 *   fleet config; the delta's `recheck` checks (session.ts `FLEET_DELTA`);
 * - what the fleet sync writes (`fleetSyncedPaths`, the user layer under
 *   Claude Code's home): the sync checks;
 * - this machine's accounts and the credential stores they make
 *   (`accountLayers`' config dirs, `credentialStores`): an account's sign-in
 *   or removal checks ({@link accountsChangedHere});
 * - this build (`binaryRoot`, the form): the agent's start re-arms every
 *   boundary in use, through an ensure ({@link rearmHooks});
 * - the clone's alternates, the toolchains under home (`homeToolchains`),
 *   Xcode's developer dir, a place's own files (`ownerOnlyIn`, `linkedIn`,
 *   `protectedIn`) and every link a path resolves through: no event says
 *   these, and no file watch is kept for them (a watch per workspace is what
 *   fseventsd's memory went to); the boundaries in use are looked at for
 *   them each {@link NARROW_LOOK_MS} ({@link lookForNarrowing}).
 *
 * What is fixed for a workspace's life (its clone, state and scratch dirs,
 * doors, caches, the gitconfig, the host's tool caches, Linux's host-private
 * paths) needs none.
 */
export const recheckNarrowed = (
  cause: NarrowCause,
  ids?: readonly string[]
): Promise<void> => {
  if (narrowLook) {
    narrowAgain = { cause };
    return narrowLook;
  }
  narrowLook = recheckNow(cause, ids)
    .catch((error: unknown) => {
      console.warn(
        `[workspace] the boundaries could not be checked for a narrowed access (${NARROW_CAUSE_WORDS[cause]}): ${error instanceof Error ? error.message : String(error)}`
      );
    })
    .finally(() => {
      narrowLook = undefined;
      const again = narrowAgain;
      narrowAgain = undefined;
      if (again) {
        recheckNarrowed(again.cause).catch(() => undefined);
      }
    });
  return narrowLook;
};

/** {@link recheckNarrowed}'s check itself. */
const recheckNow = async (
  cause: NarrowCause,
  ids?: readonly string[]
): Promise<void> => {
  const procs = (await keepers.held()).filter((proc) => proc.alive);
  const runningIds = (
    ids ?? (await readdir(workspacesDir()).catch(() => [] as string[]))
  ).filter((id) => procs.some((proc) => isBoundaryOf(proc.procId, id)));
  for (const id of runningIds) {
    if (isStarting(id) || isClosing(id)) {
      continue;
    }
    const held = await readHeld(id).catch(() => undefined);
    if (!held) {
      continue;
    }
    const ref = { id, path: held.path };
    const narrowed = await narrowedGenerations(ref, held).catch(
      () => undefined
    );
    if (!narrowed || isStarting(id) || isClosing(id)) {
      continue;
    }
    console.info(
      `[workspace] ${id}: its access narrowed (${NARROW_CAUSE_WORDS[cause]}), so its narrowed boundaries are stopped now`
    );
    const replaced = (async () =>
      replaceNarrowed(
        await sessiond(),
        ref,
        held,
        narrowed,
        await ownKeeperOwed(),
        cause
      ))();
    markStarting(id, replaced);
    await replaced
      .catch((error: unknown) => {
        console.warn(
          `[workspace] ${id}: its narrowed boundary could not be replaced: ${error instanceof Error ? error.message : String(error)}`
        );
      })
      .finally(() => startEnded(id));
  }
};

/**
 * The workspaces whose boundary is in use: a session attached, a live work
 * item, a preview, a command, or work running in it ({@link liveWhy},
 * {@link workLeft}); every running one while the hub has not said which
 * items are live.
 */
const inUseNow = async (): Promise<string[]> => {
  const procs = (await keepers.held()).filter((proc) => proc.alive);
  const ids = (await readdir(workspacesDir()).catch(() => [] as string[]))
    .filter((id) => procs.some((proc) => isBoundaryOf(proc.procId, id)))
    .filter((id) => !(isStarting(id) || isClosing(id)));
  const facts = await liveFacts(procs);
  if (!facts) {
    return ids;
  }
  // The process table, read once and only for a boundary nothing holds.
  let seen: Seen[] | undefined;
  const used: string[] = [];
  for (const id of ids) {
    const held = await readHeld(id).catch(() => undefined);
    if (!held) {
      continue;
    }
    if (liveWhy(id, held.path, facts)) {
      used.push(id);
      continue;
    }
    seen ??= await snapshot();
    if (await busyOld(seen, id, held)) {
      used.push(id);
    }
  }
  return used;
};

/**
 * Each boundary in use whose form's part the fleet sync writes moved since
 * it started ({@link SYNCED_PART}, fleet-converged.ts `syncedHeld`), handed over to one
 * of the form now as soon as nothing runs in it ({@link ensure}'s
 * lifecycle.ts `replaceOlder`), so a session's next command, hook or server start
 * runs in it: after a fleet sync made a path a boundary reads (the fleet's
 * hook scripts), a session started before it reaches what it holds. A sync
 * that moved nothing a boundary reads moves no form part of its own, and
 * nothing is handed over for it: a form that moved otherwise (a build, the
 * workspace's policy) is the boundary's next use's to take ({@link ensure}),
 * and one already waiting for its work to end ({@link stale}) is handed over
 * by the look that waits (lifecycle.ts `handOverStale`). One started by a build
 * that kept no parts is its next use's too. One not in use takes the form
 * now at its next ensure.
 */
export const rearmMoved = async (why: string): Promise<void> => {
  for (const id of await inUseNow()) {
    if (stale.has(id)) {
      continue;
    }
    const held = await readHeld(id).catch(() => undefined);
    if (!held?.parts) {
      continue;
    }
    const ref = { id, path: held.path };
    const now = await formNow(ref);
    if (
      held.form === now.form ||
      held.parts[SYNCED_PART] === now.parts[SYNCED_PART]
    ) {
      continue;
    }
    console.info(
      `[workspace] ${id}: its boundary's form moved (${why}: ${movedParts(held.parts, now.parts).join(", ")}), so it is handed over once nothing runs in it`
    );
    await ensureBoundary(ref).catch((error: unknown) => {
      console.warn(
        `[workspace] ${id}: its boundary was not handed over to its new form: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }
};

/** A machine's accounts changed (a sign-in, an account removed): every running boundary is checked for a narrowed access. */
export const accountsChangedHere = (): void => {
  recheckNarrowed("accounts").catch(() => undefined);
};

let narrowTimer: ReturnType<typeof setInterval> | undefined;

/** Looks at the boundaries in use for a narrowed access each {@link NARROW_LOOK_MS} ({@link recheckNarrowed}'s list, its last item). */
const lookForNarrowing = (): void => {
  if (narrowTimer) {
    return;
  }
  narrowTimer = setInterval(() => {
    if (narrowLook) {
      return;
    }
    inUseNow()
      .then((ids) =>
        ids.length > 0 ? recheckNarrowed("look", ids) : undefined
      )
      .catch((error: unknown) => {
        console.warn(
          `[workspace] the boundaries in use could not be looked at for a narrowed access: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }, NARROW_LOOK_MS);
  narrowTimer.unref();
};

let holders: BoundaryHolders | undefined;

/**
 * {@link LiveFacts} as they stand now; none while the hub has not said which
 * work items are live or the daemon has not handed in its holders.
 */
export const liveFacts = async (
  procs: readonly HeldProc[]
): Promise<LiveFacts | undefined> => {
  if (!(hubLive && holders)) {
    return;
  }
  return {
    commands: await commandsNow(),
    hub: hubLive,
    previews: new Set(holders.previews()),
    procs,
    sessions: new Set(holders.sessions()),
  };
};

/**
 * Closes workspace `id`'s boundaries, every generation on every keeper, with
 * everything in them, and its judges and doors, as nothing holds it any more:
 * its clone, state dir, scratch dir, policy, hook and executor stay. Its
 * record goes (`boundary.json`), so a judge's exit arms nothing again
 * (lifecycle.ts `watchJudge`) and its executor, until the next start, says the
 * boundary is not running. Its next {@link ensureBoundary} (a session's
 * spawn or wake, the hub's land or check) starts a new
 * one and arms it. The gate is up while it closes, and an executor already on
 * its way in leaves the boundary as it is. Never rejects.
 */
export const closeQuietly = (id: string, why: string): Promise<void> => {
  const pending = closeUnderWay(id);
  if (pending) {
    return pending;
  }
  const work = closeNow(id, why)
    .catch((error: unknown) => {
      console.warn(
        `[workspace] ${id}: its boundary could not be closed: ${error instanceof Error ? error.message : String(error)}`
      );
    })
    .finally(() => {
      closeEnded(id, work);
    });
  markClosing(id, work);
  return work;
};

/** {@link closeQuietly}'s close itself. */
const closeNow = async (id: string, why: string): Promise<void> => {
  const held = await readHeld(id).catch(() => undefined);
  if (!held) {
    return;
  }
  await behindGate(id, async () => {
    if (executors(await commandLines(), id).length > 0) {
      liveAt.set(id, Date.now());
      return;
    }
    forgetStale(id);
    forgetRetiring(id);
    forgetStubbed(id);
    const boundaries = [held, ...(await readRetiring(id))];
    for (const boundary of boundaries) {
      await stopBoundary(id, boundary);
      await cleanGeneration(id, boundary);
      await rm(retiringFileOf(id, boundary), { force: true });
    }
    const left = (await keepers.held()).filter(
      (proc) => proc.alive && isBoundaryOf(proc.procId, id)
    );
    await Promise.all(
      left.map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
    );
    await endMembers(id);
    await rm(join(stateDir(id), "boundary.json"), { force: true });
    await closeToolDoor(id);
    await closeGitDoor(id);
    await closeGithubDoor(id);
    const judges = (await keepers.held()).filter(
      (proc) => proc.alive && isJudgeOf(proc.procId, id)
    );
    await Promise.all(
      judges.map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
    );
    liveAt.delete(id);
    console.info(
      `[workspace] ${id}: nothing holds it (no session attached, no live work item, no preview, no command) and ${why}, so its boundary ${boundaries.map((boundary) => boundary.pid).join(", ")} and its ${judges.length} judge(s) are closed; its clone and state stay, and its next command starts it again`
    );
    await recordDecision(id, {
      closed: boundaries.map(decided),
      decision: "quiet-closed",
      judges: judges.length,
      why,
    });
  });
};

/**
 * Closes every boundary nothing has held for holding.ts `QUIET_CLOSE_MS`
 * ({@link liveWhy}), one listing of the keepers and one of the machine's
 * processes for all of them. Nothing closes until the hub has said which work
 * items are live.
 */
const sweepQuiet = async (): Promise<void> => {
  const procs = (await keepers.held()).filter((proc) => proc.alive);
  const ids = (await readdir(workspacesDir()).catch(() => [] as string[]))
    .filter((id) => procs.some((proc) => isBoundaryOf(proc.procId, id)))
    .filter((id) => !isClosing(id));
  if (ids.length === 0) {
    return;
  }
  const facts = await liveFacts(procs);
  if (!facts) {
    return;
  }
  const now = Date.now();
  for (const id of ids) {
    const held = await readHeld(id).catch(() => undefined);
    if (!held || liveWhy(id, held.path, facts)) {
      liveAt.set(id, now);
      continue;
    }
    const since = liveAt.get(id);
    if (since === undefined) {
      liveAt.set(id, now);
      continue;
    }
    if (!(recentlyHeld(id) || isStarting(id))) {
      await closeQuietly(
        id,
        `it has been quiet for ${Math.round((now - since) / 60_000)} min`
      );
    }
  }
};

/**
 * Law `live-workspace-judge-answers` (core invariant.ts), on boundary/'s
 * beat ({@link watchQuietBoundaries}): every workspace a session's process
 * runs in or a command is on its way into ({@link inUse}) has its hook name a
 * judge that answers as this build's ({@link judgeBuildOf}). Its hook is
 * read on every call that process makes, and a judge that is gone, or of
 * another build, refuses or misjudges each one. A workspace between states
 * ({@link settling}) is looked at on the next beat; so is every workspace
 * while the start-up reading is not whole (blocked is its own named state,
 * lifecycle.ts `ArmingBlocked`), and the start's arming is waited out first.
 *
 * Born red, once: dad89261b^ (the start before it revived a workspace a CLI
 * runs in with no boundary), with this check laid on, a keeper holding a
 * process in workspace red-c-ws's clone, no boundary, and a hook naming a
 * judge that is gone. The start left it "with none are armed when a session
 * there starts", and the beat exited 70: "[law] Law broken:
 * live-workspace-judge-answers. Every workspace a session's process runs in
 * has a judge of this build answering its hook. Workspace red-c-ws has a
 * session's process or a command in it, and its hook's judge at
 * …/red2/c/run/gone.sock answered "nothing (connect ENOENT …)", not this
 * build's judge (0fc17cf98658ab74)." A judge of this build, asked, answered
 * "0\n0fc17cf98658ab74".
 *
 * Broken, it is repaired where it broke, and the agent stays up
 * ({@link repairJudge}): what is wrong is one workspace's judge, and an exit
 * cut every other workspace's call off while its start revived the same
 * state, which the next close broke again (obelisk, 2026-10-18: two exits,
 * one per `from` cut of held workspace bb4af2c9).
 */
const judgesAnswer = async (procs: readonly HeldProc[]): Promise<void> => {
  if (armState.arming.kind !== "listed") {
    return;
  }
  await Promise.all(rearming.values());
  const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
  if (ids.length === 0) {
    return;
  }
  const commands = await commandsNow();
  const build = judgeBuildOf(await judgeScripts());
  await Promise.all(
    ids.map(async (id) => {
      if (settling(id)) {
        return;
      }
      const path =
        (await readHeld(id).catch(() => undefined))?.path ??
        (
          await readRecord(
            join(stateDir(id), "create.json"),
            z.object({ path: z.string().optional() })
          ).catch(() => undefined)
        )?.path;
      if (!(path && inUse(id, path, procs, commands))) {
        return;
      }
      const asked = await judgeAnswer(id, build);
      if (asked.answers || settling(id)) {
        return;
      }
      await repairJudge({ id, path }, asked, build);
    })
  );
};

/**
 * Repairs law `live-workspace-judge-answers` for workspace `ref` alone, its
 * hook's judge having answered `asked`, not as this build's:
 *
 *  1. the judge the hook names, if a keeper still holds it, is ended and
 *     waited out (a hung one, or one of another build: `judgeFor` never
 *     starts a second of a form already held);
 *  2. its boundary is ensured ({@link ensureNow}): one running is armed
 *     again, which starts this build's judge and points the hook at it, and
 *     one gone is started, as the agent's start revives one under a live CLI;
 *  3. the judge is asked again; still not answering, what uses the workspace
 *     is ended ({@link endUsers}), so no call is refused for ever.
 *
 * One line names the workspace, what its judge said and what was done. The
 * agent stays up whatever it comes to.
 */
const repairJudge = async (
  ref: WorkspaceRef,
  asked: JudgeAnswer,
  build: string
): Promise<void> => {
  const form = asked.socket
    ? JUDGE_SOCKET.exec(basename(asked.socket))?.[1]
    : undefined;
  if (form) {
    const procId = judgeProcId(ref.id, form);
    const stuck = await keepers.holding(procId);
    if (stuck) {
      await stuck.client.signal(procId, "SIGKILL");
      await until(async () => !(await holding(procId)), {
        deadline: Date.now() + STOP_TIMEOUT_MS,
        every: 20,
      });
    }
  }
  let started = "its judge was started again";
  try {
    await ensureNow(ref);
    await rearming.get(ref.id);
  } catch (error) {
    started = `its boundary could not be started again (${error instanceof Error ? error.message : String(error)})`;
  }
  const again = await judgeAnswer(ref.id, build);
  const broken = `law live-workspace-judge-answers was broken (a session's process or a command is in it, and ${asked.words}, not this build's judge ${build})`;
  if (again.answers) {
    console.warn(
      `[workspace] ${ref.id}: ${broken}; ${started} and answers as this build's`
    );
    return;
  }
  const ended = await endUsers(ref);
  console.warn(
    `[workspace] ${ref.id}: ${broken}; ${started}, and still ${again.words}, so ${
      isPlace(ref.id)
        ? "nothing was ended: a place's sessions are the person's own, and each call there is refused until its next start arms it"
        : `what used it was ended: ${ended.ended.join(", ") || "nothing was left"}${ended.left.length > 0 ? `; still running after SIGKILL: ${ended.left.join(", ")}` : ""}`
    }`
  );
};

let quietTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Starts looking for quiet boundaries every {@link QUIET_SWEEP_MS}
 * ({@link sweepQuiet}), with what the daemon knows holds a workspace, and
 * then at every live workspace's judge ({@link judgesAnswer}); and on macOS
 * ends what boundaries started before this build's membership names left
 * once their workspace went ({@link lookAtPreTag}), and looks at each
 * boundary's folder (lifecycle.ts `watchCloneOf`). Once per agent.
 */
export const watchQuietBoundaries = (given: BoundaryHolders): void => {
  holders = given;
  lookForNarrowing();
  if (quietTimer) {
    return;
  }
  lookAtPreTag();
  let looking = false;
  quietTimer = setInterval(() => {
    if (looking) {
      return;
    }
    looking = true;
    // Each macOS boundary's folder looked at too: a deletion its watchers
    // missed closes its boundary within a sweep (lifecycle.ts `watchCloneOf`).
    for (const look of [...cloneLooks.values()]) {
      look();
    }
    sweepQuiet()
      .then(async () =>
        judgesAnswer((await keepers.held()).filter((proc) => proc.alive))
      )
      .catch((error: unknown) => {
        console.warn(
          `[workspace] the quiet boundaries could not be looked at: ${error instanceof Error ? error.message : String(error)}`
        );
      })
      .finally(() => {
        looking = false;
      });
  }, QUIET_SWEEP_MS);
  quietTimer.unref();
};

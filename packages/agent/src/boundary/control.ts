/**
 * The boundary's entry points: re-arming hooks after a restart, closing
 * retiring generations, and closing a boundary while something must not run
 * in it.
 */
import { readdir } from "node:fs/promises";
import { workspacesDir } from "@cawco/core/paths/workspace";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { isPlace } from "@cawco/core/workspace-policy";
import { recordAgentState } from "../agent-state";
import { boundaryProcId, isBoundaryOf, isJudgeOf } from "../proc-id";
import { addAccount, addSpill, behindGate } from "./decisions";
import {
  armedWorkspaces,
  armHook,
  armingOf,
  armPhase,
  armStep,
  closeWhenIdle,
  ensureBoundary,
  lookOnce,
  lookUnderWay,
  nextReading,
  replaceSoon,
  start,
} from "./ensure";
import { closedWhile, liveWhy, recentlyHeld } from "./holding";
import { closeQuietly, liveFacts, setProject } from "./looks";
import { workLeft } from "./narrowing";
import { commandsEnded } from "./processes";
import { isStale, sayWhyLeft } from "./staleness";
import {
  type Boundary,
  type Held,
  isClosing,
  isStarting,
  procsHeld,
  readHeld,
  readRetiring,
  refusal,
  STOP_TIMEOUT_MS,
  sessiond,
  startUnderWay,
} from "./state";
import {
  sandboxesGone,
  settleGonePlace,
  stopGeneration,
  stopNow,
} from "./stop";

/**
 * At this agent's start: each place on record here ({@link readHeld})
 * whose folder is gone, settled ({@link settleGonePlace}), so no handover,
 * look or restart starts its boundary only to see its folder gone (exit
 * protocol.ts `HOST_GONE_STATUS`). Never throws.
 */
export const settleGonePlaces = async (): Promise<void> => {
  try {
    const ids = (
      await readdir(workspacesDir()).catch(() => [] as string[])
    ).filter(isPlace);
    for (const id of ids) {
      const held = await readHeld(id).catch(() => undefined);
      if (held) {
        await settleGonePlace({ id, path: held.path });
      }
    }
  } catch (error) {
    console.warn(
      `[workspace] the places whose folder is gone could not all be settled: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Writes every held workspace's hook and its script again, in this build's
 * form, as the agent starts (fd2d7601): a running CLI reads its workspace's
 * hook on every tool call, so one an earlier build wrote must not outlive
 * that build's runtime, and no session is adopted or launched in a
 * workspace before its own is rewritten (ensure.ts `hookArmed`).
 *
 * Nothing else waits on it: the agent registers and takes custody of other
 * sessions meanwhile (it took 78 s on obelisk with 421 folders, one at a
 * time, and the update nearly rolled back). The workspaces whose boundary
 * runs, on any keeper, read once from the keepers' listing, and in which a
 * session's process is attached or a command is on its way in
 * (holding.ts `inUse`), are armed now, ensure.ts `REARM_CONCURRENCY` at a time: that
 * is where a CLI runs, and one of an older form is handed over there. One a
 * session's process runs in with no boundary is started again. Any other has
 * no command to run: it is armed the moment a session there is adopted or
 * launched, or anything else ensures its boundary, so the start neither
 * starts a boundary for an idle workspace nor hands one over; an idle one
 * still running closes once quiet (looks.ts `sweepQuiet`), and an older
 * boundary an earlier agent left beside it is closed in this pass when
 * nothing runs in it ({@link closeLeftRetiring}). A reading that could
 * not be made whole blocks every gate by name and is read again. What this
 * returns settles once the first whole reading's arming is done.
 */
export const rearmHooks = async (): Promise<void> => {
  const started = Date.now();
  armStep({ kind: "arm-start" });
  while (armPhase().kind !== "listed") {
    await nextReading();
  }
  // Read once, as listed: a session launched meanwhile arms its workspace
  // on its need, out of `later`, and that workspace is still this pass's.
  const listed = Object.entries(armedWorkspaces());
  const now = listed.flatMap(([id, arm]) => (arm.kind === "later" ? [] : [id]));
  const later = listed.length - now.length;
  await Promise.all(now.map((id) => armingOf(id)));
  const retired = await closeLeftRetiring(listed.map(([id]) => id));
  const ms = Date.now() - started;
  console.info(
    `[workspace] boundary hooks written for ${now.length} workspace(s) with a session or command in it, or a session's process with no boundary, in ${ms} ms; ${later} with nothing in them are armed when a session there starts; ${retired} older boundar${retired === 1 ? "y" : "ies"} an earlier agent left running, with nothing in ${retired === 1 ? "it" : "them"}, closed`
  );
  await recordAgentState("startup", { armed: now.length, later, ms, retired });
};

/**
 * The boundary a spawn is bounded to, running; none for a spawn without a
 * workspace. A Claude session's `account` is added to the workspace's
 * accounts first ({@link addAccount}), so the boundary it runs in reads that
 * account's user layer. A new workspace's first session finds its account
 * there already (`createWorkspace`), so its boundary's form is unchanged; one
 * started without it (a later session on another account) is handed over,
 * its form changed with its policy. The project a work item's session
 * belongs to is the workspace's ({@link setProject}), so a workspace cut
 * before it was kept reads its project's folder from its next item on. The
 * session's `spill` folder, where its harness saves a tool result too large
 * to hand the model, is added too ({@link addSpill}): the workspace's first
 * session finds its own there already (first-session.ts, placed at the
 * cut), and a later session's hands the boundary over, its form changed
 * with its policy.
 */
export const boundaryFor = async (
  workspace: WorkspaceRef | undefined,
  account: string | undefined,
  project?: string,
  spill?: string
): Promise<Boundary | undefined> => {
  if (!workspace) {
    return;
  }
  if (account) {
    await addAccount(workspace.id, account);
  }
  if (project) {
    await setProject(workspace.id, project);
  }
  if (spill) {
    await addSpill(workspace.id, spill);
  }
  return ensureBoundary(workspace);
};

/**
 * At start-up: the older boundaries an earlier agent left running beside the
 * current one (or alone) in every workspace the start-up reading listed, each
 * closed now if nothing runs in it (ensure.ts `closeIdle`), once the workspaces
 * armed now are armed; one that still runs something is left to close once it
 * ends. Answers how many were closed. Without it an older one nothing ran in
 * ran on until its workspace's quiet close: in r361 (2026-10-25) fifteen idle
 * workspaces held two boundaries for 10 min after a restart. A workspace a
 * session launched meanwhile arms on its need is among them: in r393w R's
 * killed session was launched again during the pass, which took R out of the
 * workspaces armed later, and its older boundary closed a second after it.
 */
const closeLeftRetiring = async (ids: readonly string[]): Promise<number> => {
  const counts = await Promise.all(
    ids.map(async (id) => (await readRetiring(id)).length)
  );
  const left = ids.filter((_, at) => (counts[at] ?? 0) > 0);
  if (left.length === 0) {
    return 0;
  }
  for (const id of left) {
    closeWhenIdle(id);
  }
  // A look begun before they were added may have passed them by.
  await lookUnderWay();
  await lookOnce();
  // A look passes over a workspace whose boundary is starting
  // (ensure.ts `closeRetiring`), as one is while a session there is launched
  // again at start-up (a turn its killed process left): the pass waits that
  // start out and looks again, so it closes what it leaves behind idle.
  const pending = left.flatMap((id) => {
    const begun = startUnderWay(id);
    return begun ? [begun.catch(() => undefined)] : [];
  });
  if (pending.length > 0) {
    await Promise.all(pending);
    await lookUnderWay();
    await lookOnce();
  }
  const after = await Promise.all(
    left.map(async (id) => (await readRetiring(id)).length)
  );
  await sayWhyLeft(left.filter((_, at) => (after[at] ?? 0) > 0));
  const before = counts.reduce((sum, count) => sum + count, 0);
  return before - after.reduce((sum, count) => sum + count, 0);
};

/**
 * What a retiring session keeper runs of a workspace (a keeper handover left
 * it there) moves to the current keeper, so the keeper before is left holding
 * nothing of it (binary-update.ts `#tendKeepers`, while any keeper retires):
 *
 * - its current boundary is handed over at the next look ({@link
 *   replaceSoon}), as one of an older form is; the one on the retiring keeper
 *   runs on until nothing runs in it, then closes, as does an older
 *   generation that keeper still runs;
 * - its judge, when none runs on the current keeper: the hook is armed again,
 *   which starts the judge on the current keeper (its form names its keeper,
 *   judge-process.ts `judgeFor`) and points the hook at it once it answers; the one
 *   before leaves once the hook no longer names it.
 *
 * A handover of an older form waits for this build's keeper (decisions.ts `ownKeeperOwed`), so none lands on a keeper that is about to retire. What
 * still runs on one when a keeper is handed over: a boundary whose form this
 * build keeps (it is not handed over as the agent starts), one started fresh
 * (none was running) before this build's keeper took the endpoint, a judge,
 * and everything a `--keeper-only` handover leaves behind.
 *
 * A workspace nothing holds ({@link liveWhy}) moves nothing: its boundaries
 * and judges are closed where they run ({@link closeQuietly}), once nothing
 * has ensured it for holding.ts `QUIET_CLOSE_MS` (none has, after the agent's
 * restart), and its next command starts them on the current keeper. Until the hub has said which
 * work items are live, none of the retiring keeper's is moved or closed.
 *
 * One listing of each keeper, whatever the number of workspaces.
 */
export const leaveRetiringKeepers = async (): Promise<void> => {
  const current = await sessiond();
  const procs = (await procsHeld()).filter((proc) => proc.alive);
  const elsewhere = procs.filter((proc) => proc.epoch !== current.epoch);
  if (elsewhere.length === 0) {
    return;
  }
  const facts = await liveFacts(procs);
  if (!facts) {
    return;
  }
  const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
  for (const id of ids) {
    if (isStarting(id) || isClosing(id)) {
      continue;
    }
    const held = await readHeld(id).catch(() => undefined);
    if (!held) {
      continue;
    }
    const onRetiring = elsewhere.some(
      (proc) => isBoundaryOf(proc.procId, id) || isJudgeOf(proc.procId, id)
    );
    if (onRetiring && !liveWhy(id, held.path, facts)) {
      // One ensured a moment ago may have its session on the way: it is
      // closed at a later look, once quiet.
      if (!recentlyHeld(id)) {
        await closeQuietly(id, "it runs on a retiring session keeper");
      }
      continue;
    }
    const boundary = boundaryProcId(id, held.gen);
    if (!isStale(id) && elsewhere.some((proc) => proc.procId === boundary)) {
      console.info(
        `[workspace] ${id}: its boundary runs on a retiring session keeper, and is handed over to one on the current keeper`
      );
      replaceSoon({ id, path: held.path });
    }
    const judged = (procsOn: typeof procs) =>
      procsOn.some((proc) => isJudgeOf(proc.procId, id));
    if (
      judged(elsewhere) &&
      !judged(procs.filter((proc) => proc.epoch === current.epoch))
    ) {
      console.info(
        `[workspace] ${id}: its judge runs on a retiring session keeper; its hook is armed again, with a judge on the current one`
      );
      await armHook(id, held).catch((error: unknown) => {
        console.warn(
          `[workspace] ${id}: its judge could not be started on the current session keeper: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }
  }
};

/**
 * Kills the workspace's boundaries, the current one and every older one
 * still beside it, with every process in them (stop.ts `stopBoundary`), and any
 * other boundary process of the workspace; on macOS everything that answers
 * to the workspace's name (sandboxes.ts `endMembers`). Stops serving its doors, and closes its pages in its
 * project's browser with its sessions' connections there. What still uses it from
 * outside the boundary ends too: a session's CLI in its clone, an executor
 * on its way in (stop.ts `endUsers`). Its record goes (`boundary.json`, each
 * older one's), so its executor says the boundary is not running and a
 * judge's exit arms nothing again (ensure.ts `watchJudge`); then its judges go,
 * on every keeper that runs one, unless something stop.ts `endUsers` ended
 * outlived its SIGKILL, which its judge goes on answering. Never starts one: a
 * boundary already down, or one that never started, leaves nothing to do.
 * Its clone, state dir (its accounts, project, hook and policy), scratch dir
 * and stand-ins stay, so its next {@link ensureBoundary} starts one as a
 * quiet close leaves it. What an archive does first (workspace.ts
 * `closeClone`): nothing writes the clone from here on. A start under way
 * ends first, and one asked for meanwhile waits ({@link closedWhile}).
 * Answers the inner pids of the sandboxes it stopped (Linux).
 */
export const stopWorkspaceBoundary = (ref: WorkspaceRef): Promise<number[]> =>
  closedWhile(ref.id, () => stopNow(ref));

/**
 * `work` on this host with workspace `ref`'s boundary closed as
 * {@link stopWorkspaceBoundary} closes it, in the same hold against starts
 * ({@link closedWhile}): no process of the workspace runs while it does, and
 * an ensure asked for meanwhile waits for it, then starts a boundary under
 * the policy as before. On Linux it runs once the sandboxes are gone
 * ({@link sandboxesGone}), so no mount namespace still holds a bind on what
 * it writes; one still there after {@link STOP_TIMEOUT_MS} refuses it, and
 * nothing is written. For what the policy denies the workspace itself and
 * the host writes for it: the tracked files of a commit the hub checks out
 * (workspace.ts `workspaceAt`).
 */
export const whileBoundaryClosed = <T>(
  ref: WorkspaceRef,
  work: () => Promise<T>
): Promise<T> =>
  closedWhile(ref.id, async () => {
    const inners = await stopNow(ref);
    if (process.platform === "linux" && !(await sandboxesGone(inners))) {
      throw refusal(
        ref.id,
        `its sandbox was still there ${STOP_TIMEOUT_MS / 1000}s after it was stopped, so nothing was written into its clone on the host`
      );
    }
    return await work();
  });

/**
 * What still runs in workspace `id`'s boundary `held`, in words, with its
 * gate up: an older generation beside it, a command past the gate once
 * {@link commandsEnded} gave up waiting, or its work ({@link workLeft});
 * nothing once it is idle.
 */
const stillRuns = async (
  id: string,
  held: Held
): Promise<string | undefined> => {
  if ((await readRetiring(id)).length > 0) {
    return "an older boundary of it still runs beside it";
  }
  const past = await commandsEnded(id, held.gen);
  if (past.length > 0) {
    return `it runs ${past.length === 1 ? "a command" : `${past.length} commands`} (executor ${past.join(", ")})`;
  }
  const left = await workLeft(id, held);
  return left ? `its boundary ${left.words}` : undefined;
};

/** What {@link whileSandboxDown} answers: `work`'s own answer, or what still runs in the boundary, in words. */
export type SandboxDown<T> = { readonly ran: T } | { readonly busy: string };

/**
 * `work` on this host with workspace `ref`'s sandbox down while its sessions
 * live on: for a workspace a session still works in (a delegate's, whose
 * landing rebases it), where {@link whileBoundaryClosed} would end its CLI
 * and its judge. Behind the gate ({@link behindGate}: a command arriving
 * meanwhile waits there, then runs through the boundary after) and in one
 * hold against starts ({@link closedWhile}), the boundary is stopped only
 * when nothing runs in it ({@link commandsEnded}, {@link workLeft}, no older
 * generation beside it), as a boundary held over a stand-in is replaced
 * (ensure.ts `restartIfIdle`); on Linux `work` runs once its sandbox is gone. Its
 * judge, doors and hook stay, and a new boundary of the same policy starts
 * after `work`, its or not. One that still runs something answers `busy`, in
 * words, and nothing is stopped. With no boundary running, `work` runs as it
 * is: nothing but the workspace's judged file tools writes the clone then.
 */
export const whileSandboxDown = <T>(
  ref: WorkspaceRef,
  work: () => Promise<T>
): Promise<SandboxDown<T>> =>
  closedWhile(ref.id, () =>
    behindGate(ref.id, async (): Promise<SandboxDown<T>> => {
      const held = await readHeld(ref.id);
      if (!held) {
        return { ran: await work() };
      }
      const busy = await stillRuns(ref.id, held);
      if (busy) {
        return { busy };
      }
      const stuck = await stopGeneration(ref.id, held);
      if (stuck) {
        throw refusal(
          ref.id,
          `${stuck}, so nothing was written into its clone on the host`
        );
      }
      try {
        return { ran: await work() };
      } finally {
        const fresh = await start(await sessiond(), ref);
        console.info(
          `[workspace] ${ref.id}: its boundary ${held.pid} was down while the host wrote its clone, and ${fresh.pid} runs now`
        );
      }
    })
  );

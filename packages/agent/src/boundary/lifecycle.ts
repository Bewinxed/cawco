import { randomBytes } from "node:crypto";
import { lstat, mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { atMost } from "@cawco/core/at-most";
import {
  type HandoverCommand,
  type HandoverEvent,
  step as handoverStep,
  initialHandover,
  KEEPERS_ASK_AGAIN_MS,
  type ListedWorkspace,
} from "@cawco/core/handover";
import {
  workspaceClaudeTmpDir,
  workspacePolicyFile,
  workspacesDir,
} from "@cawco/core/paths/workspace";
import { hostEnvironment } from "@cawco/core/session-env";
import { listedPid } from "@cawco/core/signal";
import { readRecord } from "@cawco/core/state-file";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { systemProgram, workspaceNeeds } from "@cawco/core/workspace-needs";
import { isPlace, workspacePolicy } from "@cawco/core/workspace-policy";
import { z } from "zod";
import { ensureGateToken } from "../browser/gate";
import { isGitDir } from "../git-dir";
import { openGithubDoor } from "../github-door";
import { openGitDoor } from "../hub-git";
import { ensureView, layerOf, ownFolderSync, ownModules } from "../layer";
import { boundaryProcId, isBoundaryOf } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { hasLeftDirs, listStandIns, rewriteLeftFiles } from "../stand-ins";
import { openToolDoor } from "../tool-door";
import { linkWorkspaceModules } from "../workspace-modules";
import {
  behindGate,
  decided,
  keepSpills,
  type NarrowCause,
  nestedSeatbelt,
  ownKeeperOwed,
  reasonsOf,
  recordDecision,
  saidUnknown,
  viewOfBoundary,
} from "./decisions";
import { execScript, gateOf, ready } from "./exec";
import { attachedIn, commandsNow, inUse, liveAt } from "./holding";
import {
  bunRuntime,
  claudePrefixOf,
  claudePrefixScript,
  hookScript,
} from "./hook-judge";
import { judgeFor, whileArming } from "./judge-process";
import {
  keeperTakingOver,
  type Narrowed,
  narrowedCause,
  narrowedGenerations,
  supersededPorts,
  tellStopped,
  unknownGrant,
  type WorkProcess,
  workIn,
  workLeft,
} from "./narrowing";
import { makeDirs, ownInodes } from "./package-managers";
import { type Seen, snapshot } from "./place-guard";
import { formMoveWords, formOf, planOf, REASONS_SAID } from "./plan";
import {
  busyOld,
  commandsEnded,
  commandsIn,
  drainable,
  type Work,
} from "./processes";
import { srtTmpOf } from "./runner";
import { endMembers, sandboxes } from "./sandboxes";
import {
  writeChromiumShim,
  writeGitShim,
  writeGuardedGhConfig,
  writeShims,
} from "./shims";
import { retiring, STALE_LOOK_MS, stale, stubbed } from "./staleness";
import {
  type Boundary,
  closing,
  fifoOf,
  generationDir,
  gitSystemConfig,
  gitSystemConfigOf,
  type Held,
  keepers,
  READY,
  type Retiring,
  readHeld,
  readPlace,
  readRetiring,
  refusal,
  retiringFileOf,
  roOf,
  running,
  scratchOf,
  sessiond,
  starting,
  stateDir,
  writeWhole,
} from "./state";
import { cleanGeneration, stopBoundary, stopGeneration } from "./stop";
import { watchCloneOf, watchHost } from "./watch";
import { keptRunning } from "./work";

/**
 * Starts the workspace's judge in this build's form and writes its hook for
 * `held` to ask it, its executor in this build's form for the boundary `held`
 * names, and the record of them, and serves its tool door. An executor only
 * hands commands in, so it is current from the next command on, whatever form
 * the boundary is. A running CLI reads its hook at every call, so it asks
 * the new judge from the next call on. On macOS also its shims. The
 * workspace's policy is written again too, as this machine stands now
 * (`workspacePolicy`): every harness reads it at each file tool call, so a
 * store, toolchain or account added since is in it from the next call on.
 */
export const armHook = (
  id: string,
  held: Omit<Held, "claudeTmp" | "hook" | "policy" | "prefix">
): Promise<Held> => whileArming(id, () => armHookNow(id, held));

/** {@link armHook}'s writes and starts, counted as {@link arming}. */
const armHookNow = async (
  id: string,
  held: Omit<Held, "claudeTmp" | "hook" | "policy" | "prefix">
): Promise<Held> => {
  const hook = join(stateDir(id), "hook");
  const prefix = claudePrefixOf(id);
  const policy = workspacePolicyFile(id);
  // The CLI makes its own `claude-<uid>` in it, 0700, and refuses a root it
  // does not own; inside the boundary it is read only, as the rest of `ro`.
  const claudeTmp = workspaceClaudeTmpDir(id);
  await mkdir(claudeTmp, { recursive: true, mode: 0o700 });
  await writeWhole(
    policy,
    `${JSON.stringify(await workspacePolicy({ id, path: held.path }), null, 2)}\n`,
    0o644
  );
  const judge = await judgeFor(id, held, hook, policy);
  await writeWhole(hook, hookScript(id, hook, judge), 0o755);
  const runtime = await bunRuntime(id);
  if (process.platform === "darwin") {
    await writeShims(id, runtime);
  }
  await writeGuardedGhConfig(id);
  await writeWhole(gitSystemConfigOf(id), gitSystemConfig(id), 0o644);
  await writeGitShim(id, held.path);
  await writeChromiumShim(id);
  // The copy of gh's token an earlier build's executor kept beside the
  // workspace: nothing reads it now, and a token is kept nowhere it is not used.
  await rm(join(stateDir(id), "gh-token"), { force: true });
  // The repository rule an earlier build wrote for the workspace's doors:
  // nothing reads it now.
  await rm(join(roOf(id), "upstream.json"), { force: true });
  // Its host's pid as the keeper listed it at its start, and matched to
  // the keeper's list again before any boundary on record is armed.
  await writeWhole(
    held.exec,
    execScript(id, { ...held, pid: listedPid(held.pid) }),
    0o755
  );
  await writeWhole(prefix, claudePrefixScript(id, held.exec), 0o755);
  await openToolDoor(id);
  await openGitDoor({ id, path: held.path });
  await openGithubDoor(id);
  await watchHost(id, held);
  const armed: Held = { ...held, claudeTmp, hook, policy, prefix };
  await writeWhole(
    join(stateDir(id), "boundary.json"),
    `${JSON.stringify(armed)}\n`,
    0o644
  );
  return armed;
};

/**
 * Writes one workspace's hook and its script again, in this build's form,
 * and serves its tool door: whether it was armed. A running boundary of an
 * older form is handed over here, behind the gate, and its handover arms the
 * new one ({@link handOver}); while this build's keeper is still owed the
 * machine's endpoint (an update's agent starts before its keeper does), it is
 * armed as it is and handed over once that keeper is the machine's ({@link
 * ownKeeperOwed}); one whose handover fails is armed as it is and tried again
 * at each look ({@link replaceSoon}). An older boundary an
 * earlier agent left running beside the current one is closed once nothing
 * runs in it ({@link closeWhenIdle}). Never throws: what fails is said.
 */
const rearmOne = async (id: string): Promise<boolean> => {
  const said = (what: string) => (error: unknown) => {
    console.warn(
      `[workspace] ${id}: ${what}: ${error instanceof Error ? error.message : String(error)}`
    );
  };
  if ((await readRetiring(id)).length > 0) {
    closeWhenIdle(id);
  }
  const held = await readHeld(id).catch(
    said("its boundary hook could not be written again")
  );
  if (!held) {
    return false;
  }
  // A gate an agent left as it died names no process this one waits for.
  await rm(gateOf(id), { force: true });
  const ref = { id, path: held.path };
  // A person's own folder gets no stand-ins, and nothing is listed in its
  // exclude; nor does the folder a Linux view overlays (layer.ts), whose
  // stand-ins are in its upper: only a folder of the workspace's own does.
  const own = !isPlace(id) && ownFolderSync(id, ref.path);
  if (own && process.platform === "linux") {
    // Before anything is armed: each mount point a running sandbox left
    // where a file stands in holds that file's stand-in now, in place; one
    // where a dir stands in goes with its boundary, once nothing runs in it
    // (`stand-ins.ts`).
    const dirsLeft = await rewriteLeftFiles(ref).catch((error: unknown) => {
      said("the mount points its sandbox left could not be rewritten")(error);
      return false;
    });
    if (dirsLeft) {
      restartWhenIdle(ref);
    }
  }
  // Only CawCo's stand-ins in the clone's `info/exclude`: the fixed names
  // an earlier build wrote there go, and a user's own files show again.
  if (own) {
    await listStandIns(ref, false).catch(
      said("its clone's stand-ins could not be listed in its info/exclude")
    );
  }
  const form = await formOf(ref).catch(
    said("its boundary's form could not be checked")
  );
  // An older form, or a grant this build cannot compare with its policy
  // (narrowing.ts `compareGrant`): ensured now, so it is handed over once idle.
  const outdated =
    form !== undefined &&
    (held.form !== form ||
      (await unknownGrant(ref, held).catch(() => undefined)) !== undefined);
  if (outdated && (await running(id, held))) {
    // Handed over now, behind the gate: a command waits at the gate and runs
    // through the new boundary rather than through one of another form.
    try {
      await behindGate(id, () => ensureNow(ref));
      return true;
    } catch (error) {
      said("its older boundary could not be handed over yet")(error);
      replaceSoon(ref);
    }
  }
  try {
    await armHook(id, held);
    return true;
  } catch (error) {
    said("its boundary hook could not be written again")(error);
    return false;
  }
};

/**
 * How many workspaces are armed at once at start-up. Our call: each is a few
 * small writes and a keeper round trip or two, and a machine holds hundreds
 * of workspace folders; one at a time took 78 s for 421 on obelisk
 * (2026-10-10), against the update's 180 s window to register.
 */
const REARM_CONCURRENCY = 16;

/**
 * THIS AGENT'S ARMING, AS THE HANDOVER DECIDES IT (core handover.ts): the
 * start-up reading of its workspaces, and which of them are armed now,
 * started again, or left until a session there needs them. This module only
 * reads the workspaces and the keepers, arms, and runs what the reducer says.
 */
export let armState = initialHandover();

/** Each workspace's arming under way or done, by id ({@link hookArmed}). */
export const rearming = new Map<string, Promise<void>>();

/** Settled each time the start-up reading moves, for a gate waiting on it. */
export let readingMoved = Promise.withResolvers<void>();

/** The workspaces the last whole reading found, with the clone each runs in. */
let readRefs = new Map<string, WorkspaceRef>();

const armLimit = atMost(REARM_CONCURRENCY);

/**
 * A SESSION START IN A WORKSPACE IS REFUSED BY NAME WHILE THE AGENT'S
 * START-UP READING IS NOT WHOLE: until it is, no workspace is known armed or
 * not, and a keeper that could not be read is never read as holding nothing.
 * Its reading is tried again every {@link KEEPERS_ASK_AGAIN_MS}, and the
 * refusal lasts until one is whole.
 */
class ArmingBlocked extends Error {
  readonly workspace: string;
  constructor(workspace: string, why: string) {
    super(
      `Sessions in this workspace can't start yet: this machine's workspaces could not be read at its start (${why}). Nothing was changed; they're read again every ${KEEPERS_ASK_AGAIN_MS / 1000} s, and a start goes once a reading is whole.`
    );
    this.name = "ArmingBlocked";
    this.workspace = workspace;
  }
}

/** One step of the arming, its commands run in order. */
export const armStep = (event: HandoverEvent): void => {
  const before = armState.arming;
  const stepped = handoverStep(armState, event);
  armState = stepped.state;
  for (const command of stepped.commands) {
    obeyArming(command);
  }
  if (armState.arming !== before) {
    readingMoved.resolve();
    readingMoved = Promise.withResolvers<void>();
  }
};

const obeyArming = (command: HandoverCommand): void => {
  switch (command.kind) {
    case "arm-read":
      readWorkspaces().then(
        ({ listed, refs }) => {
          readRefs = refs;
          armStep({ kind: "arm-listed", workspaces: listed });
        },
        (error: unknown) =>
          armStep({
            kind: "arm-unread",
            why: error instanceof Error ? error.message : String(error),
            now: Date.now(),
          })
      );
      return;
    case "arm":
      rearming.set(command.id, armOne(command.id, command.how));
      return;
    case "say":
      console.warn(command.words);
      return;
    case "wake": {
      const { at } = command;
      setTimeout(
        () => armStep({ kind: "tick", now: Math.max(Date.now(), at) }),
        Math.max(0, at - Date.now())
      );
      return;
    }
    case "announce":
    case "arm-listed":
    case "custody-complete":
    case "fail-owed":
    case "hold":
    case "park":
    case "publish":
    case "read-keeper":
    case "register-lapsed":
    case "register":
    case "release-owed":
    case "send-verdict":
    case "settle":
    case "start":
      return;
  }
};

/**
 * Arms one workspace as the handover says: its hook rewritten in this
 * build's form ({@link rearmOne}), its boundary started again where a
 * session's process runs with none, or its judge started again after it
 * exited ({@link armHook}). What fails is said here and by the arming
 * itself; the workspace is armed as far as it went.
 */
const armOne = async (
  id: string,
  how: "hook" | "revive" | "judge"
): Promise<void> => {
  try {
    if (how === "hook") {
      await armLimit(() => rearmOne(id));
    } else if (how === "judge") {
      const held = await readHeld(id);
      if (held) {
        await armHook(id, held);
      }
    } else {
      const ref = readRefs.get(id);
      if (ref) {
        await armLimit(() => ensureNow(ref));
      }
    }
  } catch (error) {
    console.warn(
      `[workspace] ${id}: ${
        how === "revive"
          ? "a session's process runs in it with no boundary, and its boundary could not be started again"
          : "its judge could not be started again"
      }: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    armStep({ kind: "armed", id });
  }
};

/**
 * Waits until workspace `id`'s hook is in this build's form, arming it now
 * when the start left it for later. Every session there waits on it before
 * it is adopted or launched (`#adoptClaimed`, {@link ensureBoundary}), and
 * on its own workspace's alone. While the start-up reading is blocked it
 * refuses by name ({@link ArmingBlocked}).
 */
export const hookArmed = async (id: string): Promise<void> => {
  for (;;) {
    const phase = armState.arming;
    if (phase.kind === "blocked") {
      throw new ArmingBlocked(id, phase.why);
    }
    if (phase.kind !== "listing") {
      break;
    }
    await readingMoved.promise;
  }
  armStep({ kind: "arm-need", id });
  await rearming.get(id);
};

/**
 * One reading of the workspaces for the handover's arming: each one's
 * boundary running on some keeper, whether a session's process or a command
 * is in it, and, where none runs, whether a session's process runs in its
 * clone. Throws when the folders or the keepers cannot be read whole: a
 * keeper that could not be read makes the reading unknown (keepers.ts
 * `notKnown`), never a keeper read as holding nothing.
 *
 * EVERY WORKSPACE A SESSION'S PROCESS RUNS IN HAS ITS JUDGE, WHATEVER BECAME
 * OF THAT SESSION'S ATTACH: one whose boundary no keeper runs, with a clone a
 * keeper still holds a Claude Code or pi process in ({@link attachedIn}), has
 * a hook naming a judge that is gone, which refuses every call the process
 * makes (b895ec57, 2026-10-16: closed as quiet while its session's attach
 * had failed, its process still running on the keeper before the update). A
 * place has no clone record, and is armed as its session starts.
 */
const readWorkspaces = async (): Promise<{
  listed: ListedWorkspace[];
  refs: Map<string, WorkspaceRef>;
}> => {
  const ids = await readdir(workspacesDir()).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [] as string[];
      }
      throw error;
    }
  );
  const live = (await keepers.held()).filter((proc) => proc.alive);
  const commands = await commandsNow();
  const listed: ListedWorkspace[] = [];
  const refs = new Map<string, WorkspaceRef>();
  for (const id of ids) {
    if (live.some((proc) => isBoundaryOf(proc.procId, id))) {
      const held = await readHeld(id).catch(() => undefined);
      if (held) {
        // Its folder watched whether or not it is armed now: a folder
        // deleted under an idle boundary closes it too (macOS).
        watchCloneOf(id, held);
      }
      listed.push({
        id,
        boundary: true,
        inUse: held !== undefined && inUse(id, held.path, live, commands),
        cli: false,
      });
      continue;
    }
    const created = isPlace(id)
      ? undefined
      : await readRecord(
          join(stateDir(id), "create.json"),
          z.object({ path: z.string().optional() })
        ).catch(() => undefined);
    const cli =
      created?.path !== undefined &&
      attachedIn(id, created.path, live, commands);
    if (cli && created?.path) {
      refs.set(id, { id, path: created.path });
    }
    listed.push({ id, boundary: false, inUse: false, cli });
  }
  return { listed, refs };
};

/**
 * The workspace's boundary, running: the one already held, or a new one
 * (after a reboot or a sessiond restart), once the workspace's hook is in
 * this build's form ({@link hookArmed}): every spawn, restore, wake and
 * command in a workspace comes through here. Throws — with the reason — when
 * this machine cannot hold one.
 */
export const ensureBoundary = async (ref: WorkspaceRef): Promise<Boundary> => {
  await hookArmed(ref.id);
  return ensureNow(ref);
};

/**
 * {@link ensureBoundary} with the hook already armed: the start-up rewrite's
 * own hand-over ({@link rearmOne}). A quiet close under way finishes first
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
 * handover of one ({@link handOverStale}) or a restart ({@link
 * restartStubbed}) is never tried again. Its records stay for its archive.
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
    // the machine's ({@link handOverStale}).
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
 * as {@link restartIfIdle} stops one: the gate goes up, each is stopped with
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
 * process in it; it closes once nothing runs in it ({@link closeIdle}). Said
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

let staleTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Each {@link STALE_LOOK_MS}: hands over every running boundary of an older
 * form ({@link ensureBoundary}), then closes every older boundary nothing
 * runs in any more ({@link closeIdle}), reading the processes once for all
 * of them, after the handovers. A workspace leaves the first set once its
 * boundary is handed over, current, or no longer running, and the second
 * once no older boundary of it is left.
 */
const lookAtStale = async (): Promise<void> => {
  await handOverStale();
  if (retiring.size > 0) {
    await closeRetiring();
  }
  if (stubbed.size > 0) {
    await restartStubbed();
  }
};

/** Replaces workspace `ref`'s boundary once nothing runs in it ({@link stubbed}). */
const restartWhenIdle = (ref: WorkspaceRef): void => {
  if (!stubbed.has(ref.id)) {
    stubbed.set(ref.id, { ref, commands: [] });
  }
  lookSoon();
};

export const forgetStubbed = (id: string): void => {
  stubbed.delete(id);
  stopLooking();
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
      // One kept while its work runs ({@link replaceOlder}) is only looked
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
      // and hands it over under the same gate ({@link handOverWhenIdle}).
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

/** The look at the older boundaries under way ({@link lookAtStale}): one at a time. */
export let staleLook: Promise<void> | undefined;

/** A look at the older boundaries: the one under way, or one begun now. Never throws: what fails is said. */
export const lookOnce = (): Promise<void> => {
  staleLook ??= lookAtStale()
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

/**
 * Starts a boundary of a new generation for the workspace under sessiond and
 * writes its executor, which then runs every command through it. One that
 * fails to start is stopped and its files go, so a start tried again leaves
 * nothing of the last behind.
 */
export const start = async (
  client: SessiondClient,
  ref: WorkspaceRef
): Promise<Held> => {
  const gen = randomBytes(4).toString("hex");
  await makeDirs(ref.id);
  await linkWorkspaceModules(ref).catch((error: unknown) => {
    console.warn(
      `[workspace] ${ref.id}: its node_modules could not be linked into the workspaces' cache, so bun copies what its global store cannot hold: ${error instanceof Error ? error.message : String(error)}`
    );
  });
  await mkdir(join(stateDir(ref.id), "boundaries"), { recursive: true });
  // Its generation's dir is made here and nowhere else, and only by this
  // start: one already there is another start's, whose files this one
  // neither uses nor cleans away as it fails.
  const made = await mkdir(generationDir(ref.id, gen)).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") {
        return false;
      }
      throw error;
    }
  );
  if (!made) {
    throw refusal(
      ref.id,
      `its boundary generation ${gen} is already another start's`
    );
  }
  try {
    return await launch(client, ref, gen);
  } catch (error) {
    await stopBoundary(ref.id, { gen });
    await cleanGeneration(ref.id, { gen });
    throw error;
  }
};

/** {@link start}'s generation `gen`, from its files to its record. */
const launch = async (
  client: SessiondClient,
  ref: WorkspaceRef,
  gen: string
): Promise<Held> => {
  const linux = process.platform === "linux";
  // A place is a person's own folder, and so is the folder a Linux view
  // overlays (layer.ts): nothing of the boundary's is written into it from
  // here (no copied inodes, no stand-ins, no exclude lines). The srt host
  // makes the view's stand-ins inside it, into its upper.
  const own = !isPlace(ref.id) && ownFolderSync(ref.id, ref.path);
  const procId = boundaryProcId(ref.id, gen);
  if (linux) {
    // Only with no sandbox of the workspace running: a handover starts this
    // one beside an older one whose work runs on in the same clone.
    const split =
      own && (await sandboxes(ref.id)).length === 0
        ? await ownInodes(ref.path)
        : 0;
    if (split > 0) {
      console.info(
        `[workspace] ${ref.id}: ${split} file(s) in its clone shared an inode with a file outside it, and each now has its own`
      );
    }
    const srtTmp = srtTmpOf(ref.id, gen);
    await rm(srtTmp, { recursive: true, force: true });
    await mkdir(srtTmp, { recursive: true, mode: 0o700 });
  }
  // Linux: the host makes each missing deny path in a clone before the
  // sandbox starts.
  if (own) {
    await listStandIns(ref, linux);
  }
  // Every spill folder its policy binds is there as srt and bwrap look.
  await keepSpills(ref.id);
  const plan = await planOf(ref, gen);
  for (const [path, content, mode] of plan.files) {
    await writeWhole(path, content, mode ?? 0o644);
  }
  const fifo = fifoOf(ref.id, gen);
  const made = await Bun.$`${systemProgram("mkfifo")} ${fifo}`
    .env(hostEnvironment())
    .quiet()
    .nothrow();
  if (made.exitCode !== 0) {
    throw refusal(ref.id, `mkfifo failed: ${made.stderr.toString().trim()}`);
  }
  await client.spawnProc(procId, {
    ...(await viewOfBoundary(ref, plan.spec)),
    workspace: true,
  });
  const readyAt = await ready(client, procId, READY, "the boundary").catch(
    (error: Error) => {
      throw refusal(ref.id, error.message);
    }
  );
  const proc = (await client.list()).procs.find(
    (candidate) => candidate.procId === procId
  );
  if (!proc?.alive) {
    throw refusal(ref.id, "the boundary exited right after it started");
  }
  // The host names its sandbox before it passes the ready line on.
  if (linux && !(await readPlace(ref.id, gen))) {
    throw refusal(
      ref.id,
      "its sandbox's processes could not be found as it started"
    );
  }
  const held: Omit<Held, "claudeTmp" | "hook" | "policy" | "prefix"> = {
    exec: join(stateDir(ref.id), "exec"),
    gen,
    pid: proc.pid,
    scratch: scratchOf(ref.id),
    path: ref.path,
    form: plan.form,
    parts: plan.parts,
  };
  if (linux && own && (await hasLeftDirs(ref.path))) {
    // Its host left a mount point where a dir stands in: an older boundary
    // beside it held one there ({@link stubbed}).
    restartWhenIdle(ref);
  }
  // Followed from its ready line on, before armHook would follow it from now.
  await watchHost(ref.id, held, readyAt);
  // armHook writes the executor.
  return armHook(ref.id, held);
};

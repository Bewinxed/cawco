/**
 * This agent's arming of its workspaces, as the handover decides it: the
 * start-up reading, each workspace armed now or when a session there needs it,
 * and the wait of whatever must not run before its workspace is.
 */

import { readdir, rm } from "node:fs/promises";
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
import { workspacesDir } from "@cawco/core/paths/workspace";
import { readRecord } from "@cawco/core/state-file";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { isPlace } from "@cawco/core/workspace-policy";
import { z } from "zod";
import { ownFolderSync } from "../layer";
import { isBoundaryOf } from "../proc-id";
import { listStandIns, rewriteLeftFiles } from "../stand-ins";
import { armHook } from "./arm";
import { behindGate } from "./decisions";
import { gateOf } from "./exec";
import { attachedIn, commandsNow, inUse } from "./holding";
import { ensureNow } from "./lifecycle";
import { unknownGrant } from "./narrowing";
import { formOf } from "./plan";
import { closeWhenIdle, replaceSoon, restartWhenIdle } from "./staleness";
import {
  type Boundary,
  keepers,
  readHeld,
  readRetiring,
  running,
  stateDir,
} from "./state";
import { watchCloneOf } from "./watch";

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

/**
 * A boundary of a new generation, started under sessiond from its files to its
 * record, or stopped and cleaned away when it does not start.
 */

import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { hostEnvironment } from "@cawco/core/session-env";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { systemProgram } from "@cawco/core/workspace-needs";
import { isPlace } from "@cawco/core/workspace-policy";
import { ownFolderSync } from "../layer";
import { boundaryProcId } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { hasLeftDirs, listStandIns } from "../stand-ins";
import { linkWorkspaceModules } from "../workspace-modules";
import { armHook } from "./arm";
import { keepSpills, viewOfBoundary } from "./decisions";
import { ready } from "./exec";
import { makeDirs, ownInodes } from "./package-managers";
import { planOf } from "./plan";
import { srtTmpOf } from "./runner";
import { sandboxes } from "./sandboxes";
import { restartWhenIdle } from "./staleness";
import {
  fifoOf,
  generationDir,
  type Held,
  READY,
  readPlace,
  refusal,
  scratchOf,
  stateDir,
  writeWhole,
} from "./state";
import { cleanGeneration, stopBoundary } from "./stop";
import { watchHost } from "./watch";

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

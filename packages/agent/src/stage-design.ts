/**
 * A design folder's stage tree (core workspace-id.ts `design`, stage.ts
 * `designOf`): the folder the hub keeps for a design artifact on its own
 * machine (`ARTIFACTS_ROOT/<id>/design`, hub design-folder.ts), served by a stage as a workspace's clone is
 * (stage.ts), in a boundary of its own whose writes reach that folder alone:
 * its install's `node_modules` and lockfile, Vite's cache. The hub names it
 * by its tree id (core workspace-id.ts `designTreeId`) and its folder on every call; this
 * machine keeps that pair as the tree's record (`create.json`, as a pin's
 * copy does), by which its boundary and a preview's request after a daemon
 * restart find it (stage.ts `sourceWorkspace`).
 *
 * It goes with its artifact: the hub sends `stageUnpin` with its id, which
 * stops its stage and boundary and drops its records here (stage.ts
 * `unpin`); one whose folder went while this machine was away goes on the
 * hub's next list of its pins ({@link designsGone}).
 */
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { makeFolder } from "@cawco/core/folders";
import { workspaceStateDir, workspacesDir } from "@cawco/core/paths/workspace";
import { shortId } from "@cawco/core/short-id";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { workspaceIdKindOf } from "@cawco/core/workspace-id";
import { z } from "zod";
import { closeBoundary } from "./boundary/stop";
import { removeTree } from "./remove-tree";
import { forgetInstalls } from "./stage-install";

const CREATE = "create.json";

const CreateSchema = z.object({ path: z.string().optional() });

/** The folder design tree `id`'s record names, or nothing. */
const recordedFolder = async (id: string): Promise<string | undefined> =>
  (
    await readRecord(join(workspaceStateDir(id), CREATE), CreateSchema).catch(
      () => undefined
    )
  )?.path;

/**
 * Design tree `ref` recorded on this machine at the folder the hub names
 * (written only when its record names another or none), refused when the
 * folder isn't there: the hub writes it before it asks for its stage.
 */
export const keepDesign = async (ref: WorkspaceRef): Promise<void> => {
  if (workspaceIdKindOf(ref.id) !== "design") {
    throw new Error(`${ref.id} names no design folder.`);
  }
  if (!existsSync(ref.path)) {
    throw new Error(
      `The design's folder ${ref.path} isn't on this machine: make the design again.`
    );
  }
  if ((await recordedFolder(ref.id)) === ref.path) {
    return;
  }
  const state = workspaceStateDir(ref.id);
  await makeFolder(state);
  await writeStateFile(
    join(state, CREATE),
    `${JSON.stringify({ path: ref.path })}\n`
  );
};

/**
 * Design tree `id`'s records dropped: its boundary closed with its scratch
 * and door dirs (boundary/stop.ts `closeBoundary`), its installs forgotten,
 * its state dir deleted. Its folder is the hub's, and goes with the
 * artifact there. Its stages are stopped first by the caller (stage.ts
 * `unpin`). Nothing for an id no design tree has.
 */
export const dropDesign = async (id: string): Promise<void> => {
  if (workspaceIdKindOf(id) !== "design") {
    return;
  }
  const path = await recordedFolder(id);
  if (path) {
    await closeBoundary({ id, path });
  }
  await forgetInstalls(id);
  await removeTree(workspaceStateDir(id));
  console.info(`[stage] design ${shortId(id)}: let go`);
};

/** Every design tree recorded here whose folder is gone: its artifact went while this machine was away. */
export const designsGone = async (): Promise<string[]> => {
  const ids = (await readdir(workspacesDir()).catch(() => [])).filter(
    (id) => workspaceIdKindOf(id) === "design"
  );
  const each = await Promise.all(
    ids.map(async (id) => {
      const path = await recordedFolder(id);
      return path && existsSync(path) ? undefined : id;
    })
  );
  return each.filter((id): id is string => id !== undefined);
};

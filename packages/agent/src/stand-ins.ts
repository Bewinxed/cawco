/**
 * The agent's part in a Linux clone's deny stand-ins. The boundary's srt host
 * makes each clone-side deny path a clone lacks (`cloneDenies` in
 * workspace-policy.ts) a real, valid, empty one before every sandbox
 * (`standIn` in boundary-host.ts), so srt binds it onto itself and leaves no
 * mount point of its own on the host, where a host harness would read it as
 * broken config (OpenCode: ENOTDIR on `.opencode/opencode.json`). This module
 * handles what a sandbox start does not reach:
 *
 * - A running sandbox started before the stand-ins holds srt's own mount
 *   points, empty read-only files, for its whole life. At the agent's start
 *   each one that is a file's stand-in is written in place, its inode kept,
 *   so the sandbox's bind on it, and its deny, stay ({@link rewriteLeftFiles}).
 *   One where a dir stands in cannot become a dir without an unlink, which
 *   would drop that deny: its boundary is replaced once nothing runs in it
 *   ({@link hasLeftDirs}, `restartStubbed` in boundary.ts), and the new host
 *   makes the dir.
 * - When the workspace closes, each stand-in still exactly as it was made goes
 *   once no mount namespace holds it ({@link removeStandIns}).
 *
 * A path git tracks is the project's own and is never touched.
 */
import type { Stats } from "node:fs";
import {
  chmod,
  lstat,
  readdir,
  readFile,
  realpath,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { relative } from "node:path";
import type { WorkspaceRef } from "@cawco/core";
import { mountedAnywhere } from "@cawco/core/mount-table";
import { projectClaudeDir } from "@cawco/core/paths";
import { type CloneDeny, cloneDenies } from "@cawco/core/workspace-policy";
import { gitIn } from "./checkout-exclude";

/**
 * A mount point a sandbox left on the host, by srt's own test
 * (`isStaleBwrapMountPoint`, linux-sandbox-utils.ts at 0.0.79), as the host
 * tests it (`leftMountPoint`): an empty regular file with no write bits and
 * one link, as bwrap makes it.
 */
const leftMountPoint = (found: Stats): boolean =>
  found.isFile() &&
  found.size === 0 &&
  // biome-ignore lint/suspicious/noBitwiseOperators: a file mode's write bits, tested as srt tests them
  (found.mode & 0o222) === 0 &&
  found.nlink === 1;

const statOf = (path: string): Promise<Stats | undefined> =>
  lstat(path).catch(() => undefined);

interface Found extends CloneDeny {
  readonly found: Stats;
}

/** The clone's deny paths with a stand-in that git does not track and that are there now. */
const presentIn = async (path: string): Promise<Found[]> => {
  const clone = await realpath(path);
  const denies = cloneDenies(clone).filter(
    ({ empty }) => empty.kind !== "none"
  );
  const listed = await gitIn(clone, [
    "ls-files",
    "-z",
    "--",
    ...denies.map((deny) => relative(clone, deny.path)),
  ]);
  if (listed === undefined) {
    throw new Error(`${clone}: git could not say which deny paths it tracks`);
  }
  const tracked = listed
    .split("\0")
    .filter(Boolean)
    .map((file) => `${clone}/${file}`);
  const present = await Promise.all(
    denies
      .filter(
        (deny) =>
          !tracked.some(
            (file) => file === deny.path || file.startsWith(`${deny.path}/`)
          )
      )
      .map(async (deny) => {
        const found = await statOf(deny.path);
        return found ? { ...deny, found } : undefined;
      })
  );
  return present.filter((one): one is Found => one !== undefined);
};

/**
 * Writes each file's stand-in into the mount point a sandbox left at its
 * path, in place, so a sandbox still holding it keeps its bind. Answers
 * whether a mount point is left where a dir stands in.
 */
export const rewriteLeftFiles = async (ref: WorkspaceRef): Promise<boolean> => {
  let dirs = false;
  for (const { path, empty, found } of await presentIn(ref.path)) {
    if (!leftMountPoint(found)) {
      continue;
    }
    if (empty.kind === "file") {
      // biome-ignore lint/performance/noAwaitInLoops: a few files, each written in turn
      await chmod(path, 0o644);
      await writeFile(path, empty.text, { flag: "r+" });
    } else {
      dirs = true;
    }
  }
  return dirs;
};

/** Whether a sandbox left a mount point, a file, where a dir stands in. */
export const hasLeftDirs = async (clone: string): Promise<boolean> =>
  (await presentIn(clone)).some(
    ({ empty, found }) => empty.kind === "dir" && leftMountPoint(found)
  );

/** Whether `found` at `path` is exactly its stand-in: the file's text, or an empty dir. */
const asMade = async ({ path, empty, found }: Found): Promise<boolean> => {
  if (empty.kind === "dir") {
    return (
      found.isDirectory() &&
      (await readdir(path).catch(() => ["?"])).length === 0
    );
  }
  return (
    empty.kind === "file" &&
    found.isFile() &&
    (await readFile(path, "utf8").catch(() => undefined)) === empty.text
  );
};

/**
 * Takes away each stand-in in the clone that is still exactly as it was made,
 * and each mount point a sandbox left, then the project's Claude Code dir if
 * that leaves it empty. Run once the workspace's sandboxes are gone; one that
 * any mount namespace still holds stays all the same ({@link mountedAnywhere}),
 * and so does one a host tool has written since.
 */
export const removeStandIns = async (ref: WorkspaceRef): Promise<void> => {
  if (!(await statOf(ref.path))) {
    return;
  }
  for (const one of await presentIn(ref.path)) {
    const goes =
      !mountedAnywhere(one.path) &&
      // biome-ignore lint/performance/noAwaitInLoops: one path at a time
      (leftMountPoint(one.found) || (await asMade(one)));
    if (goes) {
      await (one.found.isDirectory() ? rmdir(one.path) : rm(one.path));
    }
  }
  const claude = projectClaudeDir(await realpath(ref.path));
  if (
    (await statOf(claude))?.isDirectory() &&
    (await readdir(claude)).length === 0 &&
    !mountedAnywhere(claude)
  ) {
    await rmdir(claude);
  }
};

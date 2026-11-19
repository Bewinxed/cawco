/**
 * What each harness's carry of a moved folder's conversations shares
 * (harness.ts `FolderCarry`): the job's scratch dir for it, and a file or
 * folder filed at its new place, never over anything standing there.
 */
import { cp, lstat, readdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { errnoCode, unlessGone } from "@cawco/core/absent";
import { makeFolder } from "@cawco/core/folders";
import { cawcoDataDir } from "@cawco/core/paths/roots";
import { removeTree } from "./remove-tree";

/** A move's scratch dir for the conversations it carries, on this machine. */
export const carryDir = (jobId: string): string =>
  join(cawcoDataDir(), "folder-moves", jobId, "carry");

/** Whether anything stands at `path`. */
export const stands = async (path: string): Promise<boolean> =>
  !!(await lstat(path).catch(() => undefined));

/** `from` filed at `to`, its folder made; something standing at `to` is never replaced. */
export const fileAt = async (from: string, to: string): Promise<void> => {
  if (await stands(to)) {
    throw new Error(`${to} is there already, so ${from} stays where it is.`);
  }
  await makeFolder(dirname(to));
  try {
    await rename(from, to);
  } catch (error) {
    if (errnoCode(error) !== "EXDEV") {
      throw error;
    }
    await cp(from, to, {
      recursive: true,
      preserveTimestamps: true,
      verbatimSymlinks: true,
    });
    await removeTree(from);
  }
};

/**
 * What arrived for one session (`mine`) filed entry by entry: each at
 * `placeOf` its path, an entry being what lies `depth` names deep (a
 * harness's own entries: Claude's under its roots, a dated rollout file).
 */
export const fileReceived = async (
  mine: string,
  depth: (rel: string) => number,
  placeOf: (rel: string) => string
): Promise<void> => {
  const place = async (rel: string): Promise<void> => {
    const at = join(mine, ...rel.split("/"));
    const info = await lstat(at);
    if (info.isDirectory() && rel.split("/").length < depth(rel)) {
      for (const name of await readdir(at)) {
        await place(`${rel}/${name}`);
      }
      return;
    }
    await fileAt(at, placeOf(rel));
  };
  for (const name of await readdir(mine).catch(unlessGone<string[]>([]))) {
    await place(name);
  }
};

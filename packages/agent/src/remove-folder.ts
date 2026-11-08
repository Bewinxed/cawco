/**
 * A folder of a project deleted for good, removed from this machine (core
 * `CONTROL_REMOVE_FOLDER`, hub project-delete.ts). The hub has held the
 * path to the project's own recorded places, refusing one another live
 * project shares; this machine holds it to its own floor besides: nothing
 * that is not absolute, its root, its home or a folder holding it, and
 * nothing of CawCo's own dirs (a folder in them, or one holding them). A
 * carry must stand inside the carries dir. A link goes as the link
 * (remove-tree.ts), so nothing past it is touched.
 */
import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, normalize, relative, sep } from "node:path";
import type { FolderRemoved, RemoveFolder } from "@cawco/core/harness";
import { cawcoConfigDir, cawcoDataDir } from "@cawco/core/paths/cawco";
import { workspaceCarriesDir } from "@cawco/core/paths/workspace";
import { removeTree } from "./remove-tree";

/** Whether `inner` is `outer` or inside it. */
const within = (inner: string, outer: string): boolean => {
  const way = relative(outer, inner);
  return (
    way === "" ||
    !(way === ".." || way.startsWith(`..${sep}`) || isAbsolute(way))
  );
};

/** What a machine holds back from any removal: its home, CawCo's own dirs, and where carries live. */
export interface MachineFloor {
  carries: string;
  home: string;
  own: string[];
}

/** This machine's floor, read now. */
const machineFloor = (): MachineFloor => {
  const home = homedir();
  return {
    carries: workspaceCarriesDir(),
    home,
    own: [join(home, ".cawco"), cawcoDataDir(), cawcoConfigDir()],
  };
};

/** What a machine refuses to remove for a project, in words; undefined when the path may go. */
export const removalRefusal = (
  asked: RemoveFolder,
  floor: MachineFloor = machineFloor()
): string | undefined => {
  if (typeof asked.path !== "string" || !isAbsolute(asked.path)) {
    return `${String(asked.path)} is not an absolute path, so it was not removed.`;
  }
  const path = normalize(asked.path);
  if (asked.kind === "carry") {
    return within(path, floor.carries) && path !== floor.carries
      ? undefined
      : `${path} is not a carry in ${floor.carries}, so it was not removed.`;
  }
  if (within(floor.home, path)) {
    return `${path} is this machine's root, its home or a folder holding it, so it was not removed.`;
  }
  const theirs = floor.own.find(
    (dir) => within(path, dir) || within(dir, path)
  );
  return theirs
    ? `${path} is CawCo's own folder ${theirs} or holds it, so it was not removed.`
    : undefined;
};

/** Removes the folder `asked` names, once {@link removalRefusal} lets it; false when nothing stood there. */
export const removeFolder = async (
  asked: RemoveFolder,
  floor: MachineFloor = machineFloor()
): Promise<FolderRemoved> => {
  const refusal = removalRefusal(asked, floor);
  if (refusal) {
    throw new Error(refusal);
  }
  const path = normalize(asked.path);
  if (!(await lstat(path).catch(() => undefined))) {
    return { removed: false };
  }
  await removeTree(path);
  console.info(
    `[remove-folder] ${asked.kind} ${path} removed: its project was deleted for good`
  );
  return { removed: true };
};

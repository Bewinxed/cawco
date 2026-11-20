/**
 * A folder of a project deleted for good, removed from this machine (core
 * `CONTROL_REMOVE_FOLDER`, hub project-delete.ts), and the question the hub
 * asks of every such removal before the first runs (core
 * `CONTROL_REMOVE_FOLDER_REFUSAL`): both answer by {@link removalRefusal},
 * so what the hub is told may go is what goes. The hub has held the path to
 * the project's own recorded places, the checkouts CawCo made, refusing one
 * another live project shares; this machine holds it to its own floor
 * besides: nothing that is not absolute, its root, its home or a folder
 * holding it, and nothing of CawCo's own dirs (a folder in them, or one
 * holding them). A place goes only while the folder at its path is still
 * the one CawCo made there (made-folders.ts). A carry must stand inside the
 * carries dir. A link goes as the link (remove-tree.ts), so nothing past it
 * is touched.
 */
import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, normalize, relative, sep } from "node:path";
import { cawcoConfigDir, cawcoDataDir } from "@cawco/core/paths/roots";
import { workspaceCarriesDir } from "@cawco/core/paths/workspace";
import { unhandled } from "@cawco/core/unhandled";
import type {
  FolderRemoved,
  RemoveFolder,
} from "@cawco/core/workspace/controls";
import { forgetMade, madeStanding } from "./made-folders";
import { removeTree } from "./remove-tree";

/** Whether `inner` is `outer` or inside it. */
export const within = (inner: string, outer: string): boolean => {
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
export const machineFloor = (): MachineFloor => {
  const home = homedir();
  return {
    carries: workspaceCarriesDir(),
    home,
    own: [join(home, ".cawco"), cawcoDataDir(), cawcoConfigDir()],
  };
};

/** Why a place's folder is not CawCo's to remove, by what stands at its path; undefined when it may go. */
const madeRefusal = async (path: string): Promise<string | undefined> => {
  let standing: Awaited<ReturnType<typeof madeStanding>>;
  try {
    standing = await madeStanding(path);
  } catch (error) {
    return `CawCo's record of the folders it made does not read (${error instanceof Error ? error.message : String(error)})`;
  }
  switch (standing) {
    case "gone":
    case "made":
      return;
    case "unrecorded":
      return "CawCo has no record of making it";
    case "replaced":
      return "the folder there now is not the one CawCo made";
    default:
      return unhandled("made folder's standing", standing);
  }
};

/**
 * Why this machine refuses to remove what `asked` names, as a clause; undefined
 * when it may go (nothing standing there may go too). The one rule of the
 * hub's question and of the removal.
 */
export const removalRefusal = async (
  asked: RemoveFolder,
  floor: MachineFloor = machineFloor()
): Promise<string | undefined> => {
  if (typeof asked.path !== "string" || !isAbsolute(asked.path)) {
    return "its path is not absolute";
  }
  const path = normalize(asked.path);
  if (asked.kind === "carry") {
    return within(path, floor.carries) && path !== floor.carries
      ? undefined
      : `it is not a carry in ${floor.carries}`;
  }
  if (within(floor.home, path)) {
    return "it is this machine's root, its home or a folder holding it";
  }
  const theirs = floor.own.find(
    (dir) => within(path, dir) || within(dir, path)
  );
  return theirs
    ? `it is CawCo's own folder ${theirs} or holds it`
    : await madeRefusal(path);
};

/** Removes the folder `asked` names, once {@link removalRefusal} lets it; false when nothing stood there. */
export const removeFolder = async (
  asked: RemoveFolder,
  floor: MachineFloor = machineFloor()
): Promise<FolderRemoved> => {
  const refusal = await removalRefusal(asked, floor);
  if (refusal) {
    throw new Error(refusal);
  }
  const path = normalize(asked.path);
  if (!(await lstat(path).catch(() => undefined))) {
    return { removed: false };
  }
  await removeTree(path);
  if (asked.kind === "place") {
    await forgetMade(path);
  }
  console.info(
    `[remove-folder] ${asked.kind} ${path} removed: its project was deleted for good`
  );
  return { removed: true };
};

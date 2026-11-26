/**
 * The folders this machine made for a project: a move's clone that put one
 * where nothing stood (move.ts `cloneStep`). Each is kept by its path with
 * its identity on disk as it was made, its device, inode and birth time,
 * in CawCo's data dir (core `madeFoldersPath`); nothing is written into the
 * folder. A delete with its files removes such a folder only while the
 * folder at its path is still that one (remove-folder.ts): one put there
 * since, by the person or anything else, is not CawCo's, whatever its path.
 * Steam's launcher once removed by a path it held after the person had
 * moved its folder, and erased everything the person owned
 * (ValveSoftware/steam-for-linux#3671).
 */
import { lstat } from "node:fs/promises";
import { normalize } from "node:path";
import { makeLock } from "@cawco/core/keyed-lock";
import { madeFoldersPath } from "@cawco/core/paths/cawco";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { MadeFoldersSchema } from "./stored-shapes";

/** A made folder's identity on disk, as `lstat` read it once it was made: big numbers as their decimal strings. */
export interface MadeFolder {
  /** When it was recorded, ms since the epoch. */
  at: number;
  /** Its birth time, in nanoseconds; "0" where the filesystem keeps none. */
  born: string;
  dev: string;
  ino: string;
}

/** `made-folders.json`: each made folder by its normalised absolute path. */
export interface MadeFolders {
  folders: Record<string, MadeFolder>;
}

/** The identity of what stands at `path` (a link as the link), or undefined when nothing does. */
const identityAt = async (
  path: string
): Promise<Omit<MadeFolder, "at"> | undefined> => {
  const info = await lstat(path, { bigint: true }).catch(() => undefined);
  return (
    info && {
      born: String(info.birthtimeNs),
      dev: String(info.dev),
      ino: String(info.ino),
    }
  );
};

/** The record; none yet reads as empty. One that does not read throws, naming its file. */
const readMade = async (): Promise<MadeFolders> =>
  (await readRecord(madeFoldersPath(), MadeFoldersSchema)) ?? { folders: {} };

const writes = makeLock();

/** `change` made to the record, one write at a time, so none is lost; what `change` answers. */
const changeMade = <T>(
  change: (file: MadeFolders) => { file: MadeFolders; out: T }
): Promise<T> =>
  writes.run(async () => {
    const { file, out } = change(await readMade());
    await writeStateFile(
      madeFoldersPath(),
      `${JSON.stringify(file, null, 2)}\n`
    );
    return out;
  });

/**
 * Records the folder at `path` as made by CawCo, as it stands now; whether
 * it was recorded. A failure is said, never thrown: the folder then counts
 * as one CawCo did not make, and a delete leaves it on disk.
 */
export const recordMade = async (path: string): Promise<boolean> => {
  const key = normalize(path);
  const identity = await identityAt(key);
  if (!identity) {
    return false;
  }
  try {
    await changeMade((file) => ({
      file: {
        folders: { ...file.folders, [key]: { ...identity, at: Date.now() } },
      },
      out: undefined,
    }));
    return true;
  } catch (error) {
    console.warn(
      `[made-folders] ${key} was made, but not recorded as CawCo's, so a delete leaves it on disk: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
};

/** What stands at a path against the record of the folder CawCo made there. */
export type MadeStanding =
  /** Nothing stands there. */
  | "gone"
  /** The folder CawCo made, as it made it. */
  | "made"
  /** Something else stands there now. */
  | "replaced"
  /** CawCo has no record of making a folder there. */
  | "unrecorded";

/** What stands at `path` against the record; a record that does not read throws. */
export const madeStanding = async (path: string): Promise<MadeStanding> => {
  const key = normalize(path);
  const standing = await identityAt(key);
  if (!standing) {
    return "gone";
  }
  const made = (await readMade()).folders[key];
  if (!made) {
    return "unrecorded";
  }
  return made.dev === standing.dev &&
    made.ino === standing.ino &&
    made.born === standing.born
    ? "made"
    : "replaced";
};

/** The record of the folder CawCo made at `path` dropped, once it is removed; a failure is said. */
export const forgetMade = async (path: string): Promise<void> => {
  const key = normalize(path);
  try {
    await changeMade((file) => {
      const { [key]: _gone, ...folders } = file.folders;
      return { file: { folders }, out: undefined };
    });
  } catch (error) {
    console.warn(
      `[made-folders] ${key} was removed, but its record stays: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * The record of the folder CawCo made at `from` moved to `to`, as a rename
 * moved the folder itself (folder-move.ts): its identity on disk is the one
 * it was made with, so a delete still knows it. Nothing recorded at `from`
 * moves nothing; a failure is said.
 */
export const moveMade = async (from: string, to: string): Promise<void> => {
  const was = normalize(from);
  const now = normalize(to);
  try {
    await changeMade((file) => {
      const { [was]: made, ...folders } = file.folders;
      return {
        file: { folders: made ? { ...folders, [now]: made } : file.folders },
        out: undefined,
      };
    });
  } catch (error) {
    console.warn(
      `[made-folders] ${was} moved to ${now}, but its record stays at the old path: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

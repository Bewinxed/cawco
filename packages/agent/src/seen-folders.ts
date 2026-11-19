/**
 * Each project checkout's folder as this machine last saw it standing: by
 * its path, its identity on disk (device, inode and birth time), kept in
 * CawCo's data dir (core `seenFoldersPath`); nothing is written into the
 * folder. Recorded each time the hub reads whether the checkout's folder
 * stands (core `CONTROL_FOLDERS_STAND`), so once a folder is moved or
 * renamed by hand within its disk, the folder found at its new path is
 * known as the same one (Locate folder, core `CONTROL_FOLDER_LOOK`): a
 * rename keeps all three, as Time Machine's sticky exclusion "follows a
 * file or directory" (tmutil(8)). A folder made again at the old path, or
 * a copy, has another inode or birth time.
 */
import { stat } from "node:fs/promises";
import { normalize } from "node:path";
import { seenFoldersPath } from "@cawco/core/paths/cawco";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { SeenFoldersSchema } from "./stored-shapes";

/** A folder's identity on disk, as `stat` read it: big numbers as their decimal strings. */
export interface SeenFolder {
  /** When it was recorded, ms since the epoch. */
  at: number;
  /** Its birth time, in nanoseconds; "0" where the filesystem keeps none. */
  born: string;
  dev: string;
  ino: string;
}

/** `seen-folders.json`: each checkout's folder by its normalised absolute path. */
export interface SeenFolders {
  folders: Record<string, SeenFolder>;
}

/** The identity of the folder at `path` (a link to one as that folder), or undefined when no folder stands there. */
const folderIdentity = async (
  path: string
): Promise<Omit<SeenFolder, "at"> | undefined> => {
  const info = await stat(path, { bigint: true }).catch(() => undefined);
  return info?.isDirectory()
    ? {
        born: String(info.birthtimeNs),
        dev: String(info.dev),
        ino: String(info.ino),
      }
    : undefined;
};

/** The record; none yet, or one that does not read, reads as empty: it only ever tells, never refuses. */
const readSeen = async (): Promise<SeenFolders> =>
  (await readRecord(seenFoldersPath(), SeenFoldersSchema).catch(
    () => undefined
  )) ?? { folders: {} };

let writes: Promise<unknown> = Promise.resolve();

/**
 * Whether a folder stands at each of `paths`, in their order, each one
 * that does recorded as it stands now. A record that could not be written
 * is said, never thrown: the answer stands either way.
 */
export const foldersStand = async (
  paths: readonly string[]
): Promise<boolean[]> => {
  const seen = await Promise.all(
    paths.map(async (path) => {
      const key = normalize(path);
      return { key, identity: await folderIdentity(key) };
    })
  );
  const standing = seen.filter((one) => one.identity !== undefined);
  if (standing.length > 0) {
    const run = writes.then(async () => {
      const file = await readSeen();
      const at = Date.now();
      for (const { key, identity } of standing) {
        if (identity) {
          file.folders[key] = { ...identity, at };
        }
      }
      await writeStateFile(
        seenFoldersPath(),
        `${JSON.stringify(file, null, 2)}\n`
      );
    });
    writes = run.catch((error: unknown) =>
      console.warn(
        `[seen-folders] the checkouts' folders stand, but were not recorded: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    await writes;
  }
  return seen.map((one) => one.identity !== undefined);
};

/**
 * Whether the folder at `path` is the one last seen standing at `was`:
 * the same device, inode and birth time. Null when no folder was recorded
 * at `was`, or none stands at `path`.
 */
export const sameFolderAs = async (
  path: string,
  was: string
): Promise<boolean | null> => {
  const now = await folderIdentity(normalize(path));
  const then = (await readSeen()).folders[normalize(was)];
  if (!(now && then)) {
    return null;
  }
  return (
    now.dev === then.dev &&
    now.ino === then.ino &&
    (now.born === "0" || then.born === "0" || now.born === then.born)
  );
};

/** A folder stands at `path` (a link to one counts). */
export const folderStands = async (path: string): Promise<boolean> =>
  (await folderIdentity(normalize(path))) !== undefined;

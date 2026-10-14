/**
 * THE ONE WAY CawCo WRITES A FILE IT KEEPS, AND READS ONE BACK.
 *
 * A machine that loses power with a file half written keeps whatever the
 * disk held: on 2026-10-14 obelisk hung and was reset, and a workspace's
 * `create.json` came back as 53 NUL bytes (allocated, never flushed). Every
 * spawn read every workspace's `create.json`, so that one record failed
 * every spawn on the machine.
 *
 * So every file CawCo keeps (its records, configs, scripts, stores, and what
 * it writes for a harness to read) is written here: whole into a temporary
 * file beside it, flushed to the disk, renamed over the target, and the
 * directory flushed so the rename itself survives. A crash at any instant
 * leaves the old content or the new, never a mix and never NULs. On ext4,
 * APFS and the rest a rename within one directory is atomic, and the fsync
 * before it is what makes the new content's blocks reach the disk before the
 * name points at them.
 *
 * And every record CawCo reads back goes through {@link readRecord}: a file
 * that is there but does not parse (NULs, a cut-off write from before this
 * module, a hand edit) is a {@link DamagedRecord} that names the file and
 * why, so a reader over many records skips that one and says so, and the
 * rest proceed.
 */
import { randomUUID } from "node:crypto";
import {
  closeSync,
  fchmodSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { link, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export interface StateWriteOptions {
  /**
   * Places the file only where nothing is (a hard link, which fails with
   * `EEXIST` on an existing path, where a rename would replace it).
   */
  exclusive?: boolean;
  /** The file's exact mode, umask or not; absent, a new file's default (0o666 under the umask). */
  mode?: number;
  /**
   * Where the temporary file is made, when not beside the target: a folder
   * on the same disk whose stray files nothing reads (a project folder's
   * `.git`, beside a tree whose every file is committed).
   */
  scratchDir?: string;
}

const DEFAULT_MODE = 0o666;

const temporaryFor = (path: string, scratchDir?: string): string =>
  join(
    scratchDir ?? dirname(path),
    `.${basename(path)}.cawco-${process.pid}-${randomUUID().slice(0, 8)}.tmp`
  );

const TEMPORARY = /^\.(.+)\.cawco-(\d+)-[0-9a-f]{8}\.tmp$/;

/** The name of the file a temporary one of this module's is becoming; undefined for any other name. */
export const stateTemporaryTarget = (name: string): string | undefined =>
  TEMPORARY.exec(name)?.[1];

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

/**
 * Whether `name` is a write that never finished: a temporary file of this
 * module's whose writer is gone (a crash, a SIGKILL). Nothing reads one, and
 * the agent's sweep removes it.
 */
export const isStrayTemporary = (name: string): boolean => {
  const pid = TEMPORARY.exec(name)?.[2];
  return pid !== undefined && !alive(Number(pid));
};

const toBytes = (data: string | Uint8Array): Uint8Array =>
  typeof data === "string" ? Buffer.from(data) : data;

/** Flushes a directory, so a rename or link made in it survives a crash. */
const syncDir = async (dir: string): Promise<void> => {
  const handle = await open(dir, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const syncDirSync = (dir: string): void => {
  const fd = openSync(dir, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
};

/**
 * Writes `data` to `path` whole or not at all, and durably (module doc),
 * its folder made first when it is not there.
 */
export const writeStateFile = async (
  path: string,
  data: string | Uint8Array,
  options: StateWriteOptions = {}
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = temporaryFor(path, options.scratchDir);
  const handle = await open(temporary, "wx", options.mode ?? DEFAULT_MODE);
  try {
    try {
      await handle.writeFile(toBytes(data));
      if (options.mode !== undefined) {
        await handle.chmod(options.mode);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (options.exclusive) {
      await link(temporary, path);
      await unlink(temporary);
    } else {
      await rename(temporary, path);
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  await syncDir(dirname(path));
};

/**
 * {@link writeStateFile} for content too large to hold in memory, which its
 * writer has streamed into `temporary` (on `path`'s disk) and closed:
 * flushed, renamed over `path`, and the directory flushed.
 */
export const placeStreamedFile = async (
  temporary: string,
  path: string
): Promise<void> => {
  const handle = await open(temporary, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await mkdir(dirname(path), { recursive: true });
  await rename(temporary, path);
  await syncDir(dirname(path));
};

/** {@link writeStateFile}, synchronously: for the few writers that cannot wait. */
export const writeStateFileSync = (
  path: string,
  data: string | Uint8Array,
  options: StateWriteOptions = {}
): void => {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = temporaryFor(path, options.scratchDir);
  const fd = openSync(temporary, "wx", options.mode ?? DEFAULT_MODE);
  try {
    try {
      writeFileSync(fd, toBytes(data));
      if (options.mode !== undefined) {
        fchmodSync(fd, options.mode);
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (options.exclusive) {
      linkSync(temporary, path);
      unlinkSync(temporary);
    } else {
      renameSync(temporary, path);
    }
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // Already gone, or never made.
    }
    throw error;
  }
  syncDirSync(dirname(path));
};

/**
 * A record that is on disk and cannot be read as what it is: which file, and
 * why. What it belonged to does not run, and says so; nothing guesses what
 * it held.
 */
export class DamagedRecord extends Error {
  readonly file: string;
  readonly reason: string;
  constructor(file: string, reason: string, options?: { cause?: unknown }) {
    super(`${file} is damaged (${reason})`, options);
    this.name = "DamagedRecord";
    this.file = file;
    this.reason = reason;
  }
}

export const isDamagedRecord = (error: unknown): error is DamagedRecord =>
  error instanceof DamagedRecord;

const NUL = "\0";

/** What a record's text says is wrong with it, or nothing. */
const textProblem = (text: string): string | undefined => {
  if (text.length === 0) {
    return "it is empty";
  }
  if (text.includes(NUL)) {
    return text.replaceAll(NUL, "").length === 0
      ? `it is ${Buffer.byteLength(text)} NUL bytes`
      : "it holds NUL bytes";
  }
};

/** `text`, a JSON record read from `file`, parsed; a {@link DamagedRecord} when it does not parse. */
export const parseRecord = <T>(file: string, text: string): T => {
  const problem = textProblem(text);
  if (problem) {
    throw new DamagedRecord(file, problem);
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the cause is passed, in the options third argument
    throw new DamagedRecord(
      file,
      error instanceof Error ? error.message : String(error),
      { cause: error }
    );
  }
};

/** `text`, a one-value text record (a pid, an id), checked whole. */
export const checkTextRecord = (file: string, text: string): string => {
  const problem = textProblem(text);
  if (problem) {
    throw new DamagedRecord(file, problem);
  }
  return text;
};

const absent = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

/**
 * The JSON record at `file`: undefined when there is none, a
 * {@link DamagedRecord} when there is one that does not parse, and any other
 * read failure as it is.
 */
export const readRecord = async <T>(file: string): Promise<T | undefined> => {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (absent(error)) {
      return;
    }
    throw error;
  }
  return parseRecord<T>(file, text);
};

/** {@link readRecord}, synchronously. */
export const readRecordSync = <T>(file: string): T | undefined => {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (absent(error)) {
      return;
    }
    throw error;
  }
  return parseRecord<T>(file, text);
};

/** The one-value text record at `file` ({@link checkTextRecord}); undefined when there is none. */
export const readTextRecord = async (
  file: string
): Promise<string | undefined> => {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (absent(error)) {
      return;
    }
    throw error;
  }
  return checkTextRecord(file, text);
};

/** {@link readTextRecord}, synchronously. */
export const readTextRecordSync = (file: string): string | undefined => {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (absent(error)) {
      return;
    }
    throw error;
  }
  return checkTextRecord(file, text);
};

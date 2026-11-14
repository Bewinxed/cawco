import { unhandled } from "@cawco/core/unhandled";
import { readJsonOnDisk, writeOnDisk } from "./json-on-disk";

/**
 * The largest JSON file {@link readJson} reads: the files it reads are
 * records and configs of kilobytes (OpenCode's config, Claude Code's plugin
 * registry, CawCo's sidecars); one past this is no such file. Our call.
 */
const JSON_FILE_LIMIT = 32 * 1024 * 1024;

/** A JSON file that is there and was not read, and why (json-on-disk.ts). */
export class UnreadJson extends Error {
  constructor(path: string, why: string) {
    super(`${path} is there but couldn't be read: ${why}`);
    this.name = "UnreadJson";
  }
}

/**
 * The JSON file at `path`: its value, or undefined when nothing is there (or
 * the file is empty). One that is there and could not be read (a pipe, a
 * folder, a link to nothing or a loop, past {@link JSON_FILE_LIMIT}, not
 * readable, not JSON) throws {@link UnreadJson}: it is never answered as
 * nothing there, which a caller would write over. Read stat first, as every
 * JSON file is (json-on-disk.ts), so a pipe is never opened.
 */
export const readJson = async <T>(path: string): Promise<T | undefined> => {
  const read = await readJsonOnDisk(path, JSON_FILE_LIMIT);
  switch (read.state) {
    case "absent":
      return undefined;
    case "read":
      return read.value as T | undefined;
    case "unread":
      throw new UnreadJson(path, read.why);
    default:
      unhandled("read", read);
  }
};

/** {@link readJson}, with a file there and unread said on the log (`said` after why) and answered as undefined. */
const readOrSay = async <T>(
  path: string,
  said: string
): Promise<T | undefined> => {
  try {
    return await readJson<T>(path);
  } catch (error) {
    if (!(error instanceof UnreadJson)) {
      throw error;
    }
    console.warn(`[records] ${error.message}; ${said}`);
    return undefined;
  }
};

/**
 * {@link readJson} of a file CawCo keeps and writes whole (a sidecar, a
 * record, a cache): one there and unread is as never written, said on the
 * log with why, and the next write puts a whole one in its place.
 */
export const readOwnJson = <T>(path: string): Promise<T | undefined> =>
  readOrSay<T>(path, "read as never written");

/**
 * {@link readJson} of a file that is the person's (or another program's)
 * and that a step edits only when it read it: one there and unread is said
 * on the log with why, and the step (`step`) leaves it as it is, to run
 * again at its next turn. Undefined then, as for nothing there: the caller
 * writes only over a file it read.
 */
export const readJsonOrLeave = <T>(
  path: string,
  step: string
): Promise<T | undefined> => readOrSay<T>(path, `${step} left it as it is`);

/**
 * Written whole and moved into place — a half-written config is a broken
 * machine: `~/.claude.json` is read by every Claude Code on this machine, and
 * a half-written one is a machine with no MCP servers and no history. Through
 * a symlink to the file it names (json-on-disk.ts `writeOnDisk`).
 */
export const writeJson = (path: string, value: unknown): Promise<void> =>
  writeOnDisk(path, JSON.stringify(value, null, 2));

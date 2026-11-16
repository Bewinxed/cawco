import { unhandled } from "@cawco/core/unhandled";
import { toolWords } from "@cawco/core/words/tools";
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

/** How a JSON file's value is read: its value as the type it holds, or undefined when it is not one. */
export type JsonReader<T> = (value: unknown) => T | undefined;

/**
 * The JSON file at `path`, as `read` reads it: its value, or undefined when
 * nothing is there (or the file is empty). One that is there and could not
 * be read (a pipe, a folder, a link to nothing or a loop, past
 * {@link JSON_FILE_LIMIT}, not readable, not JSON, or JSON `read` does not
 * read) throws {@link UnreadJson}: it is never answered as nothing there,
 * which a caller would write over. Read stat first, as every JSON file is
 * (json-on-disk.ts), so a pipe is never opened.
 */
export const readJson = async <T>(
  path: string,
  read: JsonReader<T>
): Promise<T | undefined> => {
  const found = await readJsonOnDisk(path, JSON_FILE_LIMIT);
  switch (found.state) {
    case "absent":
      return undefined;
    case "read": {
      if (found.value === undefined) {
        return undefined;
      }
      const value = read(found.value);
      if (value === undefined) {
        throw new UnreadJson(path, toolWords.jsonNotItsShape);
      }
      return value;
    }
    case "unread":
      throw new UnreadJson(path, found.why);
    default:
      unhandled("read", found);
  }
};

/** {@link readJson}, with a file there and unread said on the log (`said` after why) and answered as undefined. */
const readOrSay = async <T>(
  path: string,
  read: JsonReader<T>,
  said: string
): Promise<T | undefined> => {
  try {
    return await readJson(path, read);
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
export const readOwnJson = <T>(
  path: string,
  read: JsonReader<T>
): Promise<T | undefined> => readOrSay(path, read, "read as never written");

/**
 * {@link readJson} of a file that is the person's (or another program's)
 * and that a step edits only when it read it: one there and unread is said
 * on the log with why, and the step (`step`) leaves it as it is, to run
 * again at its next turn. Undefined then, as for nothing there: the caller
 * writes only over a file it read.
 */
export const readJsonOrLeave = <T>(
  path: string,
  read: JsonReader<T>,
  step: string
): Promise<T | undefined> => readOrSay(path, read, `${step} left it as it is`);

/**
 * Written whole and moved into place — a half-written config is a broken
 * machine: `~/.claude.json` is read by every Claude Code on this machine, and
 * a half-written one is a machine with no MCP servers and no history. Through
 * a symlink to the file it names (json-on-disk.ts `writeOnDisk`).
 */
export const writeJson = (path: string, value: unknown): Promise<void> =>
  writeOnDisk(path, JSON.stringify(value, null, 2));

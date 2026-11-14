/**
 * THE ONE WAY THE AGENT READS AND WRITES A JSON FILE ON DISK: Claude Code's
 * settings (claude-settings-file.ts), and every other JSON file it keeps or
 * edits (json-file.ts `readJson`, `writeJson`).
 *
 * A read tells three answers apart, and only one of them is "nothing there":
 * - `absent`: nothing is at the path (ENOENT), or a file stands where its
 *   folder would (ENOTDIR);
 * - `read`: a regular file of up to the caller's limit, its text parsed;
 * - `unread`: there and not read, with why. A file at mode 000, in a folder
 *   at mode 000, malformed, a folder, a pipe or a socket in its place, a
 *   symlink that loops or links to nothing, a file past the limit. It is
 *   looked at (`stat`) before it is opened, so only a regular file of a
 *   size the caller takes is ever opened: a read of a pipe waits for a
 *   writer, and an agent that read `~/.claude/settings.json` at its start
 *   while a pipe stood there never registered (host run 84ca5c0e).
 *
 * A write goes through a symlink to the file it names, whole into a
 * temporary file beside that file and renamed over it (core
 * `writeStateFile`), so a person's dotfiles link stays the link it was: a
 * rename over the link itself replaced it with a regular file.
 */
import { lstat, readFile, readlink, realpath, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { errnoCode, isGone } from "@cawco/core/absent";
import { writeStateFile } from "@cawco/core/state-file";
import { toolWords } from "@cawco/core/words/tools";

/** A JSON file as {@link readJsonOnDisk} found it: `text` is empty for an empty file, `value` then undefined. */
export type JsonOnDisk =
  | { state: "absent" }
  | { state: "read"; text: string; value: unknown }
  | { state: "unread"; why: string };

const errorWords = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Nothing at `path`, or a symlink there that names nothing: the second is there, and unread. */
const absentOrDangling = async (path: string): Promise<JsonOnDisk> => {
  const link = await lstat(path).catch(() => undefined);
  if (!link?.isSymbolicLink()) {
    return { state: "absent" };
  }
  const to = await readlink(path).catch(() => "");
  return { state: "unread", why: toolWords.fileLinksToNothing(to) };
};

/**
 * The JSON file at `path` ({@link JsonOnDisk}), of up to `limit` bytes. An
 * empty file reads with no value; what it means is the caller's.
 */
export const readJsonOnDisk = async (
  path: string,
  limit: number
): Promise<JsonOnDisk> => {
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch (error) {
    const code = errnoCode(error);
    if (code === "ENOENT") {
      return await absentOrDangling(path);
    }
    return code === "ENOTDIR"
      ? { state: "absent" }
      : { state: "unread", why: errorWords(error) };
  }
  if (!info.isFile()) {
    return { state: "unread", why: toolWords.settingsNotAFile };
  }
  if (info.size > limit) {
    return {
      state: "unread",
      why: toolWords.settingsTooLarge(info.size, limit),
    };
  }
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    return { state: "unread", why: errorWords(error) };
  }
  if (text.trim() === "") {
    return { state: "read", text, value: undefined };
  }
  try {
    return { state: "read", text, value: JSON.parse(text) };
  } catch (error) {
    return { state: "unread", why: errorWords(error) };
  }
};

/**
 * The file `path` names: itself, or through a symlink the file the link
 * names, followed to the end (`realpath`); a link to nothing yet, the path
 * it names.
 */
const fileAt = async (path: string): Promise<string> => {
  try {
    return await realpath(path);
  } catch (error) {
    if (!isGone(error)) {
      throw error;
    }
    const to = await readlink(path).catch(() => undefined);
    return to === undefined ? path : resolve(dirname(path), to);
  }
};

/** `text` written whole over the file `path` names ({@link fileAt}), through a link left as it is. */
export const writeOnDisk = async (path: string, text: string): Promise<void> =>
  writeStateFile(await fileAt(path), text);

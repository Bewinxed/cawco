/**
 * THE ONE WAY THE AGENT READS AND WRITES A CLAUDE CODE SETTINGS FILE: the
 * user's `~/.claude/settings.json`, a project's `.claude/settings.json` and
 * `settings.local.json`, and the server-managed `remote-settings.json`.
 *
 * A settings file is the person's: CawCo adds its own few keys to it and
 * keeps every other byte. So a read tells three answers apart, and only one
 * of them is "nothing there":
 * - `absent`: nothing is at the path (ENOENT), or a file stands where its
 *   folder would (ENOTDIR), as Claude Code's own engine takes a settings
 *   folder (`f==="ENOENT"||f==="ENOTDIR"`, the Agent SDK's bundle);
 * - `read`: a regular file of up to {@link SETTINGS_FILE_LIMIT} whose text
 *   is one JSON object (an empty one is `{}`, as the engine reads it);
 * - `unread`: there and not read, with why. A file at mode 000, in a folder
 *   at mode 000, malformed, a folder, a pipe or a socket in its place, a
 *   symlink loop or a link to nothing, a file too large. A pipe is never opened: a read of one
 *   waits for a writer, and an agent that read `settings.json` at its start
 *   while a pipe stood there never registered (host run 84ca5c0e).
 *
 * An unread file is never written over: a write would take the person's
 * settings (a symlink loop was replaced by a fresh file, after which the
 * one-time takeover read that file as the person's word), or fail on what
 * stands there (a rename over a folder, EISDIR). Its caller says why on the
 * log and skips its step, which runs again at its next turn. And a file
 * whose content would not change is not written at all.
 */
import { toolWords } from "@cawco/core/words/tools";
import { readJsonOnDisk, writeOnDisk } from "./json-on-disk";

/**
 * The largest settings file read: a settings file is a few kilobytes, and
 * one past this is no settings file anyone wrote by hand (a 200 MB one
 * stood in the host run's probes). Our call.
 */
const SETTINGS_FILE_LIMIT = 4 * 1024 * 1024;

/** A settings file as {@link readSettingsFile} found it. */
export type SettingsFile =
  | { state: "absent" }
  | { settings: Record<string, unknown>; state: "read" }
  | { state: "unread"; why: string };

/** A settings file that may be written: one read, or nothing there. */
export type WritableSettings = Exclude<SettingsFile, { state: "unread" }>;

/**
 * The settings file at `path` ({@link SettingsFile}), read as every JSON
 * file is (json-on-disk.ts: stat first, a regular file of a settings file's
 * size alone opened, a link to nothing or a loop unread), and one JSON
 * object; an empty file is no settings, as Claude Code's engine reads it
 * ("if(e.trim()==="")return {settings:{},errors:[],loadState:"loaded"}").
 */
export const readSettingsFile = async (path: string): Promise<SettingsFile> => {
  const read = await readJsonOnDisk(path, SETTINGS_FILE_LIMIT);
  if (read.state !== "read") {
    return read;
  }
  const { value } = read;
  if (value === undefined) {
    return { state: "read", settings: {} };
  }
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { state: "read", settings: value as Record<string, unknown> }
    : { state: "unread", why: toolWords.settingsNotAnObject };
};

/** What a settings file holds as read: its object, `{}` for nothing there. */
export const settingsOf = (read: WritableSettings): Record<string, unknown> =>
  read.state === "read" ? read.settings : {};

/**
 * `next` written over the settings file at `path` that {@link readSettingsFile}
 * found `read` (never an unread one: the type keeps it out), whole and moved
 * into place (json-on-disk.ts `writeOnDisk`): a half-written settings file
 * is a machine whose next `claude` starts with none of the person's
 * settings. A `settings.json` that is a symlink (a dotfiles repository's)
 * is written through: its target is replaced, the link stays.
 * Nothing is written when `next` is what the file holds already, or nothing
 * is there and `next` holds nothing. Whether it wrote.
 */
export const writeSettingsFile = async (
  path: string,
  read: WritableSettings,
  next: Record<string, unknown>
): Promise<boolean> => {
  if (JSON.stringify(next) === JSON.stringify(settingsOf(read))) {
    return false;
  }
  await writeOnDisk(path, JSON.stringify(next, null, 2));
  return true;
};

/**
 * The per-user socket dir on macOS and the short names under it (a Unix
 * socket path has a small length limit), shared by the fleet paths and
 * sessiond's endpoint.
 */

import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

/**
 * macOS's root for every workspace's sockets ({@link workspaceDoorDir}):
 * `/private/tmp/cawco-<uid>`, this user's own (0700, made and checked by the
 * agent before a socket goes in it, tool-door.ts `socketPlace`). A real path,
 * as the Seatbelt profile matches paths (`/tmp` is a link to it), and one
 * whose sockets a workspace reaches only by name: the profile denies every
 * socket under `/private/tmp` (boundary/runner.ts `LAUNCHD_SOCKETS`) but the doors
 * it names, and a workspace writes nothing there.
 */
export const darwinSocketRoot = (): string => {
  const uid = process.getuid?.();
  if (uid === undefined) {
    throw new Error("this process has no user id to name its socket dir by");
  }
  return join("/private/tmp", `cawco-${uid}`);
};

/**
 * {@link darwinSocketRoot}, made if it is not there (a restart clears
 * `/private/tmp`) and then taken only as this user's own: a dir, not a link,
 * owned by this uid, with no group or other bits. `/private/tmp` is every
 * local user's to write, so a root someone else made first (to read or stand
 * in for a workspace's doors, or to point a short name elsewhere) is refused
 * in words that say what to remove. Its path.
 */
export const ownSocketRoot = (): string => {
  const root = darwinSocketRoot();
  try {
    mkdirSync(root, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
  const found = lstatSync(root);
  // biome-ignore lint/suspicious/noBitwiseOperators: a mode's permission bits
  const mode = found.mode & 0o777;
  // Its group and other bits: none.
  const open = mode % 0o100 !== 0;
  if (!found.isDirectory() || found.uid !== process.getuid?.() || open) {
    throw new Error(
      `${root} is not this user's own dir (a ${found.isDirectory() ? "dir" : "link or file"} owned by uid ${found.uid}, mode ${mode.toString(8)}): remove it, and the agent makes it again`
    );
  }
  return root;
};

/**
 * macOS's short name for a dir whose path is too long to hold a socket's:
 * `<root>/<name>` in {@link ownSocketRoot}, a link to `target`, the dir
 * itself staying where it is. A socket bound or reached through it is the
 * file in `target`; only the path string handed to bind() and connect() is
 * short. Made, or made again (a restart clears `/private/tmp`), or pointed
 * back at `target`, before its path is returned, by whichever side asks
 * first. macOS's tmp_cleaner never takes it: it deletes regular files and
 * empty dirs three days old (`find … -type f … -delete`, `-type d … -empty`,
 * https://jrb.nz/posts/tmp-macos/), and a link is neither.
 */
export const shortLink = (name: string, target: string): string => {
  const link = join(ownSocketRoot(), name);
  const pointsAt = (): string | undefined => {
    try {
      return readlinkSync(link);
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === "ENOENT") {
        return;
      }
      if (code === "EINVAL") {
        throw new Error(
          `${link} is not a link (only this user writes ${darwinSocketRoot()}): remove it, and the agent makes the link again`,
          { cause: error }
        );
      }
      throw error;
    }
  };
  const found = pointsAt();
  if (found === target) {
    return link;
  }
  if (found !== undefined) {
    unlinkSync(link);
  }
  try {
    symlinkSync(target, link);
  } catch (error) {
    // Another process made it first: it is right if it names the same dir.
    if (
      (error as NodeJS.ErrnoException).code !== "EEXIST" ||
      pointsAt() !== target
    ) {
      throw error;
    }
  }
  return link;
};

/**
 * THE ONE WAY CawCo MAKES A FOLDER, AND THE MODE EACH OF ITS OWN GETS.
 *
 * Every folder CawCo makes goes through {@link makeFolder} or
 * {@link makeFolderSync}, which give each of CawCo's own folders they make
 * its mode by where it is ({@link folderMode}) whatever the process's umask,
 * set again where the umask took bits off. A bare `mkdir` is refused by lint
 * (scripts/lint/one-folder-maker.grit) everywhere in `packages/<pkg>/src/`
 * but here. A script CawCo writes that runs `mkdir` itself (a carry's steps,
 * a workspace's executor, a launchd job's start record) makes its folder
 * inside one of these, whose 0700 no other user passes; a launchd job that
 * starts before the agent ever ran may make `~/.cawco` itself, and the
 * agent's start brings it to its mode.
 *
 * CawCo's own folders ({@link ownRoots}) hold accounts and their sign-ins,
 * every workspace's state and scratch, the hub's database and project
 * folders, the machine key, browser profiles and session records: each root
 * and everything made in it is its user's alone, 0700, but for each
 * scratch dir (below). On 2026-11-13
 * obelisk-of-light's `~/.cawco` and `~/.cawco/tmp` were 0775, the mode
 * Ubuntu's umask 002 gave a folder made without one, and microsandbox refused
 * to keep its home beneath a group-writable folder. {@link keepFoldersPrivate}
 * brings an install made before this to these modes as the agent and the hub
 * start.
 *
 * Who reads them besides the process that made them, and why 0700 keeps
 * each working:
 *  - a workspace's boundary (bubblewrap on Linux, Seatbelt on macOS) runs as
 *    the same user: bubblewrap's user namespace maps the user's own uid, and
 *    the kernel checks a file's access by that uid, the owner's;
 *  - the session keeper (sessiond), a preview's bridge (`nsenter` as the
 *    agent's user), the harnesses, the browsers and the CLI are the user's
 *    own processes, under the user's own service manager;
 *  - a container a session starts reaches only what it binds, and its
 *    runtime resolves a bind's source on the host as the user (rootless) or
 *    root: a folder's parents are never walked by the container's own user.
 *    The bound folder's own mode is what that user meets, so each
 *    workspace's scratch dir, its `TMPDIR` and the folder a session is told
 *    is its own, keeps 0755 ({@link WORKING}), readable by a container whose
 *    user is not the host's, as it was before: no group or other write, and
 *    behind its 0700 parents. The fleet's own containers bind none of these
 *    (browser/container-host.ts, browser/relay.ts use volumes and a 0700
 *    `mkdtemp`).
 *
 * Any other folder (a clone, `~/.worktrees`, a person's project folder,
 * `~/.claude`) is the person's: it gets the mode its caller names, less the
 * umask's bits, as it always did.
 */

import {
  closeSync,
  constants,
  type Dirent,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { errnoCode } from "./absent";
import {
  cawcoConfigDir,
  cawcoDataDir,
  cawcoHomeDir,
  darwinSocketRoot,
  hubDataDir,
  workspaceScratchRoot,
} from "./paths/roots";

/** A folder of CawCo's own: its user's alone. */
const PRIVATE = 0o700;

/**
 * A workspace's or a session's scratch dir (core paths/workspace.ts
 * `workspaceScratchDir`, `sessionScratchDir`): readable by a container a
 * session binds it into, written by its user alone (module doc).
 */
const WORKING = 0o755;

/** How deep below a root {@link keepFoldersPrivate} looks: as deep as {@link folderMode} names a mode of its own (a scratch dir, `~/.cawco/tmp/<id8>`). */
const KEPT_DEPTH = 2;

/**
 * The roots of CawCo's own folders on this machine:
 *  - `~/.cawco`: accounts, workspaces' state, scratch dirs and cache,
 *    carries, attachments, previews' and containers' sockets without a
 *    runtime dir, diagnostics, launchd start records;
 *  - the data dir (`~/.local/share/cawco`): the binary install and its
 *    runtime trees, the fleet sync's files, browser profiles, the transcript
 *    index, session records; on Linux the hub's database and projects;
 *  - the config dir (`~/.config/cawco`): the CLI's config, the machine key,
 *    the release env file;
 *  - the hub's data dir on macOS (`~/Library/Application Support/cawco`);
 *  - the socket dirs: `$XDG_RUNTIME_DIR/cawco`, `cawco-ws` and `cawco-ssh`
 *    on Linux, `/private/tmp/cawco-<uid>` on macOS.
 */
const ownRoots = (): string[] => {
  const runtime = process.env.XDG_RUNTIME_DIR;
  return [
    ...new Set([
      cawcoHomeDir(),
      cawcoDataDir(),
      cawcoConfigDir(),
      hubDataDir(),
      ...(process.platform === "linux" && runtime
        ? ["cawco", "cawco-ws", "cawco-ssh"].map((name) => join(runtime, name))
        : []),
      ...(process.platform === "darwin" ? [darwinSocketRoot()] : []),
    ]),
  ].map((root) => resolve(root));
};

/**
 * The mode CawCo gives a folder at `path`: {@link WORKING} for a scratch dir,
 * {@link PRIVATE} for anything else in one of {@link ownRoots}, none for a
 * folder that is not CawCo's own.
 */
const folderMode = (path: string): number | undefined => {
  const at = resolve(path);
  if (dirname(at) === resolve(workspaceScratchRoot())) {
    return WORKING;
  }
  return ownRoots().some((root) => at === root || at.startsWith(`${root}/`))
    ? PRIVATE
    : undefined;
};

export interface FolderOptions {
  /**
   * Makes this folder alone, its parent there already, and fails with
   * `EEXIST` when it is there: a claim that is this caller's only.
   */
  exclusive?: boolean;
  /**
   * The mode of each folder made that is not CawCo's own (a clone's parent,
   * a folder of the person's), as `mkdir` takes it: the umask takes its bits
   * off, as it always did. CawCo's own get {@link folderMode}'s whatever the
   * umask, whatever this says.
   */
  mode?: number;
}

/** `mode` on folder `at`, through a handle that follows no link: a folder swapped for a link since is left alone. */
const settle = (at: string, mode: number): boolean => {
  let fd: number;
  try {
    // open(2)'s flags as one bit set: each its own bit, so their sum is it.
    fd = openSync(
      at,
      constants.O_RDONLY + constants.O_DIRECTORY + constants.O_NOFOLLOW
    );
  } catch {
    // Gone, or a link now: nothing of CawCo's to set.
    return false;
  }
  try {
    const found = fstatSync(fd);
    // Its permission bits: the type and set-id bits lie above them.
    const bits = found.mode % 0o1000;
    if (found.uid !== process.getuid?.() || bits === mode) {
      return false;
    }
    fchmodSync(fd, mode);
    return true;
  } finally {
    closeSync(fd);
  }
};

/** One folder made at `at`, with its mode ({@link folderMode}, else `asked`). */
const makeOne = (at: string, asked: number | undefined): void => {
  const mode = folderMode(at);
  if (mode === undefined) {
    // The person's folder: the umask takes off what it takes, as ever.
    mkdirSync(at, asked === undefined ? undefined : { mode: asked });
    return;
  }
  mkdirSync(at, { mode });
  settle(at, mode);
};

/**
 * Folder `path` made with every missing folder above it, each with its own
 * mode ({@link folderMode}; `options.mode` for one that is not CawCo's), as
 * `mkdir -p` makes them; nothing when it is there. Fails as `mkdir` does
 * when something that is not a folder stands in the way.
 */
export const makeFolderSync = (
  path: string,
  options: FolderOptions = {}
): void => {
  const target = resolve(path);
  if (options.exclusive) {
    makeOne(target, options.mode);
    return;
  }
  const missing: string[] = [];
  for (let at = target; ; at = dirname(at)) {
    const found = statSync(at, { throwIfNoEntry: false });
    if (found) {
      if (!found.isDirectory()) {
        // A file where a folder goes: mkdir says which (EEXIST, ENOTDIR).
        mkdirSync(target);
      }
      break;
    }
    missing.push(at);
    if (dirname(at) === at) {
      break;
    }
  }
  for (const at of missing.reverse()) {
    try {
      makeOne(at, options.mode);
    } catch (error) {
      // Made by another process between the look and the make: it is there.
      if (errnoCode(error) !== "EEXIST") {
        throw error;
      }
    }
  }
};

/** {@link makeFolderSync}, for a caller that awaits. */
export const makeFolder = async (
  path: string,
  options: FolderOptions = {}
): Promise<void> => makeFolderSync(path, options);

/**
 * Brings each of CawCo's own folders this user owns to its mode
 * ({@link folderMode}), each root and every folder in it down to
 * {@link KEPT_DEPTH}: run as the agent and the hub start, so an install made
 * under a looser umask (module doc) is its user's alone from then on. A
 * folder deeper than that was made in a 0700 one, which no other user
 * passes. A link is never followed, nor set, a root that is one included.
 * Each folder it changed, said through `say`.
 */
export const keepFoldersPrivate = (say: (line: string) => void): void => {
  const walk = (at: string, depth: number): void => {
    bring(at, say);
    if (depth === KEPT_DEPTH) {
      return;
    }
    let entries: Dirent[];
    try {
      entries = readdirSync(at, { withFileTypes: true });
    } catch {
      // Not there, or not this user's to read: nothing of it to bring.
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(join(at, entry.name), depth + 1);
      }
    }
  };
  for (const root of ownRoots()) {
    // A root that is a link (`~/.cawco` moved to another disk, a dotfiles
    // checkout) is never read through, as no link below a root is: the walk
    // would set the modes of folders wherever it points.
    if (lstatSync(root, { throwIfNoEntry: false })?.isSymbolicLink()) {
      say(
        `[folders] ${root} is a link: it and what it points at are left as they are`
      );
      continue;
    }
    walk(root, 0);
  }
};

/** Folder `at` given its mode ({@link folderMode}) when it is CawCo's own, and what changed said through `say`. */
const bring = (at: string, say: (line: string) => void): void => {
  const mode = folderMode(at);
  if (mode === undefined) {
    return;
  }
  try {
    if (settle(at, mode)) {
      say(
        `[folders] ${at} is now ${mode.toString(8)}, CawCo's own mode for it`
      );
    }
  } catch (error) {
    // A read-only mount, say: the rest are still brought.
    say(
      `[folders] ${at} could not be given its mode ${mode.toString(8)}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

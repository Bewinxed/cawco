/**
 * The roots of CawCo's own folders on this machine, each a path alone: what
 * core folders.ts gives its mode to, and what every other path module builds
 * on. Nothing here imports the rest of core, so any module may import it.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * `~/.cawco`: the agent's own home on this machine (accounts, workspaces'
 * state and scratch, carries, attachments, sessiond's socket without a
 * runtime dir). Private to its user (core folders.ts).
 */
export const cawcoHomeDir = (): string => join(homedir(), ".cawco");

export const xdgConfigHome = (): string =>
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
export const xdgDataHome = (): string =>
  process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");

/** CawCo's config dir: the CLI's `config.json`, the hub's env file, the release signing key. */
export const cawcoConfigDir = (): string => join(xdgConfigHome(), "cawco");

/** CawCo's data dir: the binary install, its runtime trees, the transcript index; on Linux the hub's database too. */
export const cawcoDataDir = (): string => join(xdgDataHome(), "cawco");

/** Where an installed hub keeps its database (`cawco.db`) and the backups beside it. */
export const hubDataDir = (): string =>
  process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "cawco")
    : cawcoDataDir();

/**
 * Where every workspace's scratch dir is, one dir per workspace: under home,
 * so on disk (never tmpfs, which is RAM, and workspaces build large trees
 * there), and outside every clone (never in git status). Short, because
 * tools put unix sockets in `$TMPDIR` (paths/workspace.ts `SCRATCH_SOCKET_SUFFIX`).
 */
export const workspaceScratchRoot = (): string => join(cawcoHomeDir(), "tmp");

/**
 * macOS's root for every workspace's sockets (paths/workspace.ts `workspaceDoorDir`):
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

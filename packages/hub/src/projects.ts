/**
 * A project is one identity with many places (project, place). What
 * makes two folders on two machines the same project is the repository they
 * are checkouts of: their `origin`, normalised here so the forms git accepts
 * for one repository compare equal.
 */

import type { CommandResult } from "@cawco/core/harness";
import { type HubRepoKey, hubRepoOfUrl } from "@cawco/core/hub-repo";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";

/**
 * A project's repository's identity when the hub is its remote: the same from
 * every machine, whatever address it reaches the hub by. `root` names one of
 * the project's other repositories (core hub-repo.ts); absent, its main one.
 */
export const hubRemoteIdentity = ({ projectId, root }: HubRepoKey): string =>
  `cawco/${projectId.toLowerCase()}${root ? `/${root}` : ""}`;

/** A scheme URL: `https://`, `ssh://`, `git://`, `file://`. */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//iu;
/** git's scp-like form, `[user@]host:path`. */
const SCP = /^(?:[^@/]+@)?([^:/]+):(.+)$/u;
const EDGE_SLASHES = /^\/+|\/+$/gu;
const DOT_GIT = /\.git$/iu;
const TRAILING_SLASHES = /\/+$/u;

/**
 * A remote URL as `host/owner/repo`: the host lowercased, credentials, port
 * and a trailing `.git` dropped, so `git@github.com:Owner/repo.git` and
 * `https://github.com/Owner/repo` are one remote. The hub's own remote of a
 * project is {@link hubRemoteIdentity}, by its path alone: machines reach the
 * hub by different addresses. Null for what names no host (a path on the
 * same disk, `file://`), which no other machine shares.
 */
export const normaliseRemote = (url: string): string | null => {
  const raw = url.trim();
  if (!raw) {
    return null;
  }
  let host: string;
  let path: string;
  if (SCHEME.test(raw)) {
    try {
      const parsed = new URL(raw);
      host = parsed.hostname;
      path = parsed.pathname;
    } catch {
      return null;
    }
    const hub = hubRepoOfUrl(raw);
    if (hub) {
      return hubRemoteIdentity(hub);
    }
  } else {
    const scp = SCP.exec(raw);
    if (!scp) {
      return null;
    }
    [, host = "", path = ""] = scp;
  }
  const repo = path
    .replace(EDGE_SLASHES, "")
    .replace(DOT_GIT, "")
    .replace(TRAILING_SLASHES, "");
  return host && repo ? `${host.toLowerCase()}/${repo}` : null;
};

/** A remote read is local git; past this the machine is not going to answer it. */
const REMOTE_READ_MS = 10_000;

/** A root commit as git prints one: a sha1 or sha256 object name. */
const ROOT_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/** What a checkout says of the repository it is: its remote and its root commit. */
export interface CheckoutRepository {
  /** Its `origin`, normalised ({@link normaliseRemote}); null: none read. */
  readonly remote: string | null;
  /**
   * The root commit HEAD reaches by first parents: which repository the
   * folder is, the same in every clone of it on any machine (core
   * hub-repo.ts). Null: none read (no commit yet, or not a repository).
   */
  readonly root: string | null;
}

/** A checkout nothing was read of. */
export const NOTHING_READ: CheckoutRepository = { remote: null, root: null };

/**
 * The repository the folder `path` on `machineId` is, read by one run of
 * git there: its normalised `origin` and its root commit. Anything that
 * keeps either from answering (an offline machine, a folder that is gone or
 * not a repository, no `origin`, no commit) is null, never an error: a
 * project without a remote is still a project. An offline machine answers
 * neither.
 */
export const readCheckout = async (
  run: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<CommandResult>,
  machineId: string,
  path: string
): Promise<CheckoutRepository> => {
  try {
    const result = await run(
      machineId,
      path,
      `${SAFE_GIT_SHELL}printf '%s\\n%s\\n' "$(git remote get-url origin 2>/dev/null)" "$(git rev-list --max-parents=0 --first-parent HEAD 2>/dev/null)"`,
      REMOTE_READ_MS
    );
    if (result.exitCode !== 0) {
      return NOTHING_READ;
    }
    const [origin = "", root = ""] = result.stdout.split("\n");
    return {
      remote: origin.trim() ? normaliseRemote(origin) : null,
      root: ROOT_COMMIT.test(root.trim()) ? root.trim() : null,
    };
  } catch {
    return NOTHING_READ;
  }
};

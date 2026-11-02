/**
 * A project is one identity with many places (project, place). What
 * makes two folders on two machines the same project is the repository they
 * are checkouts of: their `origin`, normalised here so the forms git accepts
 * for one repository compare equal.
 */

import type { CommandResult } from "@cawco/core";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";

/**
 * A project's repository's identity when the hub is its remote: the same from
 * every machine, whatever address it reaches the hub by. `root` names one of
 * the project's other repositories (core hub-repo.ts); absent, its main one.
 */
export const hubRemoteIdentity = (projectId: string, root?: string): string =>
  `cawco/${projectId.toLowerCase()}${root ? `/${root}` : ""}`;

/** A scheme URL: `https://`, `ssh://`, `git://`, `file://`. */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//iu;
/** git's scp-like form, `[user@]host:path`. */
const SCP = /^(?:[^@/]+@)?([^:/]+):(.+)$/u;
const EDGE_SLASHES = /^\/+|\/+$/gu;
const DOT_GIT = /\.git$/iu;
const TRAILING_SLASHES = /\/+$/u;
/** The hub's own git remote of a project's repository (core hub-repo.ts): `/git/<project uuid>[.<root commit>].git`. */
const HUB_REMOTE_PATH =
  /^\/git\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([0-9a-f]{40}|[0-9a-f]{64}))?(?:\.git)?\/?$/iu;

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
    const hub = HUB_REMOTE_PATH.exec(path);
    if (hub) {
      return hubRemoteIdentity(hub[1] as string, hub[2]?.toLowerCase());
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

/**
 * The normalised `origin` of the folder `path` on `machineId`, read by running
 * git there. Anything that keeps it from answering (an offline machine, a
 * folder that is gone or not a repository, no `origin`) is null, never an
 * error: a project without a remote is still a project.
 */
export const readRemote = async (
  run: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<CommandResult>,
  machineId: string,
  path: string
): Promise<string | null> => {
  try {
    const result = await run(
      machineId,
      path,
      `${SAFE_GIT_SHELL}git remote get-url origin`,
      REMOTE_READ_MS
    );
    return result.exitCode === 0 ? normaliseRemote(result.stdout) : null;
  } catch {
    return null;
  }
};

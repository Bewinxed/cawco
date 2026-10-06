/**
 * A project is one identity with many places (WORDS.md: project, place). What
 * makes two folders on two machines the same project is the repository they
 * are checkouts of: their `origin`, normalised here so the forms git accepts
 * for one repository compare equal.
 */

import type { CommandResult } from "@cawco/core";

/** A scheme URL: `https://`, `ssh://`, `git://`, `file://`. */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/** git's scp-like form, `[user@]host:path`. */
const SCP = /^(?:[^@/]+@)?([^:/]+):(.+)$/;
const EDGE_SLASHES = /^\/+|\/+$/g;
const DOT_GIT = /\.git$/i;
const TRAILING_SLASHES = /\/+$/;

/**
 * `origin` as `host/owner/repo`: the host lowercased, credentials, port and a
 * trailing `.git` dropped, so `git@github.com:Owner/repo.git` and
 * `https://github.com/Owner/repo` are one remote. Null for what names no
 * host (a path on the same disk, `file://`), which no other machine shares.
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
  } else {
    const scp = SCP.exec(raw);
    if (!scp) {
      return null;
    }
    [, host, path] = scp;
  }
  const repo = path
    .replace(EDGE_SLASHES, "")
    .replace(DOT_GIT, "")
    .replace(TRAILING_SLASHES, "");
  return host && repo ? `${host.toLowerCase()}/${repo}` : null;
};

/** A folder as a place stores it: no trailing slash, except the root's own. */
export const placePath = (path: string): string =>
  path.trim().replace(TRAILING_SLASHES, "") || "/";

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
      "git remote get-url origin",
      REMOTE_READ_MS
    );
    return result.exitCode === 0 ? normaliseRemote(result.stdout) : null;
  } catch {
    return null;
  }
};

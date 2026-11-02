/**
 * A project is one identity with many places (project, place). What
 * makes two folders on two machines the same project is the repository they
 * are checkouts of: their `origin`, normalised here so the forms git accepts
 * for one repository compare equal.
 */

import type { CommandResult } from "@cawco/core";
import { withoutRemoteCredential } from "@cawco/core/remote-credential";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { quote } from "./landing";

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

/** A clone takes as long as the repository and the link make it; past this it is stopped and said as stopped. */
const CLONE_MS = HOUR_MS;

/** What {@link cloneRepository} found or did at the folder. */
export type CloneOutcome =
  | { kind: "cloned" }
  /** The folder is a checkout of that repository already: used as it is. */
  | { kind: "there" }
  /** Nothing cloned: why, as one sentence naming the folder or git's reason. */
  | { kind: "refused"; why: string };

/** Whether two remote URLs name one repository: by {@link normaliseRemote}, else as written (a path, `file://`). */
const sameRemote = (one: string, other: string): boolean => {
  const a = normaliseRemote(one);
  const b = normaliseRemote(other);
  return a !== null || b !== null ? a === b : one.trim() === other.trim();
};

/** How git opens a line that says why it failed. */
const GIT_SAID = /^(fatal|error):\s*/u;
const FINAL_STOP = /\.$/u;

/** git's reason from a failed run: its `fatal:`/`error:` lines, else its last line. */
const gitReason = (result: CommandResult): string => {
  const lines = result.stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const said = lines.filter((line) => GIT_SAID.test(line));
  const reason = (said.length > 0 ? said : lines.slice(-1))
    .map((line) => line.replace(GIT_SAID, "").replace(FINAL_STOP, ""))
    .join("; ");
  return reason || `git exited ${result.exitCode}`;
};

/**
 * {@link cloneAt} with `url`'s credential, when it carries one, out of the
 * refusal's words (git quotes the URL it was given): the clone itself uses
 * the URL as given.
 */
export const cloneRepository = async (
  ...args: Parameters<typeof cloneAt>
): Promise<CloneOutcome> => {
  const outcome = await cloneAt(...args);
  return outcome.kind === "refused"
    ? { kind: "refused", why: withoutRemoteCredential(outcome.why, args[3]) }
    : outcome;
};

/**
 * `url` cloned onto `machineId` at `path` (absolute), with the machine's own
 * git and its owner's credentials: git takes any URL form it knows. A folder
 * that is already a checkout of `url` is used as it is; one that holds
 * anything else is refused, naming it; an absent or empty one is cloned
 * into. git removes a clone it could not finish, a signal's stop included.
 * Never throws: an offline machine or a failed clone is a refusal with its
 * reason, `where` naming the machine in it.
 */
const cloneAt = async (
  run: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<CommandResult>,
  machineId: string,
  where: string,
  url: string,
  path: string
): Promise<CloneOutcome> => {
  const folder = quote(path);
  try {
    const looked = await run(
      machineId,
      "/",
      `if [ ! -e ${folder} ]; then echo absent; elif [ -d ${folder} ] && [ -z "$(ls -A ${folder})" ]; then echo empty; else echo full; fi`,
      REMOTE_READ_MS
    );
    if (looked.exitCode !== 0) {
      return {
        kind: "refused",
        why: `${where} could not look at ${path}: ${gitReason(looked)}`,
      };
    }
    if (looked.stdout.trim() === "full") {
      const origin = await run(
        machineId,
        "/",
        `${SAFE_GIT_SHELL}git -C ${folder} remote get-url origin`,
        REMOTE_READ_MS
      );
      return origin.exitCode === 0 && sameRemote(origin.stdout, url)
        ? { kind: "there" }
        : {
            kind: "refused",
            why: `${path} on ${where} already holds something else, so nothing was cloned there`,
          };
    }
    const cloned = await run(
      machineId,
      "/",
      `${SAFE_GIT_SHELL}git clone --quiet -- ${quote(url.trim())} ${folder}`,
      CLONE_MS
    );
    if (cloned.exitCode === 0) {
      return { kind: "cloned" };
    }
    return {
      kind: "refused",
      why:
        cloned.exitCode === 124
          ? `the clone ran past ${CLONE_MS / MINUTE_MS} minutes and was stopped`
          : gitReason(cloned),
    };
  } catch (error) {
    return {
      kind: "refused",
      why: error instanceof Error ? error.message : String(error),
    };
  }
};

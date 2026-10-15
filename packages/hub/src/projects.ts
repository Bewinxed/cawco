/**
 * A project is one identity with many places (WORDS.md: project, place). What
 * makes two folders on two machines the same project is the repository they
 * are checkouts of: their `origin`, normalised (core upstream-guard.ts
 * `normaliseRemote`) so the forms git accepts for one repository compare
 * equal.
 */

import type { CommandResult } from "@cawco/core";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import { normaliseRemote } from "@cawco/core/upstream-guard";

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

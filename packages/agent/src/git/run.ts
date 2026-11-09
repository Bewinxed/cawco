/**
 * git on this host, in a folder of the person's or a workspace's copy, as
 * every git call there runs (`safe-git.ts`), and the remote's default branch
 * fetched into a checkout.
 */

import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import { runCaptured } from "@cawco/core/run-captured";
import {
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  SAFE_GIT_FLAGS,
  safeGitArgv,
} from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { unhandled } from "@cawco/core/unhandled";
import { WORKSPACE_GIT_TIMEOUT_MS } from "@cawco/core/workspace/controls";
import { cloneHolding } from "../workspace-records";
import { withoutCredential } from "./hub-credential";

/**
 * git in `dir`, on this host, as every git call there runs (`safe-git.ts`).
 * In a workspace's clone it refuses to run while the clone's own config
 * holds a key past the allowlist: the workspace writes that config. A
 * place is a person's own folder, whose config is theirs, and
 * is never refused. `stdin` is fed to git when given.
 */
export const hostGit = async (
  dir: string,
  args: readonly string[],
  stdin?: string
) => {
  const workspace = await cloneHolding(dir);
  const problem = workspace
    ? await repositoryConfigProblem(join(workspace.path, ".git"))
    : undefined;
  if (problem) {
    throw new Error(`git did not run in ${dir}: ${problem}`);
  }
  const command = stdin
    ? Bun.$`git ${SAFE_GIT_FLAGS} -C ${dir} ${args} < ${new Response(stdin)}`
    : Bun.$`git ${SAFE_GIT_FLAGS} -C ${dir} ${args}`;
  return await command
    .env({ ...hostEnvironment(), ...SAFE_GIT_ENV })
    .quiet()
    .nothrow();
};

/** Runs git, answering its stdout; its stderr is the error. */
export const git = async (dir: string, ...args: string[]): Promise<string> => {
  const run = await hostGit(dir, args);
  if (run.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed: ${run.stderr.toString().trim()}`);
  }
  return run.text().trim();
};

/** Workspace creation supplies its aggregate git deadline through this runner. */
type GitRunner = typeof git;

const SYMREF_HEAD = /^ref: refs\/heads\/(\S+)\tHEAD$/mu;

/**
 * The branch `origin` itself names as its HEAD — the repository's default
 * branch as its host has it (`master` for some, `main` for others), asked of
 * the remote rather than read off a local ref that may never have been set or
 * may have gone stale.
 */
const remoteDefault = async (dir: string, run: GitRunner): Promise<string> => {
  const remote = await run(dir, "ls-remote", "--symref", "origin", "HEAD");
  const branch = SYMREF_HEAD.exec(remote)?.[1];
  if (!branch) {
    throw new Error("origin does not name a default branch for its HEAD");
  }
  return branch;
};

/**
 * The remote's default branch, fetched into `dir` as it stands right now, with
 * `origin/HEAD` naming it. Answers the branch's name: what a checkout is cut
 * from and where its work lands. `known`, when given, is that branch already
 * (the hub's remote of a project whose source just pushed it there).
 */
export const fetchDefaultBranch = async (
  dir: string,
  run: GitRunner = git,
  known?: string
): Promise<string> => {
  const base = known ?? (await remoteDefault(dir, run));
  await run(
    dir,
    "fetch",
    "--quiet",
    "--no-tags",
    "origin",
    `+refs/heads/${base}:refs/remotes/origin/${base}`
  );
  await run(
    dir,
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
    `refs/remotes/origin/${base}`
  );
  return base;
};

export type Git = (root: string, ...args: string[]) => Promise<string>;

/** An argv run in a workspace's copy, in a directory there, with the directory its spawn starts in (workspace.ts `CopyAccess`). */
type CopyRun = (
  cwd: string,
  argv: readonly string[]
) => { argv: string[]; cwd: string };

/** How a git call reaches a workspace's copy (workspace.ts `CopyAccess`). */
export interface CopyRunner {
  run: CopyRun;
}

/**
 * git on this host as `safe-git.ts` says, its stdout trimmed, within the
 * create's one `deadline`; `env` in place of the host's (the hub's
 * credential, env-only); in a workspace's copy as `access` reaches it
 * (../workspace.ts `accessOf`) when given; `input` its stdin. git's stderr,
 * credential taken out, is the error.
 */
export const gitUntil =
  (
    deadline: number,
    env: Record<string, string> = hostEnvironment(),
    access?: CopyRunner,
    input?: string
  ): Git =>
  async (root, ...args) => {
    const late = `workspace git exceeded ${WORKSPACE_GIT_TIMEOUT_MS / 1000}s`;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(late);
    }
    const run = access
      ? access.run(root, safeGitArgv(args))
      : { argv: safeGitArgv(args), cwd: root };
    const ran = await readWithin(remaining, async (signal) => {
      const { code, signalCode, stdout, stderr } = await runCaptured(run.argv, {
        cwd: run.cwd,
        env: { ...env, ...SAFE_GIT_ENV },
        ...(input === undefined ? {} : { input }),
        signal,
        killSignal: "SIGKILL",
      });
      if (code !== 0) {
        throw new Error(
          signalCode
            ? `git ${args[0]} was ended by ${signalCode}`
            : `git ${args[0]} failed: ${withoutCredential(stderr.trim())}`
        );
      }
      return stdout.trim();
    });
    switch (ran.kind) {
      case "answered":
        return ran.value;
      case "unanswered":
        throw new Error(late);
      default:
        unhandled("read", ran);
    }
  };

/**
 * git on this host, in a folder of the person's or a workspace's copy, as
 * every git call there runs (`safe-git.ts`), and the remote's default branch
 * fetched into a checkout.
 */
import { join } from "node:path";
import {
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  SAFE_GIT_FLAGS,
} from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { cloneHolding } from "./workspace-records";

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

const SYMREF_HEAD = /^ref: refs\/heads\/(\S+)\tHEAD$/m;

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

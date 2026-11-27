/**
 * git on this host, in a folder of the person's or a workspace's copy, as
 * every git call there runs (`safe-git.ts`), and the remote's default branch
 * fetched into a checkout.
 */

import { join } from "node:path";
import { QUIET_MS } from "@cawco/core/bounded";
import { recordedPool } from "@cawco/core/object-pool";
import { runLive } from "@cawco/core/run-captured";
import {
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  SAFE_GIT_FLAGS,
  safeGitArgv,
} from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { secondsOf } from "@cawco/core/time";
import { gitWaitWords } from "@cawco/core/words/git-waits";
import { Schema } from "effect";
import { cloneHolding } from "../workspace-records";
import { withoutCredential } from "./hub-credential";

/**
 * git in `dir`, on this host, as every git call there runs (`safe-git.ts`).
 * In a workspace's clone it refuses to run while the clone's own config
 * holds a key past the allowlist, or its alternates file names a store but
 * its recorded object pool: the workspace writes both. A
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
    ? await repositoryConfigProblem(
        join(workspace.path, ".git"),
        await recordedPool(workspace.id)
      )
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
const git = async (dir: string, ...args: string[]): Promise<string> => {
  const run = await hostGit(dir, args);
  if (run.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed: ${run.stderr.toString().trim()}`);
  }
  return run.text().trim();
};

/** A git runner: the host's own, or a workspace creation's ({@link gitLive}). */
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

/** A git run by {@link gitLive} that exited non-zero: its status, which some commands answer by (`ls-remote --exit-code`'s 2 for no matching ref). */
export class GitExited extends Schema.TaggedError<GitExited>()("GitExited", {
  message: Schema.String,
  exitCode: Schema.Number,
}) {}

/** A git run by {@link gitLive} that did not end in its exit: a signal ended it, it did not start, or it went quiet. */
class GitDidNotRun extends Schema.TaggedError<GitDidNotRun>()("GitDidNotRun", {
  message: Schema.String,
}) {}

/** An argv run in a workspace's copy, in a directory there, with the directory its spawn starts in (workspace.ts `CopyAccess`). */
type CopyRun = (
  cwd: string,
  argv: readonly string[]
) => { argv: string[]; cwd: string };

/** How a git call reaches a workspace's copy (workspace.ts `CopyAccess`). */
export interface CopyRunner {
  run: CopyRun;
}

/** git's own stall rule for a transfer: one that moves under a byte a second for the quiet spell is let go by git itself ({@link gitLive}). */
const STALL_FLAGS = [
  "-c",
  "http.lowSpeedLimit=1",
  "-c",
  `http.lowSpeedTime=${QUIET_MS / 1000}`,
];

/** The subcommands that reach a remote, run with `--progress` so their transfer is heard as it moves. */
const TRANSFERS = new Set(["clone", "fetch", "pull", "push"]);

/**
 * git on this host as `safe-git.ts` says, its stdout trimmed, for as long
 * as it writes or works (core run-captured.ts `runLive`: each chunk it
 * writes, and its CPU time, are its signs of life); a transfer with
 * `--progress`, so it is heard as it moves, and under git's own stall rule
 * ({@link STALL_FLAGS}). `env` in place of the host's (the hub's
 * credential, env-only); in a workspace's copy as `access` reaches it
 * (../workspace.ts `accessOf`) when given; `input` its stdin. git's stderr,
 * credential taken out, is the error.
 */
export const gitLive =
  (
    env: Record<string, string> = hostEnvironment(),
    access?: CopyRunner,
    input?: string
  ): Git =>
  async (root, ...args) => {
    const [command, ...rest] = args;
    const heard =
      command !== undefined && TRANSFERS.has(command)
        ? [...STALL_FLAGS, command, "--progress", ...rest]
        : args;
    const run = access
      ? access.run(root, safeGitArgv(heard))
      : { argv: safeGitArgv(heard), cwd: root };
    const ran = await runLive(run.argv, {
      cwd: run.cwd,
      env: { ...env, ...SAFE_GIT_ENV },
      ...(input === undefined ? {} : { input }),
      keep: "whole",
    }).catch((cause: unknown) => {
      throw new GitDidNotRun({
        message: cause instanceof Error ? cause.message : String(cause),
      });
    });
    if (ran.kind === "unanswered") {
      throw new GitDidNotRun({
        message: gitWaitWords.gitQuiet(String(command), secondsOf(ran.after)),
      });
    }
    const { code, signalCode, stdout, stderr } = ran.value;
    if (signalCode) {
      throw new GitDidNotRun({
        message: `git ${command} was ended by ${signalCode}`,
      });
    }
    if (code !== 0) {
      throw new GitExited({
        message: `git ${command} failed: ${withoutCredential(lastProgress(stderr).trim())}`,
        exitCode: code,
      });
    }
    return stdout.trim();
  };

/** What git wrote on stderr with its progress lines (each a `\r`-ended rewrite) left out: what it said of its failure. */
const lastProgress = (stderr: string): string =>
  stderr
    .split("\n")
    .map((line) => line.slice(line.lastIndexOf("\r") + 1))
    .filter((line) => !PROGRESS_LINE.test(line))
    .join("\n");

/** A progress line git writes with `--progress`: `Receiving objects:  45% (450/1000)`, `remote: Counting objects: …`. */
const PROGRESS_LINE =
  /^(remote: )?(Enumerating|Counting|Compressing|Receiving|Resolving|Writing|Updating|Total|Filtering|Unpacking)\b/u;

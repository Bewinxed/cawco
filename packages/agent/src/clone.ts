/**
 * A workspace's checkout as git sees it: a shared clone (`git clone
 * --shared`) of the repository it was cut from — its own `.git`, so its
 * branches, stash and index are its own, its objects read through the
 * source's — with `origin` at the source's own remote and `origin/HEAD` at
 * the remote's default branch, fetched when the clone was cut.
 *
 * Workspaces were git worktrees before they were clones. A worktree's `.git`
 * is a file pointing into the source repository, so everything a delegate
 * commits there is written into the source, which the boundary keeps
 * read-only. {@link cloneInPlace} turns such a workspace into a clone where it
 * stands: same path, branch and HEAD, the index, the working files and any
 * operation in progress exactly as they were.
 */
import { cp, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceRef } from "@cawco/core";
import {
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  SAFE_GIT_FLAGS,
} from "@cawco/core/safe-git";
import { workspaceHolding } from "./workspace-records";

/**
 * git in `dir`, on this host, as every git call there runs (`safe-git.ts`).
 * In a workspace's clone it refuses to run while the clone's own config
 * holds a key past the allowlist: the workspace writes that config. `stdin`
 * is fed to git when given.
 */
export const hostGit = async (
  dir: string,
  args: readonly string[],
  stdin?: string
) => {
  const workspace = await workspaceHolding(dir);
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
    .env({ ...process.env, ...SAFE_GIT_ENV })
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

/** Git's answer, or nothing when it has none (a detached HEAD, an unset key). */
const gitMaybe = async (
  dir: string,
  ...args: string[]
): Promise<string | undefined> => {
  const run = await hostGit(dir, args);
  return run.exitCode === 0 ? run.text().trim() : undefined;
};

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
 * from and where its work lands.
 */
export const fetchDefaultBranch = async (
  dir: string,
  run: GitRunner = git
): Promise<string> => {
  const base = await remoteDefault(dir, run);
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

/**
 * A shared clone of `source` (a repository or its git directory) at `dir`,
 * with no checkout and no ref of the source's, so its branch list is its own,
 * and `origin` at the source's own remote. Its one remote branch is the
 * remote's default, fetched from the remote now — so a workspace starts where
 * that branch is at the moment it is cut, whatever the source last fetched —
 * with `origin/HEAD` naming it. Answers that branch's name. A clone that
 * cannot be set up is deleted again.
 */
export const prepareClone = async (
  source: string,
  dir: string,
  run: GitRunner = git
): Promise<string> => {
  const remote = await run(source, "remote", "get-url", "origin");
  await run(
    source,
    "clone",
    "--quiet",
    "--shared",
    "--no-checkout",
    source,
    dir
  );
  try {
    const copied = await run(
      dir,
      "for-each-ref",
      "--format=%(refname)",
      "refs/remotes",
      "refs/heads"
    );
    for (const ref of copied.split("\n").filter(Boolean)) {
      // biome-ignore lint/performance/noAwaitInLoops: a fresh clone holds a handful of refs, deleted one git call at a time
      await run(dir, "update-ref", "-d", ref);
    }
    await run(dir, "remote", "set-url", "origin", remote);
    return await fetchDefaultBranch(dir, run);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
};

const WHITESPACE = /\s+/;
const BRANCH_REF = /^refs\/heads\//;

/** What a worktree's git directory holds that is the source's link, not the checkout's state. */
const WORKTREE_LINKS: ReadonlySet<string> = new Set([
  "commondir",
  "gitdir",
  "locked",
]);

/**
 * The objects the checkout has only through the source's worktree: its own
 * commits since `origin/HEAD`, and the blobs its index stages. Packed into
 * the clone, so a gc in the source can never take them from under it.
 */
const packOwnObjects = async (dir: string): Promise<void> => {
  const commits = await git(
    dir,
    "rev-list",
    "--objects",
    "HEAD",
    "--not",
    "refs/remotes/origin/HEAD"
  );
  const staged = (await git(dir, "ls-files", "--stage"))
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(WHITESPACE)[1] ?? "");
  const wanted = [
    ...commits.split("\n").map((line) => line.split(" ")[0] ?? ""),
    ...staged,
  ].filter(Boolean);
  if (wanted.length === 0) {
    return;
  }
  const pack = await hostGit(
    dir,
    ["pack-objects", "-q", join(dir, ".git", "objects", "pack", "pack")],
    `${wanted.join("\n")}\n`
  );
  if (pack.exitCode !== 0) {
    throw new Error(
      `git pack-objects failed: ${pack.stderr.toString().trim()}`
    );
  }
};

/**
 * A worktree workspace made a shared clone where it stands. The clone is
 * built beside it; the worktree's own git state (HEAD, index, reflog, an
 * operation in progress) and the source's excludes are carried into it; its
 * branch is set where the worktree had it, tracking what it tracked; its own
 * objects are packed into it. Then the `.git` file is swapped for the clone's
 * directory, and the source forgets the worktree. The working files are never
 * touched.
 */
const convert = async (path: string): Promise<void> => {
  const gitDir = await git(
    path,
    "rev-parse",
    "--path-format=absolute",
    "--git-dir"
  );
  const common = await git(
    path,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir"
  );
  const head = await gitMaybe(path, "symbolic-ref", "-q", "HEAD");
  const next = `${path}.cawco-clone`;
  const kept = `${path}.cawco-worktree-link`;
  await rm(next, { recursive: true, force: true });
  await prepareClone(common, next);
  try {
    const cloneGit = join(next, ".git");
    for (const entry of await readdir(gitDir)) {
      if (!WORKTREE_LINKS.has(entry)) {
        // biome-ignore lint/performance/noAwaitInLoops: a worktree's git directory holds a handful of entries
        await cp(join(gitDir, entry), join(cloneGit, entry), {
          recursive: true,
          force: true,
        });
      }
    }
    await cp(
      join(common, "info", "exclude"),
      join(cloneGit, "info", "exclude"),
      {
        force: true,
      }
    ).catch(() => undefined);
    if (head) {
      const name = head.replace(BRANCH_REF, "");
      await git(next, "update-ref", head, await git(common, "rev-parse", head));
      for (const key of ["remote", "merge"]) {
        // biome-ignore lint/performance/noAwaitInLoops: two config keys
        const value = await gitMaybe(
          common,
          "config",
          "--get",
          `branch.${name}.${key}`
        );
        if (value) {
          await git(next, "config", `branch.${name}.${key}`, value);
        }
      }
    }
    await packOwnObjects(next);
    await rename(join(path, ".git"), kept);
    try {
      await rename(cloneGit, join(path, ".git"));
    } catch (error) {
      await rename(kept, join(path, ".git"));
      throw error;
    }
    await rm(kept, { force: true });
  } finally {
    await rm(next, { recursive: true, force: true });
  }
  await rm(gitDir, { recursive: true, force: true });
  await git(common, "worktree", "prune");
};

const converting = new Map<string, Promise<void>>();

/** {@link convert}, once per path however many callers ask at the same moment. */
export const cloneInPlace = (path: string): Promise<void> => {
  const pending = converting.get(path);
  if (pending) {
    return pending;
  }
  const started = convert(path).finally(() => converting.delete(path));
  converting.set(path, started);
  return started;
};

/** What {@link convertWorktrees} did, by path. */
export interface WorktreeConversion {
  converted: string[];
  failed: { path: string; error: string }[];
  missing: string[];
}

/**
 * {@link CONTROL_WORKSPACE_MIGRATE}: each of this machine's active workspaces
 * whose `.git` is still a worktree's file, made a clone. A workspace whose
 * folder is gone is skipped and named in the log; one already a clone is left
 * as it is.
 */
export const convertWorktrees = async (
  refs: unknown
): Promise<WorktreeConversion> => {
  const report: WorktreeConversion = { converted: [], failed: [], missing: [] };
  for (const ref of refs as WorkspaceRef[]) {
    // biome-ignore lint/performance/noAwaitInLoops: one workspace at a time, each rewriting the same source repository's worktree list
    const dotGit = await stat(join(ref.path, ".git")).catch(() => undefined);
    if (!dotGit) {
      report.missing.push(ref.path);
      console.warn(
        `[workspace] ${ref.id}: ${ref.path} is gone, so it stays as it is`
      );
      continue;
    }
    if (dotGit.isDirectory()) {
      continue;
    }
    try {
      await cloneInPlace(ref.path);
      report.converted.push(ref.path);
      console.info(`[workspace] ${ref.id}: ${ref.path} is now a shared clone`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.failed.push({ path: ref.path, error: message });
      console.warn(
        `[workspace] ${ref.id}: ${ref.path} could not be made a clone: ${message}`
      );
    }
  }
  return report;
};

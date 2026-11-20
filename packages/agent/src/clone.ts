/**
 * A repository workspace's checkout as git sees it: a repository of its own
 * at `~/.worktrees/<repo>-<id8>` (its own `.git`, so its branches, stash,
 * index and config are its own) that borrows every object of its origin
 * from that origin's object pool (object-pool.ts) through one line in its
 * `.git/objects/info/alternates`, and stores only the objects it makes
 * itself. `origin` is the source's own remote, and `origin/HEAD` the
 * remote's default branch as the pool fetched it when the clone was cut.
 * Nothing in it is linked to or copied from the source: none of the
 * source's own branches, stashes or objects past what its remote holds, and
 * no file a sandbox can write that shares an inode with one outside the
 * clone.
 *
 * A folder that is no repository gets a layer instead (layer.ts): the two
 * kinds of workspace (core harness.ts `WorkspaceKind`).
 */
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { alternatesText, poolAt } from "@cawco/core/object-pool";
import { writeStateFile } from "@cawco/core/state-file";
import type { Git } from "./git/run";
import { formatFlag, type PoolSource, readyPool } from "./object-pool";

/**
 * The pool a clone of `source` (a repository's root or a linked worktree)
 * borrows from: the source's `origin` and object format, read with `run`.
 * Seeded, should it be made now, from `source` when that is the person's
 * own repository, never when `fromClone` (another workspace's clone, whose
 * refs a sandbox writes).
 */
export const poolSourceOf = async (
  source: string,
  run: Git,
  fromClone: boolean
): Promise<PoolSource> => {
  const origin = await run(source, "remote", "get-url", "origin");
  const format = await run(source, "rev-parse", "--show-object-format");
  return {
    format,
    origin,
    pool: poolAt(format, origin),
    seed: fromClone ? undefined : source,
  };
};

/**
 * A clone at `dir` that borrows from `source.pool`, with no checkout:
 * the pool brought up to date first, the remote's default branch fetched
 * into it ({@link readyPool}, `known` passed on, with `inPool`, git in the
 * pool with the remote's credential); then `git init`, the alternates file
 * as the pool's one line, `origin` at the source's remote, and
 * `origin/<base>` at the commit the pool fetched, with `origin/HEAD` naming
 * it. No `git clone` and no fetch in the clone: it reads every object its
 * origin holds from the pool, and its own store starts empty. Answers that
 * branch's name. A clone that cannot be set up is deleted again. Its
 * workspace's record names the pool before this runs (workspace.ts
 * `cutClone`), so the pool is granted to its boundary and its alternates
 * file is one host git runs with (safe-git.ts `repositoryConfigProblem`).
 */
export const prepareClone = async (
  source: PoolSource,
  dir: string,
  run: Git,
  inPool: Git,
  known: string | undefined,
  deadline: number
): Promise<string> => {
  const { base, tip } = await readyPool(source, inPool, known, deadline);
  try {
    await run(
      dirname(dir),
      "init",
      "--quiet",
      ...formatFlag(source.format),
      dir
    );
    await writeStateFile(
      join(dir, ".git", "objects", "info", "alternates"),
      alternatesText(source.pool),
      { inPlace: true }
    );
    await run(dir, "remote", "add", "origin", source.origin);
    await run(dir, "update-ref", `refs/remotes/origin/${base}`, tip);
    await run(
      dir,
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      `refs/remotes/origin/${base}`
    );
    return base;
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
};

/**
 * A repository workspace's checkout as git sees it: a clone of its own of the
 * repository it was cut from (`git clone --dissociate`), at
 * `~/.worktrees/<repo>-<id8>` — its own `.git`, so its branches, stash and
 * index are its own, and its own object store, so it depends on nothing in
 * the source once it is cut — with `origin` at the source's own remote and
 * `origin/HEAD` at the remote's default branch, fetched when the clone was
 * cut. A local clone hardlinks the source's object files where the two share
 * a filesystem (git-clone(1), `--local`: "The files under .git/objects/
 * directory are hardlinked to save space when possible"), so the cut costs
 * little, and a gc in the source unlinks only its own names for those files.
 *
 * A folder that is no repository gets a layer instead (layer.ts): the two
 * kinds of workspace (core harness.ts `WorkspaceKind`).
 */
import { rm } from "node:fs/promises";
import { fetchDefaultBranch, git } from "./host-git";

/** Workspace creation supplies its aggregate git deadline through this runner. */
type GitRunner = typeof git;

/**
 * A clone of its own of `source` (a repository's root or a linked worktree)
 * at `dir`, with no checkout and no ref of the source's, so its branch list
 * is its own, and `origin` at the source's own remote. `--dissociate`: a
 * source that itself borrows objects (a shared clone, or a linked worktree
 * whose objects are its common dir's) lends none on — git-clone(1): "this
 * option can be used to stop the borrowing", by a `git repack -a -d` it runs
 * only where an alternates file is. Its one remote branch is the remote's
 * default, fetched from the remote now — so a workspace starts where that
 * branch is at the moment it is cut, whatever the source last fetched — with
 * `origin/HEAD` naming it ({@link fetchDefaultBranch}, `known` passed on).
 * Answers that branch's name. A clone that cannot be set up is deleted
 * again. `own`, when given, runs on the clone the moment `git clone`
 * returns, before any other git runs in it: the fetch here starts a detached
 * `git maintenance run --auto` (git-fetch(1) `--auto-maintenance`, "enabled
 * by default"), whose geometric repack, git 2.54's default strategy, packs
 * the loose objects the clone linked from the source and deletes their files
 * (git-repack(1) `-d`: "run git prune-packed to remove redundant loose object
 * files") while `own` would still be copying them.
 */
export const prepareClone = async (
  source: string,
  dir: string,
  run: GitRunner = git,
  known?: string,
  own?: (dir: string) => Promise<unknown>
): Promise<string> => {
  const remote = await run(source, "remote", "get-url", "origin");
  await run(
    source,
    "clone",
    "--quiet",
    "--dissociate",
    "--no-checkout",
    source,
    dir
  );
  try {
    await own?.(dir);
    const copied = await run(
      dir,
      "for-each-ref",
      "--format=%(refname)",
      "refs/remotes",
      "refs/heads"
    );
    for (const ref of copied.split("\n").filter(Boolean)) {
      await run(dir, "update-ref", "-d", ref);
    }
    await run(dir, "remote", "set-url", "origin", remote);
    return await fetchDefaultBranch(dir, run, known);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
};

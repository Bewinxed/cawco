/**
 * A delegation workspace's checkout, on the machine that holds it. The hub
 * owns the workspace record; the machine cuts the clone and starts its
 * boundary once, keeps the boundary running while the workspace's sessions
 * can be continued, and deletes it all on archive.
 *
 * The checkout is a shared clone (`git clone --shared`): its own `.git`, so
 * its branches, stash and index are its own, while its objects are read from
 * the repository it was cut from — about the size of a worktree. Nothing in
 * the source is ever written through it, which is what lets the boundary keep
 * the source read-only. The clone's `origin` is the source's own remote, so a
 * push lands where it always did.
 */
import { rm } from "node:fs/promises";
import { basename } from "node:path";
import type { WorkspaceCheckout, WorkspaceRef } from "@whiffle/core";
import { closeBoundary, ensureBoundary } from "./boundary";
import { expandHome } from "./fs";

/** Runs git, answering its stdout; its stderr is the error. */
const git = async (dir: string, ...args: string[]): Promise<string> => {
  const run = await Bun.$`git -C ${dir} ${args}`.quiet().nothrow();
  if (run.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed: ${run.stderr.toString().trim()}`);
  }
  return run.text().trim();
};

/**
 * {@link CONTROL_WORKSPACE_CREATE}: a shared clone on `ws/<id8>` from the
 * source's `origin/main`, and its boundary. The clone keeps no ref of the
 * source's but `origin/main`, so its branch list is its own; a boundary that
 * cannot start takes the clone with it.
 */
export const createWorkspace = async (
  cwd: unknown,
  workspaceId: unknown
): Promise<WorkspaceCheckout> => {
  const dir = expandHome(String(cwd));
  const top = await Bun.$`git -C ${dir} rev-parse --show-toplevel`
    .quiet()
    .nothrow();
  if (top.exitCode !== 0) {
    throw new Error(
      `${dir} is not in a git repository, so it cannot have a workspace: ${top.stderr.toString().trim()}`
    );
  }
  const repoRoot = top.text().trim();
  const id = String(workspaceId);
  const id8 = id.slice(0, 8);
  const remote = await git(repoRoot, "remote", "get-url", "origin");
  const base = await git(
    repoRoot,
    "rev-parse",
    "--verify",
    "origin/main^{commit}"
  );
  const path = expandHome(`~/.worktrees/${basename(repoRoot)}-${id8}`);
  const branch = `ws/${id8}`;

  await git(
    repoRoot,
    "clone",
    "--quiet",
    "--shared",
    "--no-checkout",
    repoRoot,
    path
  );
  try {
    const copied = await git(
      path,
      "for-each-ref",
      "--format=%(refname)",
      "refs/remotes",
      "refs/heads"
    );
    for (const ref of copied.split("\n").filter(Boolean)) {
      // biome-ignore lint/performance/noAwaitInLoops: a fresh clone holds a handful of refs, deleted one git call at a time
      await git(path, "update-ref", "-d", ref);
    }
    await git(path, "remote", "set-url", "origin", remote);
    await git(path, "update-ref", "refs/remotes/origin/main", base);
    await git(path, "checkout", "--quiet", "-b", branch, "origin/main");
    const boundary = await ensureBoundary({ id, path });
    return { repoRoot, path, branch, boundaryPid: boundary.pid };
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
};

/** {@link CONTROL_WORKSPACE_BOUNDARY}: the boundary, running; answers its pid. */
export const workspaceBoundary = async (ref: unknown): Promise<number> =>
  (await ensureBoundary(ref as WorkspaceRef)).pid;

/** {@link CONTROL_WORKSPACE_ARCHIVE}: the boundary killed with everything in it, then the clone deleted. */
export const archiveWorkspace = async (ref: unknown): Promise<void> => {
  const workspace = ref as WorkspaceRef;
  await closeBoundary(workspace);
  await rm(workspace.path, { recursive: true, force: true });
};

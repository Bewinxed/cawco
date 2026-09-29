/**
 * A delegation workspace's checkout, on the machine that holds it. The hub
 * owns the workspace record; the machine cuts the clone (`./clone`) and
 * starts its boundary once, keeps the boundary running while the workspace's
 * sessions can be continued, and deletes it all on archive.
 */
import { rm } from "node:fs/promises";
import { basename } from "node:path";
import type { WorkspaceCheckout, WorkspaceRef } from "@whiffle/core";
import { closeBoundary, ensureBoundary } from "./boundary";
import { git, prepareClone } from "./clone";
import { expandHome } from "./fs";

/**
 * {@link CONTROL_WORKSPACE_CREATE}: a shared clone on `ws/<id8>` from the
 * source's `origin/main`, and its boundary. A boundary that cannot start
 * takes the clone with it.
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
  const path = expandHome(`~/.worktrees/${basename(repoRoot)}-${id8}`);
  const branch = `ws/${id8}`;
  await prepareClone(repoRoot, path);
  try {
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

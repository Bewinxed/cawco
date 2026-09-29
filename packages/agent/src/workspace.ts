/**
 * A delegation workspace's checkout, on the machine that holds it. The hub
 * owns the workspace record; cutting the worktree, once, is all it needs the
 * machine for. The checkout stays as long as its sessions can be continued.
 */
import { basename } from "node:path";
import type { WorkspaceCheckout } from "@whiffle/core";
import { expandHome } from "./fs";

/** {@link CONTROL_WORKSPACE_CREATE}: a new worktree on `ws/<id8>` from `origin/main`. */
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
  const id8 = String(workspaceId).slice(0, 8);
  const path = expandHome(`~/.worktrees/${basename(repoRoot)}-${id8}`);
  const branch = `ws/${id8}`;
  const added =
    await Bun.$`git -C ${repoRoot} worktree add -b ${branch} ${path} origin/main`
      .quiet()
      .nothrow();
  if (added.exitCode !== 0) {
    throw new Error(
      `git worktree add failed: ${added.stderr.toString().trim()}`
    );
  }
  return { repoRoot, path, branch };
};

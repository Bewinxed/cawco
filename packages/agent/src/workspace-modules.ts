/**
 * A Linux workspace's `node_modules`, kept in the workspaces' cache so bun
 * hard-links what its global store cannot hold.
 *
 * With bun's global virtual store on (boundary.ts `writeBunConfig`), a
 * package is a link into `<cache>/bun/links/` only while it is eligible:
 * "unpatched, no lifecycle scripts) *and* every dependency it links to is
 * also eligible", and since bun 1.4.4 none whose peer has an `@types`
 * package the entry does not depend on ("From the cache TypeScript cannot
 * reach the project's `@types`", src/install/isolated_install.rs at
 * bun-v1.4.4). The rest bun installs into the project's own
 * `node_modules/.bun`, hard-linking each file from its cache, and falling
 * back to copying it on EXDEV ("sys::Errno::EXDEV => InstallMethod::Copyfile",
 * src/install/isolated_install/Installer.rs). Inside a boundary the clone and
 * the workspaces' cache are each a bind mount of their own, and link(2)
 * refuses across mount points, so every such package was copied into every
 * clone: 72 entries, 285 MiB a cockpit clone (round r336).
 *
 * So a workspace's `node_modules` is a link to a folder of its own in the
 * cache, `<cache>/modules/<workspace id>/node_modules`, which bun 1.4.4
 * installs through ("Both linkers now install through the symlink",
 * bun.com/blog/bun-v1.4.4): bun's cache and that folder are one mount, and
 * each file is a hard link again. The folder is named `node_modules`, so a
 * package's lookup up from `node_modules/.bun` still reaches the root's
 * packages. It is named by the workspace, never by its path: every Linux
 * view of one folder has the folder's own path (layer.ts). The folder goes
 * with the workspace (workspace.ts `cacheOfWorkspace`).
 *
 * In a Linux view the link is made through the view (layer.ts
 * `copyPathSync`), so it is the view's own, in its upper: the person's
 * folder is never written, and the change set never carries it (layer.ts
 * `notCarried`). In a clone cut before layers it is made in the clone.
 *
 * Made at every boundary start, only where bun installs (a `bun.lock` or
 * `bun.lockb` at the root) and nothing is there yet: a `node_modules` the
 * copy has already (in a view, the person's own, read through it) is its
 * own. In a repository only where git ignores `node_modules` as a file, so
 * the link never shows in its status; a folder that is no repository has no
 * status to show it in. A person's own folder (a place) gets none, nor does
 * macOS, where bun clones files inside its boundary already (Seatbelt makes
 * no mounts).
 */
import { lstat, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceRef } from "@cawco/core";
import { workspaceCacheDir } from "@cawco/core/paths";
import { SAFE_GIT_ENV, SAFE_GIT_FLAGS } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { isPlace } from "@cawco/core/workspace-policy";
import { copyPathSync, folderSync, inCopySync, viewRunning } from "./layer";

/** The lockfiles that say bun installs a workspace. */
const BUN_LOCKS = ["bun.lock", "bun.lockb"];

/** The folder of the cache workspace `id`'s `node_modules` links into. */
export const workspaceModulesRoot = (id: string): string =>
  join(workspaceCacheDir(), "modules", id);

const exists = async (path: string): Promise<boolean> =>
  (await lstat(path).catch(() => undefined)) !== undefined;

/**
 * Whether git ignores `node_modules` as a file in `ref`'s copy, asked there
 * (through its view on Linux): `-q` answers nothing and exits 0 only where a
 * rule ignores it, and a path not there is read as a file, as the link will
 * be.
 */
const ignoredInCopy = async (ref: WorkspaceRef): Promise<boolean> => {
  const run = inCopySync(ref.id, ref.path, [
    "git",
    ...SAFE_GIT_FLAGS,
    "-C",
    ref.path,
    "check-ignore",
    "-q",
    "node_modules",
  ]);
  const child = Bun.spawn(run.argv, {
    cwd: run.cwd,
    env: { ...hostEnvironment(), ...SAFE_GIT_ENV },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await child.exited) === 0;
};

/** Links `ref`'s `node_modules` into its folder in the cache, where that is the workspace's to have. */
export const linkWorkspaceModules = async (
  ref: WorkspaceRef
): Promise<void> => {
  if (process.platform !== "linux" || isPlace(ref.id)) {
    return;
  }
  await viewRunning(ref.id);
  const root = copyPathSync(ref.id, ref.path);
  const link = join(root, "node_modules");
  const [locked, there] = await Promise.all([
    Promise.all(BUN_LOCKS.map((name) => exists(join(root, name)))),
    exists(link),
  ]);
  if (there || !locked.some(Boolean)) {
    return;
  }
  if (!(folderSync(ref.id) || (await ignoredInCopy(ref)))) {
    return;
  }
  const target = join(workspaceModulesRoot(ref.id), "node_modules");
  await mkdir(target, { recursive: true });
  await symlink(target, link).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") {
      throw error;
    }
  });
  console.info(
    `[workspace] ${ref.id}: its node_modules links to ${target}, in the workspaces' cache, so bun hard-links its packages there`
  );
};

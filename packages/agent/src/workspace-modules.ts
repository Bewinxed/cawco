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
 * So a clone's `node_modules` is a link to a folder of its own in the
 * cache, `<cache>/modules/<clone's folder name>/node_modules`, which bun
 * 1.4.4 installs through ("Both linkers now install through the symlink",
 * bun.com/blog/bun-v1.4.4): bun's cache and that folder are one mount, and
 * each file is a hard link again. The folder is named `node_modules`, so a
 * package's lookup up from `node_modules/.bun` still reaches the root's
 * packages. The folder goes with the workspace (workspace.ts
 * `cacheOfClone`).
 *
 * Made at every boundary start, only for a clone bun installs (a `bun.lock`
 * or `bun.lockb` at its root) whose `node_modules` git ignores as a file, so
 * the link never shows in its status, and only where nothing is there yet:
 * a `node_modules` the clone has already is its own. A person's own folder
 * (a place) gets none, nor does macOS, where bun clones files inside its
 * boundary already (Seatbelt makes no mounts).
 */
import { lstat, mkdir, symlink } from "node:fs/promises";
import { basename, join } from "node:path";
import type { WorkspaceRef } from "@cawco/core";
import { workspaceCacheDir } from "@cawco/core/paths";
import { isPlace } from "@cawco/core/workspace-policy";
import { gitIn } from "./checkout-exclude";

/** The lockfiles that say bun installs a clone. */
const BUN_LOCKS = ["bun.lock", "bun.lockb"];

/** The folders of the cache a clone's `node_modules` links into, one per clone, by its folder name. */
export const workspaceModulesRoot = (clone: string): string =>
  join(workspaceCacheDir(), "modules", basename(clone));

const exists = async (path: string): Promise<boolean> =>
  (await lstat(path).catch(() => undefined)) !== undefined;

/** Links `ref`'s clone's `node_modules` into its folder in the cache, where that is the clone's to have. */
export const linkWorkspaceModules = async (
  ref: WorkspaceRef
): Promise<void> => {
  if (process.platform !== "linux" || isPlace(ref.id)) {
    return;
  }
  const link = join(ref.path, "node_modules");
  const [locked, there] = await Promise.all([
    Promise.all(BUN_LOCKS.map((name) => exists(join(ref.path, name)))),
    exists(link),
  ]);
  if (there || !locked.some(Boolean)) {
    return;
  }
  // `-q` answers nothing and exits 0 only where a rule ignores it: a path
  // not there is read as a file, as the link will be.
  const ignored = await gitIn(ref.path, ["check-ignore", "-q", "node_modules"]);
  if (ignored === undefined) {
    return;
  }
  const target = join(workspaceModulesRoot(ref.path), "node_modules");
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

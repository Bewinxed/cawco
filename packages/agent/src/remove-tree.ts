/**
 * The one removal of a tree a workspace wrote: its clone, its scratch dir
 * (its commands' `TMPDIR`), its state dir, its git door's dir, the caches of
 * its own, a stage clone cut again. Any of them may hold folders their
 * owner's own tools made read-only: Go leaves its module cache's folders
 * (`gopath/pkg/mod/**`) read-only, and on 2026-10-23 a discard of a
 * workspace whose scratch dir held one failed with "EACCES:
 * permission denied, rm '/home/bewinxed/.cawco/tmp/271eb386'" until a
 * `chmod -R u+w` by hand.
 */
import { chmod, lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** What `rm` answers when a folder on the way refuses its owner: read-only, or unreadable. */
const REFUSED: ReadonlySet<string> = new Set(["EACCES", "EPERM"]);

/** A mode's owner bits, and its permission bits (chmod(2)'s whole range). */
const ownerBits = (mode: number): number => Math.floor(mode / 0o100) % 0o10;
const permissionBits = (mode: number): number => mode % 0o1_0000;

/**
 * Every folder under `dir` (`dir` too) given its owner's read, write and
 * search bits where it lacks one, each before it is read, so a folder of no
 * read is walked too. A link is never followed: only folders of the tree
 * itself change.
 */
const ownerMayRemove = async (dir: string): Promise<void> => {
  const info = await lstat(dir).catch(() => undefined);
  if (!info?.isDirectory()) {
    return;
  }
  if (ownerBits(info.mode) !== 0o7) {
    const mode = permissionBits(info.mode);
    await chmod(dir, mode - ownerBits(mode) * 0o100 + 0o700);
  }
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // biome-ignore lint/performance/noAwaitInLoops: one folder at a time, each opened before the ones inside it
      await ownerMayRemove(join(dir, entry.name));
    }
  }
};

/**
 * Removes the tree at `path`, a link there as the link itself; nothing there
 * is no error. A tree with a folder its owner may not write or read (a Go
 * module cache) has every such folder given back to its owner, then goes
 * whole. Any other failure throws.
 */
export const removeTree = async (path: string): Promise<void> => {
  try {
    await rm(path, { recursive: true, force: true });
    return;
  } catch (error) {
    if (!REFUSED.has((error as NodeJS.ErrnoException).code ?? "")) {
      throw error;
    }
  }
  await ownerMayRemove(path);
  await rm(path, { recursive: true, force: true });
};

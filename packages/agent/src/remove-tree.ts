/**
 * The one removal of a tree a workspace wrote: its clone, its scratch dir
 * (its commands' `TMPDIR`), its state dir, its git door's dir, the caches of
 * its own, a stage clone cut again. Any of them may hold folders their
 * owner's own tools made read-only: Go leaves its module cache's folders
 * (`gopath/pkg/mod/**`) read-only, and on 2026-10-23 a discard of a
 * workspace whose scratch dir held one failed with "EACCES:
 * permission denied, rm '/home/bewinxed/.cawco/tmp/271eb386'" until a
 * `chmod -R u+w` by hand. CawCo makes one too: the read-only `.opencode`
 * stand-in (core workspace-policy.ts `OPENCODE_DIR`, 0555), in a clone and
 * in a workspace layer's upper, which may hold what was written there. Bun's
 * `rm` names only the top of the tree it was given for a refusal anywhere
 * below it, and removes nothing. A scratch fleet's folders hold all of
 * these, and go the same way (scripts/scratch-fleet.ts).
 */
import { chmodSync, lstatSync, readdirSync, rmSync } from "node:fs";
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

/** {@link ownerMayRemove}, where nothing can wait: an exit or a signal. */
const ownerMayRemoveSync = (dir: string): void => {
  let info: ReturnType<typeof lstatSync> | undefined;
  try {
    info = lstatSync(dir);
  } catch {
    return;
  }
  if (!info.isDirectory()) {
    return;
  }
  if (ownerBits(info.mode) !== 0o7) {
    const mode = permissionBits(info.mode);
    chmodSync(dir, mode - ownerBits(mode) * 0o100 + 0o700);
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      ownerMayRemoveSync(join(dir, entry.name));
    }
  }
};

/** Whether `error` is `rm`'s refusal by a folder on the way ({@link REFUSED}); any other is thrown. */
const refused = (error: unknown): true => {
  if (!REFUSED.has((error as NodeJS.ErrnoException).code ?? "")) {
    throw error;
  }
  return true;
};

/**
 * Removes the tree at `path`, a link there as the link itself; nothing there
 * is no error. A tree with a folder its owner may not write or read (a Go
 * module cache, a layer's `.opencode`) has every such folder given back to
 * its owner, then goes whole. Any other failure throws.
 */
export const removeTree = async (path: string): Promise<void> => {
  try {
    await rm(path, { recursive: true, force: true });
    return;
  } catch (error) {
    refused(error);
  }
  await ownerMayRemove(path);
  await rm(path, { recursive: true, force: true });
};

/** {@link removeTree}, where nothing can wait: an exit or a signal. */
export const removeTreeSync = (path: string): void => {
  try {
    rmSync(path, { recursive: true, force: true });
    return;
  } catch (error) {
    refused(error);
  }
  ownerMayRemoveSync(path);
  rmSync(path, { recursive: true, force: true });
};

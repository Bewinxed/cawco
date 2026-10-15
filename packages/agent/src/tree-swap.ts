/**
 * A tree CawCo writes where a running session reads it (a fleet skill, a
 * vendored plugin), replaced with one rename.
 *
 * The path a session reads, `<dir>/<name>`, is a relative link into the tree
 * store beside the dir (core paths.ts `TREE_STORE_DIR`). A new version is
 * written whole as a fresh tree in the store, a new link to it is made beside
 * the old one, and the new link is renamed over the old: the path names the
 * old tree or the new one at every instant, never a missing or half-written
 * one. Then this name's other trees go. On 2026-10-16 every Bash call in a
 * Claude Code session intermittently failed its PostToolUse hook with
 * `python3: can't open file '…/plugins/axiom/hooks/posttool-bash-hints.py'`
 * while the agent removed the plugin's folder and wrote it back file by file.
 *
 * Claude Code runs a directory marketplace's plugin from the link's own path
 * (`CLAUDE_PLUGIN_ROOT` is `<marketplace>/plugins/<name>`, the link, not its
 * target), and Claude Code, OpenCode and pi all follow a linked skill folder.
 */
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { SkillFile } from "@cawco/core";
import { TREE_STORE_DIR } from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";

/** The store of the trees the entries of `dir` link to. */
export const treeStoreOf = (dir: string): string =>
  join(dirname(dir), TREE_STORE_DIR, basename(dir));

/** A tree of `name` in its store: the name and eight hex digits. */
const treeName = (name: string): string =>
  `${name}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;

const TREE_SUFFIX = /^[0-9a-f]{8}$/;

const isTreeOf = (name: string, entry: string): boolean =>
  entry.length === name.length + 9 &&
  entry.startsWith(`${name}-`) &&
  TREE_SUFFIX.test(entry.slice(name.length + 1));

/**
 * One file onto disk under `dir`, executable when its source was. Every
 * write is a fresh file in a fresh tree, so a bit that flipped off in the
 * source lands off here too.
 */
const writeTreeFile = async (dir: string, file: SkillFile): Promise<void> => {
  await writeStateFile(
    join(dir, file.path),
    Buffer.from(file.contentBase64, "base64"),
    file.executable ? { mode: 0o755 } : {}
  );
};

/** Takes away every tree of `name` in `store` but `keep`. */
const dropTrees = async (
  store: string,
  name: string,
  keep?: string
): Promise<void> => {
  const entries = await readdir(store).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((entry) => entry !== keep && isTreeOf(name, entry))
      .map((entry) => rm(join(store, entry), { recursive: true, force: true }))
  );
};

/**
 * `files` as the tree at `path` (`<dir>/<name>`), swapped in with one rename
 * (module doc). A plain folder already at `path`, from before trees were
 * swapped, is moved into the store first and goes with the old trees.
 */
export const placeTree = async (
  path: string,
  files: readonly SkillFile[]
): Promise<void> => {
  const dir = dirname(path);
  const name = basename(path);
  const store = treeStoreOf(dir);
  const tree = join(store, treeName(name));
  await Promise.all([
    mkdir(tree, { recursive: true }),
    mkdir(dir, { recursive: true }),
  ]);
  try {
    for (const file of files) {
      // biome-ignore lint/performance/noAwaitInLoops: one file at a time keeps a large plugin's writes bounded
      await writeTreeFile(tree, file);
    }
    const link = join(
      dir,
      `.${name}.cawco-${process.pid}-${randomUUID().slice(0, 8)}.tmp`
    );
    await symlink(relative(dir, tree), link);
    try {
      const current = await lstat(path).catch(() => undefined);
      if (current?.isDirectory()) {
        await rename(path, join(store, treeName(name)));
      }
      await rename(link, path);
    } catch (error) {
      await rm(link, { force: true });
      throw error;
    }
  } catch (error) {
    await rm(tree, { recursive: true, force: true });
    throw error;
  }
  await dropTrees(store, name, basename(tree));
};

/** The tree at `path` taken away: its link (or a plain folder) and its trees. */
export const removeTree = async (path: string): Promise<void> => {
  await rm(path, { recursive: true, force: true });
  await dropTrees(treeStoreOf(dirname(path)), basename(path));
};

/** The tree the link at `path` points to; undefined for anything but a link. */
export const linkedTree = async (path: string): Promise<string | undefined> =>
  (await lstat(path).catch(() => undefined))?.isSymbolicLink()
    ? resolve(dirname(path), await readlink(path))
    : undefined;

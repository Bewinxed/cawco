/**
 * A tree CawCo writes where a running session reads it (a fleet skill, a
 * vendored plugin), replaced with one rename, and judged by the files the
 * fleet carried for it.
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
 *
 * Every tree carries the list of the files the fleet sent ({@link CARRIED}).
 * Its hash ({@link heldHash}) covers exactly those, so a file the tree's own
 * code made (`__pycache__`) or a person added (a `notes.md`) is no change to
 * it, and the next version takes such files along ({@link placeTree}).
 */
import { randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  utimes,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { SkillFile } from "@cawco/core";
import { hashFiles } from "@cawco/core/file-hash";
import { TREE_STORE_DIR } from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";

/**
 * The paths of the files the fleet carried for a tree, as a JSON list in the
 * tree, written with it. Not one of those files, and a name no carried file
 * may take.
 */
export const CARRIED = ".cawco-carried.json";

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

/** A path a tree's file may take: inside it, never out of it. */
const isInside = (path: string): boolean =>
  path !== "" && !path.startsWith("/") && !path.split("/").includes("..");

/** What a tree's carried list names; undefined for a tree that keeps none. */
export const carriedList = async (
  tree: string
): Promise<string[] | undefined> => {
  const listed: unknown = await Bun.file(join(tree, CARRIED))
    .json()
    .catch(() => undefined);
  return Array.isArray(listed) &&
    listed.every((path) => typeof path === "string")
    ? (listed as string[])
    : undefined;
};

/** Every file and link under `root`, relative to it; the root itself followed. */
const entriesUnder = async (root: string, prefix = ""): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const paths: string[] = [];
  for (const entry of entries) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      // biome-ignore lint/performance/noAwaitInLoops: one directory at a time keeps the reads bounded
      paths.push(...(await entriesUnder(join(root, entry.name), `${path}/`)));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      paths.push(path);
    }
  }
  return paths;
};

/**
 * The hash of the tree at `path` as it is on disk, in the hub's `hashFiles`,
 * over exactly the files the fleet carried for it: its {@link CARRIED} list.
 * A tree written before trees kept one is read over `known`, the files the
 * fleet carries for it now, when the caller has them, and otherwise over
 * every file in it, as every tree was read before (so an edit made then still
 * reads as one). A carried file that is missing counts in it as missing,
 * never equal to the fleet's. Undefined when nothing is there.
 */
export const heldHash = async (
  path: string,
  known?: readonly string[]
): Promise<string | undefined> => {
  if (!(await stat(path).catch(() => undefined))?.isDirectory()) {
    return undefined;
  }
  const list = (await carriedList(path)) ?? known ?? (await entriesUnder(path));
  if (list.length === 0) {
    return undefined;
  }
  const files: SkillFile[] = [];
  for (const each of list) {
    const file = join(path, each);
    const found = isInside(each) ? stat(file) : Promise.reject();
    // biome-ignore lint/performance/noAwaitInLoops: one file read at a time keeps the disk reads bounded
    const stats = await found.catch(() => undefined);
    files.push(
      stats?.isFile()
        ? {
            path: each,
            contentBase64: Buffer.from(await Bun.file(file).bytes()).toString(
              "base64"
            ),
            // biome-ignore lint/suspicious/noBitwiseOperators: the execute bits of a stat mode are a mask, and the mask is the question
            executable: (stats.mode & 0o111) !== 0,
          }
        : { path: `${each}\0missing`, contentBase64: "", executable: false }
    );
  }
  return hashFiles(files);
};

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

/**
 * Gives `written` a whole second of modification time other than `replaced`'s,
 * the file of the same path in the tree it replaces. What was built from the
 * old file and is taken along (a `.pyc`, which Python takes as current while
 * its source's whole-second mtime and size match) is then built again: on
 * 2026-10-16 a module changed from v3 to v4 within one second, at one size,
 * and the hook went on printing v3.
 */
const newerThan = async (written: string, replaced: string): Promise<void> => {
  const before = await stat(replaced).catch(() => undefined);
  if (!before) {
    return;
  }
  const second = Math.floor(before.mtimeMs / 1000);
  if (Math.floor((await stat(written)).mtimeMs / 1000) === second) {
    await utimes(written, new Date(), second + 1);
  }
};

/** One file or link of the current tree into the new one, as it is. */
const carryOver = async (from: string, to: string): Promise<void> => {
  await mkdir(dirname(to), { recursive: true });
  const found = await lstat(from);
  if (found.isSymbolicLink()) {
    await symlink(await readlink(from), to);
    return;
  }
  await copyFile(from, to);
  // biome-ignore lint/suspicious/noBitwiseOperators: the permission bits of a stat mode are a mask
  await chmod(to, found.mode & 0o7777);
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
 * `files` as the tree at `path` (`<dir>/<name>`), with their {@link CARRIED}
 * list, swapped in with one rename (module doc).
 *
 * What the current tree holds that the fleet did not carry (neither in its
 * list nor in `files`: a `__pycache__`, a note someone added) is taken into
 * the new tree as it is, so an update loses nothing of anyone's. A file the
 * last version carried and this one does not goes. A tree written before
 * trees kept a list is read with `known` as its list (the files the fleet
 * carries for it now); with neither, nothing of it is taken along. A plain
 * folder at `path`, from before trees were swapped, is moved into the store
 * first and goes with the old trees.
 */
export const placeTree = async (
  path: string,
  files: readonly SkillFile[],
  known?: readonly string[]
): Promise<void> => {
  const reserved = files.find((file) => file.path === CARRIED);
  if (reserved) {
    throw new Error(`unsafe path ${reserved.path}`);
  }
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
      await newerThan(join(tree, file.path), join(path, file.path));
    }
    const before = (await carriedList(path)) ?? known;
    if (before) {
      const fleet = new Set([...before, ...files.map((file) => file.path)]);
      // The folders the new files lie in, which no file taken along may be.
      const folders = new Set(
        files.flatMap((file) =>
          file.path
            .split("/")
            .slice(0, -1)
            .map((_, at, parts) => parts.slice(0, at + 1).join("/"))
        )
      );
      // A carried file's path holds a file, so nothing may go beneath it.
      const under = (each: string) =>
        each
          .split("/")
          .some((_, at, parts) => fleet.has(parts.slice(0, at + 1).join("/")));
      for (const each of await entriesUnder(path)) {
        if (each !== CARRIED && !under(each) && !folders.has(each)) {
          // biome-ignore lint/performance/noAwaitInLoops: one file at a time keeps the copies bounded
          await carryOver(join(path, each), join(tree, each));
        }
      }
    }
    await writeStateFile(
      join(tree, CARRIED),
      `${JSON.stringify(files.map((file) => file.path))}\n`
    );
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

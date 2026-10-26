/**
 * A workspace's cut (workspace.ts `createWorkspace`) marked under way on disk
 * before it writes anything at its clone's path, and the reading that tells
 * a cut cut short from anyone else's folder there.
 *
 * A cut writes for minutes: `git clone`, a fetch, a checkout, the secret
 * files, the boundary. An agent that ends meanwhile (a restart for an
 * install, a crash, a full disk) leaves what it had written, and the hub's
 * create is answered that it was not run again (request-record.ts). On
 * 2026-10-23 two retired workspaces' recuts were cut off at 12:47 by the
 * nightly install's restart, one leaving only a `.git` (1.4 GB), the other a
 * partial checkout, and every later handoff to their sessions was refused
 * because something stood at the path. That refusal stays for anyone
 * else's folder: a cut that failed takes its path with it, unread (its
 * `unmade` archive), so a cut started over someone's files would delete
 * them. Only a folder that holds nothing but what this workspace's own cut
 * writes ({@link ownCutProblem}) is cleared and cut again.
 *
 * `cut.json` in the workspace's state dir is the mark ({@link markCut}):
 * written once the path is found empty, before the clone, and taken away
 * once the cut is whole ({@link cutMade}). The agent's start clears every
 * cut its last process left marked (workspace.ts `clearUnfinished`).
 */
import type { Stats } from "node:fs";
import { lstat, readdir, readFile, readlink, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import type { WorkspaceCut } from "@cawco/core";
import { isGitDir } from "@cawco/core/git-dir";
import { isSecretFileName, workspacesDir } from "@cawco/core/paths";
import { repositoryConfigProblem } from "@cawco/core/safe-git";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { placedAsMade } from "./fleet";
import { hostGit } from "./host-git";
import { straysAmong } from "./stand-ins";

/** A cut under way: the clone's path, the repository it is cut from, and the commit a cut again starts at (none for a first cut). */
export interface CutMark {
  at: WorkspaceCut | null;
  path: string;
  source: string;
}

const markOf = (id: string): string => join(workspacesDir(), id, "cut.json");

/** Marks workspace `id`'s cut under way, before it writes anything at `mark.path`. */
export const markCut = (id: string, mark: CutMark): Promise<void> =>
  writeStateFile(markOf(id), `${JSON.stringify(mark)}\n`);

/** Workspace `id`'s cut is whole: its mark goes. */
export const cutMade = (id: string): Promise<void> =>
  rm(markOf(id), { force: true });

/** Workspace `id`'s cut under way, as its mark says; nothing when none is. */
export const cutMark = (id: string): Promise<CutMark | undefined> =>
  readRecord<CutMark>(markOf(id));

/**
 * The path workspace `id`'s `create.json` names for its clone, written
 * before every clone (a build before {@link markCut} wrote only this);
 * nothing when it has none or it cannot be read.
 */
export const createdAt = async (id: string): Promise<string | undefined> =>
  (
    await readRecord<{ path?: unknown }>(
      join(workspacesDir(), id, "create.json")
    ).catch(() => undefined)
  )?.path as string | undefined;

/** Up to {@link NAMED} entries by name, and how many there are. */
const NAMED = 5;
export const entryWords = (entries: readonly string[]): string => {
  const named = entries.slice(0, NAMED).join(", ");
  const more =
    entries.length > NAMED ? `, and ${entries.length - NAMED} more` : "";
  return `${entries.length} ${entries.length === 1 ? "entry" : "entries"} (${named}${more})`;
};

/** The entries of the folder at `path`, by name, sorted. */
export const entriesAt = async (path: string): Promise<string[]> =>
  (await readdir(path)).sort();

type Git = (args: readonly string[]) => Promise<string>;

/**
 * git on this host in the folder at `path`, its git directory and work tree
 * named so git never looks in a folder above it (clone.ts `hostGit`).
 */
const gitAt =
  (path: string): Git =>
  async (args) => {
    const ran = await hostGit(path, [
      `--git-dir=${join(path, ".git")}`,
      `--work-tree=${path}`,
      ...args,
    ]);
    if (ran.exitCode !== 0) {
      throw new Error(
        `git ${args[0]} failed in ${path}: ${ran.stderr.toString().trim() || `exit ${ran.exitCode}`}`
      );
    }
    return ran.text();
  };

/** git's stdout in source repository `source`, or nothing when it fails there. */
const sourceSays = async (
  source: string,
  args: readonly string[]
): Promise<string | undefined> => {
  const ran = await hostGit(source, args).catch(() => undefined);
  return ran?.exitCode === 0 ? ran.text().trim() : undefined;
};

/**
 * What at `path` is not the cut `mark` describes would write, in words;
 * nothing when all of it is: a folder holding a `.git` folder, git's config
 * there within what CawCo runs git under (safe-git.ts), cloned from `source`
 * (`origin` its path, or its own remote once the cut named that); no commit
 * on a branch or stash that is neither the source's own nor reached by
 * `origin` or the commit the cut starts at; and beside the `.git`, only files
 * of that commit (a first cut's, `origin/HEAD`) exactly as checkout writes
 * them, copies of the source's own secret files, and what CawCo writes in a
 * clone (stand-ins.ts `straysAmong`). A file the checkout had not reached yet
 * is simply not there. Read on this host, as a closed clone is
 * (workspace.ts `closedCloneGit`): nothing runs in it meanwhile.
 */
export const ownCutProblem = async (
  mark: CutMark
): Promise<string | undefined> => {
  try {
    return await readCut(mark);
  } catch (error) {
    return `it could not be read: ${error instanceof Error ? error.message : String(error)}`;
  }
};

/** {@link ownCutProblem}'s reading, which may throw. */
const readCut = async ({
  path,
  source,
  at,
}: CutMark): Promise<string | undefined> => {
  const folder = await lstat(path);
  if (!folder.isDirectory()) {
    return `${path} is ${folder.isSymbolicLink() ? "a link" : "a file"}, no folder`;
  }
  const others = (await entriesAt(path)).filter((name) => name !== ".git");
  const dotGit = join(path, ".git");
  const early = await beforeRepository(dotGit, others);
  if (early.settled) {
    return early.problem;
  }
  const git = gitAt(path);
  const wrong =
    (await originProblem(git, dotGit, source)) ??
    (await commitsBeyond(git, source, at));
  if (wrong || others.length === 0) {
    return wrong;
  }
  return await filesProblem(path, source, git, at, others);
};

/**
 * What a `.git` that is no repository git can read yet settles: none at all,
 * or a clone killed as it began, is the cut's when nothing else is there
 * (nothing committed can be there yet); one that is no folder, or whose
 * config holds what CawCo runs no git under, is not. `settled: false` for a
 * repository, read on.
 */
const beforeRepository = async (
  dotGit: string,
  others: readonly string[]
): Promise<{ problem?: string; settled: boolean }> => {
  const found = await lstat(dotGit).catch(() => undefined);
  if (!found) {
    return {
      settled: true,
      problem:
        others.length === 0
          ? undefined
          : `it holds ${entryWords(others)} and no .git`,
    };
  }
  if (!found.isDirectory()) {
    return {
      settled: true,
      problem: `its .git is ${found.isSymbolicLink() ? "a link" : "a file"}, which no cut makes`,
    };
  }
  const problem = await repositoryConfigProblem(dotGit);
  if (problem) {
    return { settled: true, problem };
  }
  if (await isGitDir(dotGit)) {
    return { settled: false };
  }
  return {
    settled: true,
    problem:
      others.length === 0
        ? undefined
        : `its .git is no repository, and it holds ${entryWords(others)}`,
  };
};

/** Why the clone is no clone of `source`: its `origin` neither the source's path nor its remote. */
const originProblem = async (
  git: Git,
  dotGit: string,
  source: string
): Promise<string | undefined> => {
  const origin = (
    await git([
      "config",
      "--file",
      join(dotGit, "config"),
      "--get",
      "remote.origin.url",
    ]).catch(() => "")
  ).trim();
  if (origin === source) {
    return;
  }
  const sourceOrigin = await sourceSays(source, [
    "remote",
    "get-url",
    "origin",
  ]);
  return origin === sourceOrigin
    ? undefined
    : `its .git is a clone of ${origin || "no remote"}, not of ${source}`;
};

/** The files beside `.git` that a checkout of the cut's commit did not write, in words. */
const filesProblem = async (
  path: string,
  source: string,
  git: Git,
  at: WorkspaceCut | null,
  others: readonly string[]
): Promise<string | undefined> => {
  const start =
    at?.commit ??
    (await git([
      "rev-parse",
      "--verify",
      "-q",
      "refs/remotes/origin/HEAD^{commit}",
    ]).then(
      (out) => out.trim(),
      () => undefined
    ));
  if (!start) {
    return `it holds ${entryWords(others)}, and its .git has no commit they could be checked out from`;
  }
  const foreign = await notCheckedOut(path, source, git, start);
  return foreign.length === 0
    ? undefined
    : `it holds ${entryWords(foreign)} that a checkout of ${start.slice(0, 9)} did not write`;
};

/**
 * The commits on the clone's branches and stash that are nowhere else, in
 * words: tips that are neither the commit the cut starts at (`at`) nor a
 * ref tip of the source (a `git clone` copies those before the cut deletes
 * them, clone.ts `prepareClone`), counted past `origin`'s branches and `at`.
 */
const commitsBeyond = async (
  git: Git,
  source: string,
  at: WorkspaceCut | null
): Promise<string | undefined> => {
  const tips = (
    await git([
      "for-each-ref",
      "--format=%(objectname)",
      "refs/heads",
      "refs/stash",
    ])
  )
    .split("\n")
    .filter(Boolean);
  const sourceTips = new Set(
    (await sourceSays(source, ["for-each-ref", "--format=%(objectname)"]))
      ?.split("\n")
      .filter(Boolean) ?? []
  );
  const own = tips.filter((tip) => tip !== at?.commit && !sourceTips.has(tip));
  if (own.length === 0) {
    return;
  }
  const known =
    at &&
    (await git(["cat-file", "-e", `${at.commit}^{commit}`]).then(
      () => true,
      () => false
    ))
      ? [at.commit]
      : [];
  const count = Number(
    (
      await git([
        "rev-list",
        "--count",
        ...own,
        "--not",
        "--remotes=origin",
        ...known,
      ])
    ).trim()
  );
  return count > 0
    ? `its .git holds ${count} commit${count === 1 ? "" : "s"} on no branch of origin${at ? ` and not on ${at.commit.slice(0, 9)}, the commit it was cut again at` : ""}`
    : undefined;
};

/** A tree entry of the commit a cut checks out: its mode and object. */
interface TreeEntry {
  mode: string;
  object: string;
}

/**
 * The entries beside `.git` at `path` that a checkout of `start` did not
 * write, by path: a file of the commit whose content or kind differs, a
 * submodule's folder that is not empty, and anything the commit does not
 * hold that is no copy of the source's own secret file and not CawCo's.
 */
const notCheckedOut = async (
  path: string,
  source: string,
  git: Git,
  start: string
): Promise<string[]> => {
  const tree = treeOf(await git(["ls-tree", "-r", "-z", "--full-tree", start]));
  const foreign: string[] = [];
  const untracked: string[] = [];
  const walk = async (rel: string): Promise<void> => {
    for (const name of await entriesAt(join(path, rel))) {
      const entry = rel ? `${rel}/${name}` : name;
      if (entry === ".git") {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one entry at a time, each read whole
      const kind = await entryKind(path, source, git, tree, entry);
      if (kind === "dir") {
        await walk(entry);
      } else if (kind === "foreign") {
        foreign.push(entry);
      } else if (kind === "untracked") {
        untracked.push(entry);
      }
    }
  };
  await walk("");
  const strays =
    untracked.length > 0
      ? await straysAmong(path, await placedAsMade(path), untracked)
      : [];
  return [...foreign, ...strays];
};

/** A commit's tree as `git ls-tree -r -z` lists it: each file by path, and the folders above them. */
interface Tree {
  dirs: ReadonlySet<string>;
  files: ReadonlyMap<string, TreeEntry>;
}

const treeOf = (listed: string): Tree => {
  const files = new Map<string, TreeEntry>();
  const dirs = new Set<string>();
  for (const line of listed.split("\0")) {
    const tab = line.indexOf("\t");
    if (tab < 0) {
      continue;
    }
    const [mode = "", , object = ""] = line.slice(0, tab).split(" ");
    const file = line.slice(tab + 1);
    files.set(file, { mode, object });
    const parts = file.split("/");
    for (let depth = 1; depth < parts.length; depth += 1) {
      dirs.add(parts.slice(0, depth).join("/"));
    }
  }
  return { dirs, files };
};

/**
 * What `entry` beside `.git` is to the checkout: a folder of the commit's to
 * walk (`dir`); a file of the commit as checkout writes it, an empty
 * submodule folder, or a copy of the source's secret file (`own`); one of
 * the commit's that differs, or a submodule folder with something in it
 * (`foreign`); anything else (`untracked`), CawCo's or a stray.
 */
const entryKind = async (
  path: string,
  source: string,
  git: Git,
  tree: Tree,
  entry: string
): Promise<"dir" | "own" | "foreign" | "untracked"> => {
  const file = join(path, entry);
  const found = await lstat(file);
  const want = tree.files.get(entry);
  if (found.isDirectory() && want?.mode === "160000") {
    // A submodule checkout leaves its folder empty.
    return (await entriesAt(file)).length > 0 ? "foreign" : "own";
  }
  if (found.isDirectory() && tree.dirs.has(entry)) {
    return "dir";
  }
  if (want) {
    return (await asCheckedOut(file, found, want, git)) ? "own" : "foreign";
  }
  return (await secretCopy(source, entry, file, found)) ? "own" : "untracked";
};

/** The id git gives a blob of `size` bytes, read from `chunks`, in the object format of `object` (its length says which). */
const blobId = async (
  object: string,
  size: number,
  chunks: AsyncIterable<Uint8Array> | Uint8Array
): Promise<string> => {
  const hasher = new Bun.CryptoHasher(object.length === 64 ? "sha256" : "sha1");
  hasher.update(`blob ${size}\0`);
  if (chunks instanceof Uint8Array) {
    hasher.update(chunks);
  } else {
    for await (const chunk of chunks) {
      hasher.update(chunk);
    }
  }
  return hasher.digest("hex");
};

const LFS_POINTER =
  /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize (\d+)\n/;
/** The largest blob read as a possible LFS pointer: git-lfs's own limit for one. */
const POINTER_MAX = 1024;

/**
 * Whether `found` at `file` is tree entry `want` as checkout writes it: a
 * link to the blob's target, or a file of its mode whose bytes are the blob,
 * or the large file a git-lfs pointer blob names (its sha256 and size).
 */
const asCheckedOut = async (
  file: string,
  found: Stats,
  want: TreeEntry,
  git: Git
): Promise<boolean> => {
  if (want.mode === "120000") {
    if (!found.isSymbolicLink()) {
      return false;
    }
    const target = await readlink(file, { encoding: "buffer" });
    return (await blobId(want.object, target.length, target)) === want.object;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: a file mode's owner execute bit
  const executable = (found.mode & 0o100) !== 0;
  const regular = found.isFile() && ["100644", "100755"].includes(want.mode);
  if (!regular || executable !== (want.mode === "100755")) {
    return false;
  }
  if (
    (await blobId(want.object, found.size, Bun.file(file).stream())) ===
    want.object
  ) {
    return true;
  }
  const size = Number((await git(["cat-file", "-s", want.object])).trim());
  if (size > POINTER_MAX) {
    return false;
  }
  const pointer = LFS_POINTER.exec(
    await git(["cat-file", "blob", want.object])
  );
  if (!pointer || Number(pointer[2]) !== found.size) {
    return false;
  }
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(file).stream()) {
    hasher.update(chunk);
  }
  return hasher.digest("hex") === pointer[1];
};

/**
 * Whether `found` at `file`, `entry` in the clone, is a copy of the source's
 * own secret file at the same path (workspace.ts `copyOwnSecrets`), byte for
 * byte.
 */
const secretCopy = async (
  source: string,
  entry: string,
  file: string,
  found: Stats
): Promise<boolean> => {
  if (!(found.isFile() && isSecretFileName(basename(entry)))) {
    return false;
  }
  const own = join(source, entry);
  const theirs = await lstat(own).catch(() => undefined);
  if (!theirs?.isFile() || theirs.size !== found.size) {
    return false;
  }
  const [a, b] = await Promise.all([readFile(own), readFile(file)]);
  return a.equals(b);
};

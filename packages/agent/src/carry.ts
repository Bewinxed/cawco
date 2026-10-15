/**
 * A carry: work that is nowhere else, saved before the checkout holding it
 * is deleted because a person chose to let it go. Two checkouts take one:
 * a workspace's clone archived with `discard` (workspace.ts
 * `archiveWorkspace`, git inside its boundary) and a spin-off's worktree
 * discarded (session.ts, git on this host, where the spin-off ran). Each is
 * a folder in `~/.cawco/carries` (core paths `workspaceCarriesDir`), named
 * by the workspace or session id and the time, holding, each only when
 * there is something to put there:
 * - `commits.bundle`: the commits the checkout alone had, with its refs
 *   (`git fetch`);
 * - `commits/`: those on HEAD as a patch series (`git am`);
 * - `uncommitted.patch`: every changed, deleted and untracked file against
 *   HEAD (`git apply`), read through a copy of the index so the checkout's
 *   own is untouched;
 * - `stashes/<n>.patch`: each stash entry with its untracked files (a
 *   clone's; a worktree shares its repository's stash, which outlives it);
 * - `ignored/`: a workspace clone's own files git ignores (workspace.ts
 *   `ignoredOwn`), copied at their paths on this host once its boundary is
 *   closed; every archive of a clone holding any writes a carry for them;
 * - `head` and `branch`: the commit and branch it was on;
 * - `README.md`: what it is and how to take each part back.
 *
 * A workspace whose folder is no git clone any more (its clone deleted by
 * hand) has no git to read and no boundary to read it in: archived with
 * `discard`, its own entries are copied into its carry as they are, on this
 * host ({@link copyStrays}), beside the README.
 */
import { constants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { holdingWords } from "@cawco/core";
import { workspaceCarriesDir } from "@cawco/core/paths";
import { SAFE_GIT_ENV, SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { shellQuote } from "./boundary";
import { hostGit } from "./clone";

/** What a checkout holds that is nowhere else. */
export interface CarryHeld {
  ahead: number;
  dirty: number;
  stashes: number;
}

/**
 * Which commits a checkout takes with it when it goes. A clone takes its
 * local branches too; a worktree leaves them in its repository, so only
 * what HEAD has past every branch and remote is lost.
 */
export type CarryCheckout = "clone" | "worktree";

/**
 * What a carry was saved from: a checkout, or a workspace's folder that is
 * no git clone any more (stand-ins.ts `noRepositoryAt`), whose own entries
 * are copied as they are ({@link copyStrays}).
 */
export type CarrySource = CarryCheckout | "folder";

/**
 * Copies `entries` (paths in the folder `from`, which is no git clone) into
 * the new carry folder `folder`, each at the path it had there, on this host:
 * no git and no boundary run in a folder that is no clone. A dir is walked
 * and a regular file copied; anything else (a link, a socket) is not, being
 * no file of the carry's own ({@link ownFilesOnly}), and is answered by its
 * path and what it is, for the README.
 */
export const copyStrays = async (
  from: string,
  entries: readonly string[],
  folder: string
): Promise<string[]> => {
  const left: string[] = [];
  const copy = async (entry: string): Promise<void> => {
    const source = join(from, entry);
    const target = join(folder, entry);
    const found = await lstat(source);
    if (found.isDirectory()) {
      await mkdir(target, { recursive: true, mode: 0o700 });
      for (const name of await readdir(source)) {
        // biome-ignore lint/performance/noAwaitInLoops: a stray holds a handful of files
        await copy(join(entry, name));
      }
    } else if (found.isFile()) {
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await copyFile(source, target, constants.COPYFILE_EXCL);
    } else if (found.isSymbolicLink()) {
      left.push(`${entry}: a link to ${await readlink(source)}`);
    } else {
      left.push(`${entry}: neither a file nor a folder`);
    }
  };
  await mkdir(folder, { mode: 0o700 });
  for (const entry of entries) {
    // biome-ignore lint/performance/noAwaitInLoops: one entry at a time, a folder that is no clone holds a handful
    await copy(entry);
  }
  return left;
};

/** The rev-list arguments naming the commits a checkout alone has. */
export const LOST_COMMITS: Record<CarryCheckout, string> = {
  clone: "HEAD --branches --not --remotes",
  worktree: "HEAD --not --remotes --branches",
};

/** A new carry's folder for the workspace or session `id`. */
export const carryFolder = (id: string): string =>
  join(
    workspaceCarriesDir(),
    `${id}-${new Date().toISOString().replaceAll(":", "")}`
  );

/**
 * The shell steps (after {@link SAFE_GIT_SHELL}, in the checkout) that
 * write a carry into the folder `folder` names, a shell word; `skip`,
 * paths `git status` passes over, are left out of the uncommitted diff.
 */
export const carrySteps = (
  folder: string,
  held: CarryHeld,
  skip: readonly string[],
  checkout: CarryCheckout
): string => {
  const excluded = skip
    .map((path) => shellQuote(`:(exclude,literal)${path}`))
    .join(" ");
  const steps = [
    "set -e",
    `d=${folder}`,
    'mkdir "$d"',
    'git rev-parse HEAD > "$d"/head',
    'git symbolic-ref -q --short HEAD > "$d"/branch || true',
  ];
  if (held.ahead > 0) {
    steps.push(
      `git bundle create --quiet "$d"/commits.bundle ${LOST_COMMITS[checkout]}`,
      `git format-patch --quiet --binary -o "$d"/commits HEAD --not --remotes${checkout === "worktree" ? " --branches" : ""}`
    );
  }
  if (held.dirty > 0) {
    steps.push(
      'cp "$(git rev-parse --git-path index)" "$d"/index',
      `GIT_INDEX_FILE="$d"/index git add -A -- . ${excluded}`,
      'GIT_INDEX_FILE="$d"/index git diff --cached --binary HEAD > "$d"/uncommitted.patch',
      'rm "$d"/index'
    );
  }
  if (held.stashes > 0) {
    steps.push(
      'mkdir "$d"/stashes',
      'n=0; while git rev-parse -q --verify "stash@{$n}" > /dev/null; do git stash show --include-untracked -p --binary "stash@{$n}" > "$d"/stashes/$n.patch; n=$((n + 1)); done'
    );
  }
  return steps.join("\n");
};

/** A carry's folder: every entry in it a folder or a regular file of one link, else it is not the carry's own. */
export const ownFilesOnly = async (dir: string): Promise<void> => {
  const info = await lstat(dir);
  if (!info.isDirectory()) {
    throw new Error(`${dir} is not a folder of the carry's own`);
  }
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry);
    // biome-ignore lint/performance/noAwaitInLoops: a carry holds a handful of files
    const one = await lstat(path);
    if (one.isDirectory()) {
      await ownFilesOnly(path);
    } else if (!one.isFile() || one.nlink !== 1) {
      throw new Error(`${path} is not a file of the carry's own`);
    }
  }
};

/** A file the carry's git wrote, trimmed; empty when it wrote none. */
const carried = (dir: string, name: string): Promise<string> =>
  readFile(join(dir, name), "utf8").then(
    (text) => text.trim(),
    () => ""
  );

/** The README of the carry in `folder`: what it holds and how each part is taken back. */
export const carryReadme = async ({
  title,
  checkout,
  path,
  words,
  folder,
  left = [],
}: {
  /** "Workspace <id>, saved before it was archived". */
  title: string;
  checkout: CarrySource;
  path: string;
  words: string;
  folder: string;
  /** A folder's entries not copied ({@link copyStrays}). */
  left?: readonly string[];
}): Promise<string> => {
  if (checkout === "folder") {
    return [
      `# ${title}`,
      "",
      `Its folder ${path}, which was no git clone any more, held ${words} when a person let it go, on ${new Date().toISOString()}. Each of them is in this folder at the path it had there; the folder is gone.`,
      ...(left.length > 0
        ? ["", "Not copied:", ...left.map((one) => `- ${one}`)]
        : []),
      "",
    ].join("\n");
  }
  const [head, branch] = await Promise.all([
    carried(folder, "head"),
    carried(folder, "branch"),
  ]);
  const has = (name: string): Promise<boolean> =>
    stat(join(folder, name)).then(
      () => true,
      () => false
    );
  const [bundle, commits, uncommitted, stashes, ignored] = await Promise.all(
    [
      "commits.bundle",
      "commits",
      "uncommitted.patch",
      "stashes",
      "ignored",
    ].map(has)
  );
  return [
    `# ${title}`,
    "",
    `Its ${checkout} ${path} held ${words} when it went, on ${new Date().toISOString()}, on ${branch || "no branch"} at ${head || "an unread commit"}. This folder is that work; the ${checkout} is gone.`,
    "",
    bundle &&
      `- \`commits.bundle\`: the commits only the ${checkout} had (\`${LOST_COMMITS[checkout]}\`). In a clone of the repository: \`git fetch ${folder}/commits.bundle 'HEAD:refs/heads/carry'\`.`,
    commits &&
      `- \`commits/\`: the commits on HEAD among them, as patches: \`git am ${folder}/commits/*.patch\`.`,
    uncommitted &&
      `- \`uncommitted.patch\`: every changed, deleted and untracked file against ${head || "HEAD"}: \`git apply ${folder}/uncommitted.patch\` at that commit.`,
    stashes &&
      "- `stashes/<n>.patch`: stash entry n, untracked files included: `git apply`.",
    ignored &&
      `- \`ignored/\`: the files git ignores that the work in the ${checkout} wrote (no dependency or build tree, no secret, nothing CawCo put there), each at its path in it: \`cp -a ${folder}/ignored/. <a clone>\`.`,
    ...(left.length > 0
      ? ["", "Not copied:", ...left.map((one) => `- ${one}`)]
      : []),
    "",
  ]
    .filter((line): line is string => line !== false)
    .join("\n");
};

/**
 * What a spin-off's worktree would take with it: the commits on its HEAD
 * that no branch or remote of its repository has, and its `git status`
 * entries (untracked files included). Its stash is its repository's and
 * stays.
 */
export const worktreeHeld = async (path: string): Promise<CarryHeld> => {
  const run = async (args: string[]): Promise<string> => {
    const ran = await hostGit(path, args);
    if (ran.exitCode !== 0) {
      throw new Error(
        `git ${args[0]} failed in ${path}: ${ran.stderr.toString().trim()}`
      );
    }
    return ran.text();
  };
  const [ahead, status] = await Promise.all([
    run(["rev-list", "--count", ...LOST_COMMITS.worktree.split(" ")]),
    run(["status", "--porcelain"]),
  ]);
  return {
    ahead: Number(ahead.trim()),
    dirty: status.split("\n").filter(Boolean).length,
    stashes: 0,
  };
};

/**
 * Saves what a spin-off's worktree holds that is nowhere else to a carry,
 * git running on this host as the spin-off did; answers the carry's folder,
 * or null when it holds nothing. Throws, with nothing written, when the
 * carry cannot be made whole: the worktree is then not removed.
 */
export const carryWorktree = async (
  sessionId: string,
  path: string
): Promise<string | null> => {
  const held = await worktreeHeld(path);
  if (held.ahead === 0 && held.dirty === 0) {
    return null;
  }
  const folder = carryFolder(sessionId);
  await mkdir(workspaceCarriesDir(), { recursive: true, mode: 0o700 });
  const ran =
    await Bun.$`sh -c ${`${SAFE_GIT_SHELL}${carrySteps(shellQuote(folder), held, [], "worktree")}`}`
      .cwd(path)
      .env({ ...hostEnvironment(), ...SAFE_GIT_ENV })
      .quiet()
      .nothrow();
  if (ran.exitCode !== 0) {
    await rm(folder, { recursive: true, force: true });
    throw new Error(
      `The spin-off's worktree ${path} was not removed: its carry could not be written. ${ran.stderr.toString().trim() || `exit ${ran.exitCode}`}`
    );
  }
  const words = holdingWords({ ...held, bytes: 0 });
  await Bun.write(
    join(folder, "README.md"),
    await carryReadme({
      title: `Spin-off ${sessionId}, saved before it was discarded`,
      checkout: "worktree",
      path,
      words,
      folder,
    })
  );
  console.info(
    `[agent] spin-off ${sessionId}: ${words} in ${path} saved to the carry ${folder}`
  );
  return folder;
};

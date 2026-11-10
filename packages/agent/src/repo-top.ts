/**
 * THE ONE READING OF WHICH GIT CHECKOUT A FOLDER IS IN: what a workspace is
 * cut from (workspace.ts `kindAt`) and whether a project's place is a
 * repository yet (place-repo.ts). git answers it, and two of its answers are
 * taken: the top of the checkout the folder is in, and that the folder is in
 * no repository at all. Every other answer is refused in words that name
 * it. None is ever read as "no repository": a folder in none gets a view of
 * the live folder as its workspace on Linux (layer.ts `makeLayer`), which is
 * the last thing a repository git would not read as a checkout should get.
 *
 * It was read so until 2026-11-10: `kindAt` took any failure of
 * `git rev-parse --show-toplevel` for a plain folder. While
 * /home/bewinxed/cockpit's config said `core.bare = true`
 * (core git-repository-env.ts says how it came to), that command died with
 * "this operation must be run in a work tree", and each delegate started
 * there worked in a view of the shared checkout itself: 39 commits behind
 * origin, among 85 files other sessions had changed, its commit in the
 * view's upper layer alone, its merge checks run over all of it.
 *
 * A clone is not cut from such a repository instead: its own git refuses
 * every work-tree command there, so the cut's reads of the source (its top
 * level, its untracked secret files) would each need the repository's own
 * config overridden, and the person's checkout would stay broken with
 * nothing saying so. The refusal names the config line and the command that
 * sets it right.
 */
import { lstat, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { WORKSPACE_GIT_TIMEOUT_MS } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { type Ran, runCaptured } from "@cawco/core/run-captured";
import { SAFE_GIT_ENV, safeGitArgv } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { unhandled } from "@cawco/core/unhandled";

/**
 * git's exit for a folder in no repository: `die()` (usage.c) exits 128, and
 * `rev-parse` dies so when discovery finds none (setup.c). Every other fatal
 * setup error exits the same (a repository format or extension this git
 * does not know, a repository owned by someone else), so a 128 is read with
 * the folders above the folder ({@link gitAbove}).
 */
const NOT_A_REPO_EXIT = 128;

/**
 * The nearest `.git` at `root` or above it on its filesystem, when one is
 * there: git's 128 there is a repository it would not read (a damaged one,
 * someone else's), never a folder in none. Discovery stops where git's does,
 * at a filesystem boundary (`GIT_DISCOVERY_ACROSS_FILESYSTEM` unset): a
 * `.git` past it is one git rightly does not look for.
 */
const gitAbove = async (root: string): Promise<string | undefined> => {
  const device = (await stat(root)).dev;
  for (let at = root; ; at = dirname(at)) {
    if ((await stat(at).catch(() => undefined))?.dev !== device) {
      return;
    }
    const dotGit = join(at, ".git");
    if (await lstat(dotGit).then(Boolean, () => false)) {
      return dotGit;
    }
    if (dirname(at) === at) {
      return;
    }
  }
};

/** One read by git in `path`, as safe-git.ts says, run to its end within what is left of `deadline`. */
const gitRead = async (
  path: string,
  args: readonly string[],
  deadline: number
): Promise<Ran> => {
  const late = `git ${args[0]} did not finish within ${WORKSPACE_GIT_TIMEOUT_MS / 1000}s`;
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(late);
  }
  const ran = await readWithin(remaining, (signal) =>
    runCaptured(safeGitArgv(args), {
      cwd: path,
      env: { ...hostEnvironment(), ...SAFE_GIT_ENV },
      signal,
      killSignal: "SIGKILL",
    })
  );
  switch (ran.kind) {
    case "answered":
      return ran.value;
    case "unanswered":
      throw new Error(late);
    default:
      unhandled("read", ran);
  }
};

/** What `git rev-parse` said as it failed: its stderr on one line, or how it ended when it said nothing. */
const saidBy = (ran: Ran): string =>
  ran.signalCode
    ? `git rev-parse was ended by ${ran.signalCode}`
    : ran.stderr.trim().replaceAll(/\s*\n\s*/gu, " ") ||
      `git rev-parse exited ${ran.code}`;

/** git's name for where a config value came from when it is a file (`git config --show-origin`: `file:<path>`, from the folder git ran in). */
const FILE_ORIGIN = "file:";

/**
 * The top of the git checkout the folder at `path` is in, or undefined when
 * it is in no repository. Throws, naming the cause, for a folder in a
 * repository git does not read as a checkout: one whose config says it is
 * bare, the repository's own directory, a `.git` git will not read; and
 * when git cannot tell (it did not run, or not within `deadline`).
 */
export const repoTop = async (
  path: string,
  deadline: number
): Promise<string | undefined> => {
  const read = (args: readonly string[]): Promise<Ran> =>
    gitRead(path, args, deadline).catch((error: Error) => {
      throw new Error(
        `CawCo couldn't tell whether ${path} is in a git repository: ${error.message}`,
        { cause: error }
      );
    });
  const found = await read([
    "rev-parse",
    "--is-inside-work-tree",
    "--is-bare-repository",
  ]);
  if (found.code === NOT_A_REPO_EXIT && !found.signalCode) {
    const unread = await gitAbove(path);
    if (unread) {
      throw new Error(
        `${path} is under ${unread}, which git does not read as a repository (it said: ${saidBy(found)}), so CawCo leaves the folder as it is. Repair or remove that .git, and start the work again.`
      );
    }
    return;
  }
  if (found.code !== 0) {
    throw new Error(
      `CawCo couldn't tell whether ${path} is in a git repository: ${saidBy(found)}`
    );
  }
  const [inside, bare] = found.stdout.trim().split("\n");
  if (inside === "true") {
    const top = await read(["rev-parse", "--show-toplevel"]);
    if (top.code !== 0) {
      throw new Error(
        `CawCo couldn't tell whether ${path} is in a git repository: ${saidBy(top)}`
      );
    }
    return top.stdout.trim();
  }
  if (bare === "true") {
    // Which of its config files says so is git's to name: the shared config,
    // or a worktree's own once `extensions.worktreeConfig` is on.
    const named = await read(["config", "--show-origin", "--get", "core.bare"]);
    const [origin = ""] = named.stdout.trim().split("\t");
    const refusal = `git reads ${path} as a repository with no checkout, and CawCo cuts no workspace from it and leaves the folder as it is`;
    if (named.code !== 0 || !origin.startsWith(FILE_ORIGIN)) {
      throw new Error(
        `${refusal}: \`git rev-parse --is-bare-repository\` says true there. A bare repository is worked on from a clone of it.`
      );
    }
    const config = resolve(path, origin.slice(FILE_ORIGIN.length));
    throw new Error(
      `${config} says core.bare = true, so ${refusal}. If the folder is a checkout, set it right with \`git config --file ${config} core.bare false\`, then start the work again; a bare repository is worked on from a clone of it.`
    );
  }
  throw new Error(
    `${path} is inside a git repository's own directory, not a checkout of it, so CawCo leaves the folder as it is.`
  );
};

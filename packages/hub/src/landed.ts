/**
 * What a project holds as its work has landed: the one read every reader of
 * "does this project have a design system" goes through (Caw's offer,
 * design-offers.ts; the starters, project-starters.ts), and the starters'
 * read of its default branch and latest commits.
 *
 * Where the truth is (Projects spec §5.7, "Where it lives": `design/` "at
 * the repository root in a project with a repository, … the hub folder's
 * `design/` only when the project has no repository"): a landing pushes a
 * workspace's commits to its checkout's `origin` and leaves the person's
 * checkout as it was (landing.ts; agent workspace.ts `hubBase`: "a plain
 * `git pull` there brings landed work in"), so that checkout's working tree
 * and its own branch stay behind until they pull. What the project has is
 * origin's default branch: each read fetches it into the checkout's
 * remote-tracking ref, which touches nothing the person works on, and reads
 * `design/` and the latest commits from that commit. A checkout with no
 * origin has nowhere else for work to land, so its own branch is what it
 * has; a place that is no git repository yet is a folder, read as one.
 *
 * Which of the two a place is, its machine says, by the one reading a
 * workspace's kind is chosen by ({@link CONTROL_REPO_ROOT}, agent
 * repo-top.ts): the top of its checkout, or that it is in no repository. A
 * place git does not read as a checkout (its config says bare, its `.git`
 * unreadable) is neither: it is not read at all, and the log names why. A
 * failing `git rev-parse --show-toplevel` in the read's own shell was taken
 * for a plain folder until 2026-11-10, so a checkout whose config said bare
 * was read as one, its live `design/` folder for its landed branch's.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CommandResult } from "@cawco/core/commands/controls";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import { CONTROL_REPO_ROOT } from "@cawco/core/workspace/controls";
import type { DbShape } from "./db";
import { projectRoot } from "./project-folder";

/** A fetch of origin's default branch and a read of it; past this the machine is not going to answer. */
const READ_MS = 30_000;
const LAST_NEWLINE = /\n$/u;

export interface LandedDeps {
  /** Runs a machine-scoped daemon function; throws the machine's own words. */
  call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  db: Pick<DbShape, "project">;
  online: (machineId: string) => boolean;
  run: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<CommandResult>;
}

/** A checkout's default branch as it has landed. */
export interface Landed {
  /** Null for a place that is no git repository yet. */
  branch: string | null;
  commits: { sha: string; subject: string }[];
  design: boolean;
}

/**
 * The read of a checkout, run at its top: the branch, `yes` or `no` for
 * `design/` on it, then its latest `commits` as `sha<TAB>subject`. awk, not
 * sed's `\t`, reads `ls-remote`: BSD sed on a Mac has no `\t`.
 */
const readCheckout = (commits: number): string =>
  `${SAFE_GIT_SHELL}if git remote get-url origin >/dev/null 2>&1; then
  b=$(git ls-remote --symref origin HEAD | awk '$1 == "ref:" && $3 == "HEAD" { sub("^refs/heads/", "", $2); print $2 }')
  [ -n "$b" ] || { echo "origin names no default branch" >&2; exit 3; }
  git fetch --quiet --no-tags origin "+refs/heads/$b:refs/remotes/origin/$b" || exit 4
  r="refs/remotes/origin/$b"
else
  b=$(git symbolic-ref --quiet --short HEAD) || { echo "on no branch" >&2; exit 3; }
  r="refs/heads/$b"
fi
printf '%s\\n' "$b"
if [ "$(git cat-file -t "$r:design" 2>/dev/null)" = tree ]; then echo yes; else echo no; fi
if git rev-parse --quiet --verify "$r^{commit}" >/dev/null; then git log -${commits} --format='%H%x09%s' "$r" --; fi`;

/** The read of a place in no repository, run in it: no branch, then `yes` or `no` for its `design/` folder. */
const READ_FOLDER = "echo; if [ -d design ]; then echo yes; else echo no; fi";

/** One checkout's landed branch, or undefined when it cannot be read now. */
const landedAt = async (
  deps: LandedDeps,
  place: { machineId: string; path: string },
  commits: number
): Promise<Landed | undefined> => {
  if (!deps.online(place.machineId)) {
    return;
  }
  // Not read: the machine said why (its place in a repository git does not
  // read as a checkout, or itself not answering), and the log keeps it.
  const kind = await deps
    .call(place.machineId, CONTROL_REPO_ROOT, [place.path])
    .then(
      (answer) => ({ top: typeof answer === "string" ? answer : undefined }),
      (error: unknown) => {
        console.warn(
          `[landed] ${place.path} on ${place.machineId} was not read: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    );
  if (!kind) {
    return;
  }
  const read = await deps
    .run(
      place.machineId,
      kind.top ?? place.path,
      kind.top ? readCheckout(commits) : READ_FOLDER,
      READ_MS
    )
    .catch(() => undefined);
  if (read?.exitCode !== 0) {
    return;
  }
  const [branch = "", design = "", ...log] = read.stdout
    .replace(LAST_NEWLINE, "")
    .split("\n");
  return {
    branch: branch || null,
    design: design === "yes",
    commits: log
      .map((line) => {
        const tab = line.indexOf("\t");
        return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
      })
      .filter((commit) => commit.sha.length > 0),
  };
};

/**
 * Whether the project holds a design system, and its first readable
 * checkout's landed branch: `hasDesign` true when its folder on the hub or
 * the landed branch of any checkout has `design/`; false when none does and
 * every checkout answered (a project with no checkout has its folder
 * alone); null when a checkout that might have one cannot be read now.
 */
export const projectDesign = async (
  deps: LandedDeps,
  projectId: string,
  commits = 0
): Promise<{ hasDesign: boolean | null; repo: Landed | undefined }> => {
  const inFolder = existsSync(join(projectRoot(projectId), "design"));
  if (inFolder && commits === 0) {
    return { hasDesign: true, repo: undefined };
  }
  const checkouts = (deps.db.project(projectId)?.places ?? []).filter(
    (place) => place.kind === "checkout"
  );
  let repo: Landed | undefined;
  let unknown = false;
  for (const place of checkouts) {
    const read = await landedAt(deps, place, commits);
    repo ??= read;
    if (read?.design) {
      return { hasDesign: true, repo: read };
    }
    unknown ||= read === undefined;
  }
  if (inFolder) {
    return { hasDesign: true, repo };
  }
  return { hasDesign: unknown ? null : false, repo };
};

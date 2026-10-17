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
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CommandResult } from "@cawco/core";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import type { DbShape } from "./db";
import { projectRoot } from "./project-folder";

/** A fetch of origin's default branch and a read of it; past this the machine is not going to answer. */
const READ_MS = 30_000;
const LAST_NEWLINE = /\n$/;

export interface LandedDeps {
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
 * The read, run in a place: the branch (empty for a plain folder), `yes` or
 * `no` for `design/` on it, then its latest `commits` as `sha<TAB>subject`.
 * awk, not sed's `\t`, reads `ls-remote`: BSD sed on a Mac has no `\t`.
 */
const readLanded = (commits: number): string =>
  `${SAFE_GIT_SHELL}if top=$(git rev-parse --show-toplevel 2>/dev/null); then
  cd "$top" || exit 1
  if git remote get-url origin >/dev/null 2>&1; then
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
  if git rev-parse --quiet --verify "$r^{commit}" >/dev/null; then git log -${commits} --format='%H%x09%s' "$r" --; fi
else
  echo
  if [ -d design ]; then echo yes; else echo no; fi
fi`;

/** One checkout's landed branch, or undefined when it cannot be read now. */
const landedAt = async (
  deps: LandedDeps,
  place: { machineId: string; path: string },
  commits: number
): Promise<Landed | undefined> => {
  if (!deps.online(place.machineId)) {
    return;
  }
  const read = await deps
    .run(place.machineId, place.path, readLanded(commits), READ_MS)
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
    // biome-ignore lint/performance/noAwaitInLoops: stops at the first checkout that has one
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

/** What a workspace holds, in words. */

import type { WorkspaceHolding } from "../workspace/controls";

const counted = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** What a workspace holds that is nowhere else, in words: "2 commits on no remote, 3 changed files, 1 stash, 2 excluded files", or the clone CawCo did not read and why. */
export const holdingWords = (holding: WorkspaceHolding): string => {
  if (holding.refused) {
    return `a clone CawCo did not read: ${holding.refused}`;
  }
  const excluded = holding.excluded ?? [];
  const folders = excluded.filter((path) => path.endsWith("/")).length;
  const files = excluded.length - folders;
  return (
    [
      holding.ahead > 0 &&
        counted(holding.ahead, "commit on no remote", "commits on no remote"),
      holding.dirty > 0 &&
        counted(holding.dirty, "changed file", "changed files"),
      holding.stashes > 0 && counted(holding.stashes, "stash", "stashes"),
      files > 0 && counted(files, "excluded file", "excluded files"),
      folders > 0 && counted(folders, "excluded folder", "excluded folders"),
      holding.strays &&
        `${counted(holding.strays, "entry", "entries")} of its own in a folder that is no git clone`,
    ]
      .filter(Boolean)
      .join(", ") || "nothing unlanded"
  );
};

/** A size on disk in words: "1.4 GB", "312 MB", "18 KB". */
export const sizeWords = (bytes: number): string => {
  if (bytes >= 1e9) {
    return `${(bytes / 1e9).toFixed(1)} GB`;
  }
  if (bytes >= 1e6) {
    return `${Math.round(bytes / 1e6)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
};

/**
 * Large files on the dashboard, in Needs you (home/NeedsCard.svelte): the
 * offer of Git LFS for a made repository's left-out files, and an LFS
 * server a checkout named that the project never declared. The app draws
 * them not, so these are not written into it (scripts/words-swift.ts).
 */
export const lfsWords = {
  // ── The offer ──
  /** Its title: the folder made a repository, by its last segment. */
  offerTitle: (folder: string) => `Large files in ${folder}`,
  /** Its line: how many its first commit left out for size alone, and their size. */
  offerLine: (count: number, size: string) =>
    `${count} ${count === 1 ? "file" : "files"}, ${size}, ${count === 1 ? "was" : "were"} left out of its first commit for size alone. Git LFS can keep ${count === 1 ? "it" : "them"} instead, by pattern.`,
  track: "Track with LFS",
  tracking: "Committing…",
  notNow: "Not now",
  notNowPending: "Not now…",
  /** A row: its pattern's files and their size. */
  row: (count: number, size: string) =>
    `${count} ${count === 1 ? "file" : "files"} · ${size}`,
  /** What was answered: Track committed them. */
  tracked: (commit: string) => `Tracked with LFS in ${commit.slice(0, 7)}`,
  /** Under it, when the folder's own pre-push hook kept git-lfs's out. */
  ownPrePush:
    "The folder has a pre-push hook of its own, so git-lfs's was not put beside it: a push from there sends the large files only with `git lfs push origin --all`, or once the hooks are merged (`git lfs update --manual` says how).",

  // ── An LFS server the project never declared ──
  refusedTitle: "Large files left as pointers",
  /** Its line: the server, and where to declare it. */
  refusedLine: (endpoint: string, project: string) =>
    `The repository's .lfsconfig says its large files live at ${endpoint}, which is neither its origin's LFS nor where ${project} declared its large files live, so CawCo fetched nothing from it. If they belong there, declare it in the project's settings, under Large files.`,
  dismiss: "Dismiss",
  dismissing: "Dismissing…",
};

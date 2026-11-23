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
    `${count} ${count === 1 ? "file" : "files"}, ${size}, ${count === 1 ? "was" : "were"} left out of its first commit for size alone. Track with LFS commits ${count === 1 ? "it" : "them"} through Git LFS, and the next push uploads ${count === 1 ? "it" : "them"}.`,
  track: "Track with LFS",
  tracking: "Committing…",
  notNow: "Leave out",
  notNowPending: "Leaving out…",
  /** What was answered: Track committed them. */
  tracked: (commit: string) => `Tracked with LFS in ${commit.slice(0, 7)}`,
  /** Under it, when the folder's own pre-push hook kept git-lfs's out. */
  ownPrePush:
    "The folder keeps its own pre-push hook, so `git push` from it does not send the large files. Send them with `git lfs push origin --all`, or merge git-lfs's hook into yours: `git lfs update --manual` prints how.",

  // ── An LFS server the project never declared ──
  refusedTitle: "Large files left as pointers",
  /** Its line: the server, and where to declare it. */
  refusedLine: (endpoint: string) =>
    `A repository's .lfsconfig keeps its large files at ${endpoint}, a server this project is not set to use, so nothing was fetched from there. If the files belong there, set it as the Custom server under Git LFS in the project's settings.`,
  dismiss: "Dismiss",
  dismissing: "Dismissing…",
};

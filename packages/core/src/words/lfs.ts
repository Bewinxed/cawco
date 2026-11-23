/**
 * Large files on the dashboard, in Needs you (home/NeedsCard.svelte): an
 * LFS server a checkout named that the project never declared. The app
 * draws it not, so these are not written into it (scripts/words-swift.ts).
 */
export const lfsWords = {
  refusedTitle: "Large files left as pointers",
  /** Its line: the server, and where to declare it. */
  refusedLine: (endpoint: string) =>
    `A repository's .lfsconfig keeps its large files at ${endpoint}, a server this project is not set to use, so nothing was fetched from there. If the files belong there, set it as the Custom server under Git LFS in the project's settings.`,
  dismiss: "Dismiss",
  dismissing: "Dismissing…",
};

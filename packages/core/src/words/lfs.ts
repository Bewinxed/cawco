/**
 * Large files on the dashboard: the offer of Git LFS under a made
 * repository's note (transcript/LfsOfferActions.svelte), and a project's
 * Large files setting (project/ProjectDetails.svelte). The app draws
 * neither, so these are not written into it (scripts/words-swift.ts).
 */
export const lfsWords = {
  // ── The offer under the note ──
  track: "Track with LFS",
  tracking: "Committing…",
  notNow: "Not now",
  notNowPending: "Not now…",
  /** A row: its pattern's files and their size. */
  row: (count: number, size: string) =>
    `${count} ${count === 1 ? "file" : "files"} · ${size}`,
  /** What was answered: Track committed them. */
  tracked: (commit: string) => `Tracked with LFS in ${commit.slice(0, 7)}`,

  // ── The project's Large files setting ──
  label: "Large files",
  own: "Each repository's own LFS, at its origin.",
  declared: (connection: string) => `Signed in with ${connection}.`,
  pinned:
    "Every git-lfs run for this project goes here alone, whatever a repository's .lfsconfig says.",
  declare: "Declare where they live",
  change: "Change",
  clear: "Use each origin's own",
  clearing: "Clearing…",
  url: "LFS URL",
  urlPlaceholder: "https://host/owner/repo.git/info/lfs",
  connection: "Connection",
  /** Before the link to Connections, which says the rest. */
  noConnections: "No connection holds a key yet: add one in",
  connectionsLink: "Connections",
  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
};

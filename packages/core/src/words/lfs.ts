/**
 * Large files on the dashboard: the offer of Git LFS under a made
 * repository's note (transcript/LfsOfferActions.svelte). The app draws
 * it not, so these are not written into it (scripts/words-swift.ts).
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
};

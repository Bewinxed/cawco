/** What an artifact's own tab is told when its socket is refused. */

/** What the hub says, closing an artifact tab's socket {@link ARTIFACT_SESSION_REFUSED}`.gone`. */
export const ARTIFACT_GONE =
  "This artifact is gone: it was deleted, or the session that made it was.";

/** An artifact tab's request of its machine: a folder listing (dashboard artifact-session.svelte.ts). */
export const artifactSessionWords = {
  /** The machine refused and gave no reason. */
  folderRefused: "The machine couldn't read that folder, and didn't say why.",
  /** The tab's link to the hub is down. */
  hubNotLinked:
    "The link to the hub isn't open, so the folders can't be read. Try again.",
};

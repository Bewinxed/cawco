import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Node-only paths shared across packages. Kept out of the main entry, which
 * the dashboard bundles for the browser.
 */

/** The agent's transcript search index. The hub reads it for usage backfill. */
export const transcriptIndexPath = (): string =>
  join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "cawco",
    "transcript-index.db"
  );

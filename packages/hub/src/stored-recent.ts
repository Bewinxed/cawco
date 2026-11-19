/**
 * What Recent draws of the transcripts the machines store (core
 * `StoredRecent`), as the hub's thread holds it: the views thread keeps the
 * list (views/stored.ts), off this thread, from each machine's catalog
 * (views/catalogs.ts) and the change log, and tells it here whenever it
 * changed; here the sessions wrapping its transcripts that the board no
 * longer lists are laid as the board lays its rows (board.ts `storedRows`),
 * and the list goes to every dashboard whole (`stored` frame). A board
 * publish moves nothing here: the rows are laid as the list is sent or read.
 * The layout's server load reads it with the board (`GET /api/stored`), so
 * its rows are in the first paint.
 *
 * Owner (2026-11-11): "don't u think that the machine's list that is
 * outside of cawco rarely changes? esp old ones?"
 */

import type { InstanceRow, StoredRecent } from "@cawco/core/protocol";
import type { StoredHeld } from "./views/stored";

export interface StoredRecentDeps {
  /** Every dashboard is told the list, whole. */
  publish: (stored: StoredRecent) => void;
  /** The sessions among these the board does not list, laid as the board lays them (board.ts `storedRows`). */
  rows: (candidates: string[]) => InstanceRow[];
}

export function createStoredRecent(deps: StoredRecentDeps) {
  /** The list as the views thread last told it. */
  let held: StoredHeld = { candidates: [], transcripts: [] };

  /** The list as it stands now. */
  const now = (): StoredRecent => ({
    rows: deps.rows(held.candidates),
    transcripts: held.transcripts,
  });

  return {
    /** The list as it stands now: what the layout's server load reads, and a dashboard is greeted with. */
    now,
    /** The views thread says the list changed: every dashboard is told it. */
    told(next: StoredHeld): void {
      held = next;
      deps.publish(now());
    },
  };
}

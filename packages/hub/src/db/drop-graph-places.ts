/**
 * The decision graph kept the person's drags in a page's state under
 * `graph.places` (one entry by card id). The graph is gone, and nothing
 * filters that key out any more: a drag made after the page's send counted
 * as a pick made after it, so the page read as not sent, and `artifact_read`
 * listed the places as a value line. Before migration 0317 runs, the key is
 * taken out of every page's doc, once, as one update of its own.
 *
 * The state is an entry of each page's Yjs doc (artifacts/docs.ts), which
 * SQL cannot read, so this runs as code on the connection, beside the
 * migrator (merge-project-pages.ts runs the same way); 0317's SQL then drops
 * the key's change rows.
 */
import type { Database } from "bun:sqlite";
import { encodeStateAsUpdate, encodeStateVector } from "yjs";
import { docOf } from "./merge-project-pages";

/** The state key the graph kept its places under. */
const PLACES = "graph.places";

/** Whether the database has no artifacts at all: nothing to drop. Called only in a start that applies 0317 (db/migrate.ts). */
const settled = (client: Database): boolean =>
  (
    client
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('artifacts', 'artifact_updates')"
      )
      .all() as { name: string }[]
  ).length < 2;

/**
 * Takes `graph.places` out of every page's state, in one transaction; how
 * many pages held it. Run only in a start that applies 0317 (db/migrate.ts).
 */
export const dropGraphPlaces = (client: Database): number => {
  if (settled(client)) {
    return 0;
  }
  const pages = client
    .query("SELECT id, seq FROM artifacts WHERE kind = 'page'")
    .all() as { id: string; seq: number }[];
  let dropped = 0;
  // Immediate, as every transaction on the hub's file (db/index.ts `make`).
  client
    .transaction(() => {
      for (const page of pages) {
        const doc = docOf(client, page.id);
        const state = doc.getMap("state");
        if (!state.has(PLACES)) {
          continue;
        }
        const before = encodeStateVector(doc);
        state.delete(PLACES);
        const seq = page.seq + 1;
        client.run(
          'INSERT INTO artifact_updates (artifact_id, seq, "update") VALUES (?, ?, ?)',
          [page.id, seq, encodeStateAsUpdate(doc, before)]
        );
        client.run("UPDATE artifacts SET seq = ? WHERE id = ?", [seq, page.id]);
        dropped += 1;
      }
    })
    .immediate();
  if (dropped > 0) {
    console.info(
      `[artifacts] the decision graph's places taken out of ${dropped === 1 ? "1 page's" : `${dropped} pages'`} state.`
    );
  }
  return dropped;
};

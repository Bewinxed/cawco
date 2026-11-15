/**
 * `bun run tracker-baselines <database>` in packages/hub: what migration
 * 0407 will do to a hub database's tracker baselines (`tracker_links.synced`,
 * what each task and its issue last agreed on), read before it runs. Opens
 * the database read-only (a copy of a live hub's, or a fixture unpacked) and
 * reports each task as never set (no baseline yet: its issue named in a
 * bound project, no link kept; the next sync links it again, as before),
 * placed (its baseline reads whole), or held (it does not read whole: kept
 * as stored, what reads placed, and its merge held), each by
 * `project/task`. Read with 0407's own predicates
 * (db/tracker-baselines-unread.ts), so it says what that migration will do;
 * one 0407 has run on is refused.
 */
import { Database } from "bun:sqlite";
import {
  baselinesUnset,
  trackerBaselinesKept,
} from "../src/db/tracker-baselines-unread";

const [path] = process.argv.slice(2);
if (!path) {
  console.error(
    "tracker-baselines: name the database: bun run tracker-baselines <path>"
  );
  process.exit(2);
}
const client = new Database(path, { readonly: true });
const ran = client
  .query<{ name: string }, []>("PRAGMA table_info(tracker_links)")
  .all()
  .some((column) => column.name === "synced_unread");
if (ran) {
  console.error(
    `tracker-baselines: 0407 has run on ${path}; read a copy taken before it`
  );
  process.exit(1);
}
const unset = baselinesUnset(client);
const kept = trackerBaselinesKept(client);
client.close();

const placed = kept.filter((row) => row.reading.kind === "placed");
const held = kept.flatMap((row) =>
  row.reading.kind === "held" ? [{ ...row, reading: row.reading }] : []
);
console.log(
  `tracker_links: ${unset.length + kept.length} read, ${unset.length} never set, ${placed.length} placed, ${held.length} held`
);
for (const key of unset) {
  console.log(`  never set: ${key}`);
}
for (const row of placed) {
  console.log(`  placed: ${row.key}`);
}
for (const row of held) {
  console.log(
    `  held: ${row.key}: ${JSON.stringify(row.raw)}: ${row.reading.why}; placed ${row.reading.placed.join(", ") || "none"}`
  );
}

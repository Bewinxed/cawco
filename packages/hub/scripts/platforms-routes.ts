/**
 * `bun run platforms-routes <database>` in packages/hub: what migration
 * 0406 will do to a hub database's MCP server platforms (live and in the
 * trash) and the fleet's Who decides routes, read before it runs. Opens the
 * database read-only (a copy of a live hub's, or a fixture unpacked) and
 * reports each value as never set (read as before), placed (it reads
 * whole), or restrictive (it does not read whole: kept as stored, what
 * reads placed, and read as sent to no machine, or every kind to `you`),
 * each by its id. Read with 0406's own predicates
 * (db/platforms-routes-unread.ts), so it says what that migration will do;
 * one 0406 has run on is refused.
 */
import { Database } from "bun:sqlite";
import {
  type Kept,
  platformsRoutesKept,
} from "../src/db/platforms-routes-unread";
import { DECIDES_ID } from "../src/db/schema";

const [path] = process.argv.slice(2);
if (!path) {
  console.error(
    "platforms-routes: name the database: bun run platforms-routes <path>"
  );
  process.exit(2);
}
const client = new Database(path, { readonly: true });
const ran = client
  .query<{ name: string }, []>("PRAGMA table_info(mcp_servers)")
  .all()
  .some((column) => column.name === "every_platform");
if (ran) {
  console.error(
    `platforms-routes: 0406 has run on ${path}; read a copy taken before it`
  );
  process.exit(1);
}
const kept = platformsRoutesKept(client);
client.close();

/** One value's line: its reading, by its id. */
const line = (row: Kept): string => {
  const { reading } = row;
  const routes = row.table === "decides_settings";
  const stray =
    routes && row.key !== DECIDES_ID
      ? " (a row no code reads: nothing of it is placed)"
      : "";
  if (reading.kind === "unset") {
    return `  never set: ${row.key}${stray}`;
  }
  const placed = reading.placed.join(", ");
  return reading.kind === "placed"
    ? `  placed: ${row.key}: ${placed || (routes ? "none" : "none (on no machine)")}${stray}`
    : `  restrictive: ${row.key}: ${JSON.stringify(row.raw)}: ${reading.why}; placed ${placed || "none"}${stray}`;
};

for (const table of [
  "mcp_servers",
  "config_trash",
  "decides_settings",
] as const) {
  const rows = kept.filter((row) => row.table === table);
  const count = (kind: Kept["reading"]["kind"]) =>
    rows.filter((row) => row.reading.kind === kind).length;
  console.log(
    `${table}: ${rows.length} read, ${count("unset")} never set, ${count("placed")} placed, ${count("restrictive")} restrictive`
  );
  for (const row of rows) {
    console.log(line(row));
  }
}

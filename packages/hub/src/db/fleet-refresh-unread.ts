/**
 * Before migration 0422's SQL runs, the hub's log names every skill and
 * plugin whose stored last fetch (`skills.last_refresh`,
 * `plugins.last_refresh`, what the last fetch of a row that had files came
 * to, as JSON) 0422 keeps as not read: a value that is there and does not
 * read whole as the hub read it, with why.
 *
 * 0422 places a last fetch that reads whole in the `refresh_*` columns as
 * it is. One that does not read places nothing: it is kept as stored in
 * `refresh_unread`, and the row says no last fetch until the next one
 * (db/fleet-catalog.ts `versioned`). The hub decides nothing on a last
 * fetch; it only shows it, so showing none never widens what it does.
 *
 * The predicate below is 0422's own: its SQL was written from it, over the
 * column as it stands before it. {@link REFRESH} is the column's shape as
 * the hub read it then (stored/columns.json at 0421, core `FleetRefresh`),
 * frozen here. {@link refreshReads} says it of any value, so the step that
 * moves the trash's rows (db/fleet-files-unread.ts) reads a trashed row's
 * last fetch with the same text, and {@link fleetRefreshKept} reads every
 * row with it, for the count taken on a copy before 0422 runs
 * (scripts/fleet-machine-columns.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import { NUMBER, object, oneOf, readsWhole, TEXT } from "./json-reads";
import { type Lifted, type Reading, shown } from "./lifted-reading";

/** A last fetch, as `skills.last_refresh` and `plugins.last_refresh` held it (core `FleetRefresh`). */
const REFRESH = object(
  { at: NUMBER, outcome: oneOf("updated", "unchanged", "failed") },
  {
    error: TEXT,
    fromHash: TEXT,
    fromVersion: TEXT,
    toHash: TEXT,
    toVersion: TEXT,
  }
);

/** `value`, a column or a bound parameter, reads whole as a last fetch. */
export const refreshReads = (value: string): string =>
  readsWhole(value, REFRESH);

/** Why a last fetch that does not read whole does not, in a clause. */
export const REFRESH_WHY =
  "it is not when the fetch landed and whether it updated, held or failed";

/** One row's last fetch as 0422 reads it: its table, its row's key, the value as stored, and what 0422 makes of it. */
export interface KeptRefresh extends Lifted {
  table: "skills" | "plugins";
}

interface Row {
  json: number | null;
  key: string;
  raw: string | null;
  reads: number;
}

const readingOf = (row: Row): Reading => {
  if (row.raw === null) {
    return { kind: "unset" };
  }
  if (row.reads) {
    return { kind: "placed" };
  }
  return {
    kind: "restrictive",
    why: row.json ? REFRESH_WHY : "it is not JSON",
  };
};

/** Every skill's and plugin's last fetch as 0422 reads it. Run on a database 0422 has not run on. */
export const fleetRefreshKept = (client: Database): KeptRefresh[] =>
  (
    [
      ["skills", "name"],
      ["plugins", "id"],
    ] as const
  ).flatMap(([table, key]) =>
    client
      .query<Row, []>(
        `SELECT ${key} AS key, CAST(last_refresh AS TEXT) AS raw, CASE WHEN json_valid(last_refresh) THEN 1 ELSE 0 END AS json, ${refreshReads("last_refresh")} AS reads FROM ${table} ORDER BY ${key}`
      )
      .all()
      .map((row) => ({
        table,
        key: row.key,
        raw: row.raw,
        reading: readingOf(row),
      }))
  );

/** Logs every last fetch 0422 keeps as not read, one line each. Run only in a start that applies 0422 (db/migrate.ts). */
export const logFleetRefreshUnread = (client: Database): void => {
  for (const row of fleetRefreshKept(client)) {
    if (row.reading.kind !== "restrictive" || row.raw === null) {
      continue;
    }
    console.info(
      `[migrations] 0422: the ${row.table === "skills" ? "skill" : "plugin"} ${row.key}: its last fetch ${shown(row.raw)} does not read: ${row.reading.why}; kept as not read, no last fetch is said until the next one`
    );
  }
};

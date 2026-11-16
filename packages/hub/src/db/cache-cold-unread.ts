/**
 * Before migration 0425's SQL runs, the hub's log names every session whose
 * stored cold reading (`instances.cache_cold`, what a keep-alive ping that
 * missed its cache read, as JSON) 0425 keeps as not read: a value that is
 * there and does not read whole as the hub read it, with why.
 *
 * The predicate below is 0425's own: its SQL was written from it, over the
 * JSON column as it stands before it. {@link COLD} is the column's shape as
 * the hub read it then, frozen here. {@link cacheColdKept} reads every row
 * with it, for the count taken on a copy before 0425 runs
 * (scripts/cold-waits-heads.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import { NUMBER, object, readsWhole, shown, TEXT } from "./json-reads";

/** A cold reading, as `instances.cache_cold` held it: what the ping read, and when. */
const COLD = object({ at: NUMBER, reason: TEXT });

/** A cold reading read whole. */
const COLD_READ = readsWhole("cache_cold", COLD);

/** What a stored cold reading is to 0425. */
export type ColdReading =
  /** Never set: the session was never measured cold, or a real turn warmed it since. */
  | { kind: "never" }
  /** It reads whole and is placed as it is. */
  | { kind: "placed" }
  /** It does not read whole: kept as stored, none of it placed, and the session reads as cold. */
  | { kind: "unread"; why: string };

/** One session as 0425 reads it: its id, its cold reading as stored, and what 0425 makes of it. */
export interface KeptCold {
  id: string;
  raw: string | null;
  reading: ColdReading;
  status: string;
}

interface Row {
  id: string;
  json: number | null;
  raw: string | null;
  reads: number;
  status: string;
}

const readingOf = (row: Row): ColdReading => {
  if (row.raw === null) {
    return { kind: "never" };
  }
  if (row.reads) {
    return { kind: "placed" };
  }
  return {
    kind: "unread",
    why:
      row.json === 0
        ? "it is not JSON"
        : "it is not when a ping missed the cache (a number) and what it read (text)",
  };
};

/** Every session's cold reading as 0425 reads it. Run on a database 0425 has not run on. */
export const cacheColdKept = (client: Database): KeptCold[] =>
  client
    .query<Row, []>(
      `SELECT id, status, CAST(cache_cold AS TEXT) AS raw, CASE WHEN cache_cold IS NULL THEN NULL WHEN json_valid(cache_cold) THEN 1 ELSE 0 END AS json, ${COLD_READ} AS reads FROM instances ORDER BY created_at, id`
    )
    .all()
    .map((row) => ({
      id: row.id,
      status: row.status,
      raw: row.raw,
      reading: readingOf(row),
    }));

/** Logs every cold reading 0425 keeps as not read, one line each. Run only in a start that applies 0425 (db/migrate.ts). */
export const logCacheColdUnread = (client: Database): void => {
  for (const session of cacheColdKept(client)) {
    if (session.reading.kind !== "unread" || session.raw === null) {
      continue;
    }
    console.info(
      `[migrations] 0425: session ${session.id} (${session.status}): its cold reading ${shown(session.raw)} does not read: ${session.reading.why}; kept as not read, the session reads as cold until a real turn warms it or a ping measures it again`
    );
  }
};

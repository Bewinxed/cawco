/**
 * Before migration 0432's SQL runs, the hub's log names every account
 * reading whose stored extra usage (`account_readings.overage`, what its
 * last report said of spending past its plan) or window set
 * (`account_readings.window_kinds`, the keys of the windows its provider
 * last named) 0432 keeps as not read: a value that is there and does not
 * read whole, with why. Nothing of such a value is placed: extra usage
 * that does not read is none, so it never reads as on; a window set that
 * does not read is never named, so no window counts as known by it. A
 * window set that reads is placed whole, an empty one as named with no
 * keys, apart from one never named.
 *
 * The predicates below are 0432's own: its SQL was written from them, over
 * the JSON columns as they stand before it. {@link OVERAGE} and
 * {@link WINDOW_SET} are the columns' shapes as the hub read them then
 * (stored/columns.json), frozen here. {@link accountReadingsKept} reads
 * every reading with them, for the count taken on a copy before 0432 runs
 * (scripts/compaction-decides-tracker-readings.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import {
  FLAG,
  listOf,
  object,
  readsWhole,
  TEXT,
  TEXT_OR_NULL,
} from "./json-reads";
import {
  type Lifted,
  type LiftedRow,
  liftedColumns,
  liftedRows,
  logRestrictive,
  shown,
} from "./lifted-reading";

/** `account_readings.overage` as the hub read it (core `AccountOverage`). */
const OVERAGE = object({
  disabledReason: TEXT_OR_NULL,
  inUse: FLAG,
  resetsAt: TEXT_OR_NULL,
  status: TEXT_OR_NULL,
});

/** `account_readings.window_kinds` as the hub read it: the keys of the windows. */
const WINDOW_SET = listOf(TEXT);

/** Extra usage reads whole. */
const OVERAGE_READS = readsWhole("overage", OVERAGE);

/** The window set reads whole. */
const WINDOW_SET_READS = readsWhole("window_kinds", WINDOW_SET);

/** One reading's value as 0432 reads it, and which column. */
export type KeptReading = Lifted & { column: "overage" | "window_kinds" };

/** Why an object that is there does not read. */
const off = (what: string) => (): string[] => [`it is not ${what}`];

/** Every reading's extra usage and window set as 0432 reads them, by account. Run on a database 0432 has not run on. */
export const accountReadingsKept = (client: Database): KeptReading[] => [
  ...liftedRows<LiftedRow>(
    client,
    `SELECT account_id AS key, ${liftedColumns("overage", OVERAGE_READS)} FROM account_readings ORDER BY account_id`,
    off("whether it is in use and its status, reason and reset, as text")
  ).map((row) => ({ ...row, column: "overage" as const })),
  // A list is no object: the reasons a list's value gives are its own.
  ...client
    .query<LiftedRow, []>(
      `SELECT account_id AS key, ${liftedColumns("window_kinds", WINDOW_SET_READS)} FROM account_readings ORDER BY account_id`
    )
    .all()
    .map((row): KeptReading => ({
      key: row.key,
      raw: row.raw,
      column: "window_kinds",
      reading: windowSetReading(row),
    })),
];

/** What 0432 makes of a window set: a list of keys reads; anything else does not, and why. */
const windowSetReading = (row: LiftedRow): Lifted["reading"] => {
  if (row.raw === null) {
    return { kind: "unset" };
  }
  if (row.reads) {
    return { kind: "placed" };
  }
  return {
    kind: "restrictive",
    why: row.json
      ? "it is not a list of window keys as text"
      : "it is not JSON",
  };
};

/** Logs every extra usage and window set 0432 keeps as not read, one line each. Run only in a start that applies 0432 (db/migrate.ts). */
export const logAccountReadingsUnread = (client: Database): void => {
  const kept = accountReadingsKept(client);
  logRestrictive(
    kept.filter((row) => row.column === "overage"),
    (row, why) =>
      `[migrations] 0432: account ${row.key}: its extra usage ${shown(row.raw ?? "")} does not read: ${why}; kept as stored, none is placed and it never reads as on until its next report says it`
  );
  logRestrictive(
    kept.filter((row) => row.column === "window_kinds"),
    (row, why) =>
      `[migrations] 0432: account ${row.key}: its window set ${shown(row.raw ?? "")} does not read: ${why}; kept as stored, the set reads as never named, so no window counts as known by it until a report names one`
  );
};

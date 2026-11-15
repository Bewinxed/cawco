/**
 * What a migration that lifts a stored JSON value into columns makes of
 * one row, as its migrator step logs it and `bun run lifted-columns`
 * counts it (migrations 0410 to 0413), read with that migration's own
 * predicates over the column as it stands before it.
 *
 * Each JSON function sits inside a CASE that has proved its argument JSON
 * (and an object, for a key's type): SQLite may run the right side of an
 * AND first, so an AND would not keep them off a value that is not JSON.
 */
import type { Database } from "bun:sqlite";

/** What a stored value is to its migration. */
export type Reading =
  /** Null: never set, read as before. */
  | { kind: "unset" }
  /** It reads whole and is placed as it is. */
  | { kind: "placed" }
  /** It does not read whole: kept as stored, nothing of it placed, and read restrictively. */
  | { kind: "restrictive"; why: string };

/** One value as its migration reads it: its row's key, the value as stored, and what the migration makes of it. */
export interface Lifted {
  key: string;
  raw: string | null;
  reading: Reading;
}

/** What every read below selects of a row ({@link liftedColumns}): its key, its value, whether that is JSON, an object, and reads whole. */
export interface LiftedRow {
  json: number;
  key: string;
  object: number;
  raw: string | null;
  reads: number;
}

/** A value as the log shows it: cut short, on one line. */
export const shown = (raw: string): string => JSON.stringify(raw.slice(0, 160));

/** `column`'s value, whether it is JSON, whether an object, and whether it reads whole by `reads`, as {@link LiftedRow} names them. */
export const liftedColumns = (column: string, reads: string): string =>
  `CAST(${column} AS TEXT) AS raw, CASE WHEN json_valid(${column}) THEN 1 ELSE 0 END AS json, CASE WHEN json_valid(${column}) THEN json_type(${column}) = 'object' ELSE 0 END AS object, ${reads} AS reads`;

/** The JSON type of `key` in `column`; null when it is missing or `column` is no JSON object. */
export const typeIn = (column: string, key: string): string =>
  `CASE WHEN json_valid(${column}) THEN CASE WHEN json_type(${column}) = 'object' THEN json_type(${column}, '$.${key}') END END`;

/** Nothing when `key`'s JSON type is one of `types`; else why not, in a clause: missing, or not `what`. */
export const fieldOff = (
  key: string,
  type: string | null,
  types: readonly string[],
  what: string
): string[] => {
  if (type !== null && types.includes(type)) {
    return [];
  }
  return [`${key} is ${type === null ? "missing" : `not ${what}`}`];
};

/** Why a value that is there does not read: not JSON, not an object, else every field `fields` names off. */
const whyOf = <R extends LiftedRow>(
  row: R,
  fields: (row: R) => string[]
): string => {
  if (row.json === 0) {
    return "it is not JSON";
  }
  if (row.object === 0) {
    return "it is not an object";
  }
  return fields(row).join(", ");
};

/**
 * Each row `query` selects ({@link liftedColumns}, beside what `fields`
 * reads), as never set (null), placed (it reads whole) or restrictive, and
 * why ({@link whyOf}).
 */
export const liftedRows = <R extends LiftedRow>(
  client: Database,
  query: string,
  fields: (row: R) => string[]
): Lifted[] =>
  client
    .query<R, []>(query)
    .all()
    .map((row): Lifted => {
      if (row.raw === null) {
        return { key: row.key, raw: null, reading: { kind: "unset" } };
      }
      return {
        key: row.key,
        raw: row.raw,
        reading: row.reads
          ? { kind: "placed" }
          : { kind: "restrictive", why: whyOf(row, fields) },
      };
    });

/** Logs `line` of each restrictive value of `rows`, one line each: a migrator step's log. */
export const logRestrictive = (
  rows: Lifted[],
  line: (row: Lifted, why: string) => string
): void => {
  for (const row of rows) {
    if (row.reading.kind === "restrictive") {
      console.info(line(row, row.reading.why));
    }
  }
};

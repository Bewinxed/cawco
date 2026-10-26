/**
 * Every row of every stored JSON column (core stored-json.ts `storedJson`)
 * in a hub database, read as the hub reads it: parsed and checked against
 * the column's schema. A row that fails is a migration missing, since the hub
 * would throw reading it. Used by scripts/stored-json-check.ts on any
 * database, and by migrations:check on the migrated fixture.
 *
 * The schema module is imported only when asked: its modules read the
 * environment (CAWCO_DB_PATH), which the caller sets first.
 */
import type { Database } from "bun:sqlite";
import {
  isStoredShapeError,
  primaryKeyOf,
  readStoredText,
  type StoredShape,
  storedShapeOf,
} from "@cawco/core/stored-json";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";

/** One column's failing rows: how many, and the first by its primary key, with what zod said of it. */
export interface StoredFailure {
  column: string;
  count: number;
  issue: string;
  row: string;
  table: string;
}

export interface StoredRows {
  /** Rows read, every column. */
  checked: number;
  /** Stored JSON columns read. */
  columns: number;
  failures: StoredFailure[];
  /** Columns the schema declares and the database does not have (`table.column`). */
  missing: string[];
  /** Sealed columns not read, with no key to open them (`table.column`). */
  sealed: string[];
  /** Sealed values the given key did not open: read as no secret, as the hub reads them. */
  unopened: number;
}

const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/** One stored JSON column's rows, read and checked into `result`. */
const readColumn = (
  sqlite: Database,
  at: { table: string; column: string; keys: string[] },
  shape: StoredShape,
  open: ((raw: string) => string | null) | undefined,
  result: StoredRows
): void => {
  const select = (at.keys.length > 0 ? at.keys : ["rowid"])
    .map((key, i) => `${quote(key)} AS k${i}`)
    .join(", ");
  const rows = sqlite
    .query<Record<string, unknown>, []>(
      `SELECT ${select}, ${quote(at.column)} AS v FROM ${quote(at.table)} WHERE ${quote(at.column)} IS NOT NULL`
    )
    .iterate();
  let failed: StoredFailure | undefined;
  for (const row of rows) {
    result.checked += 1;
    const raw = String(row.v);
    const text = shape.seal && open ? open(raw) : raw;
    if (text === null) {
      result.unopened += 1;
      continue;
    }
    try {
      readStoredText(shape.schema, text, at);
    } catch (error) {
      if (!isStoredShapeError(error)) {
        throw error;
      }
      failed ??= {
        table: at.table,
        column: at.column,
        count: 0,
        row: Object.entries(row)
          .filter(([key]) => key !== "v")
          .map(([, value]) => String(value))
          .join("/"),
        issue: error.issue,
      };
      failed.count += 1;
    }
  }
  if (failed) {
    result.failures.push(failed);
  }
};

/**
 * Every stored JSON row in `sqlite`. `open` opens a sealed column's value
 * (the hub's key, secret-box.ts `makeSecretBox`); without it, sealed columns
 * are named in `sealed` and not read.
 */
export const storedRows = async (
  sqlite: Database,
  open?: (raw: string) => string | null
): Promise<StoredRows> => {
  const schema = await import("../src/db/schema");
  const result: StoredRows = {
    checked: 0,
    columns: 0,
    failures: [],
    missing: [],
    sealed: [],
    unopened: 0,
  };
  for (const table of Object.values(schema)) {
    if (!is(table, SQLiteTable)) {
      continue;
    }
    const { name, columns } = getTableConfig(table);
    const present = new Set(
      sqlite
        .query<{ name: string }, []>(`PRAGMA table_info(${quote(name)})`)
        .all()
        .map((row) => row.name)
    );
    const keys = primaryKeyOf(table).map((key) => key.name);
    for (const column of columns) {
      const shape = storedShapeOf(column);
      const at = `${name}.${column.name}`;
      if (!shape) {
        continue;
      }
      if (!present.has(column.name)) {
        result.missing.push(at);
      } else if (shape.seal && !open) {
        result.sealed.push(at);
      } else {
        result.columns += 1;
        readColumn(
          sqlite,
          { table: name, column: column.name, keys },
          shape,
          open,
          result
        );
      }
    }
  }
  return result;
};

/** The result in lines: each failing column with its count, a sample row and the issue, then the totals. */
export const storedRowsReport = (result: StoredRows): string[] => [
  ...result.failures.flatMap((failure) => [
    `${failure.table}.${failure.column}: ${failure.count} row${failure.count === 1 ? "" : "s"} fail, first ${failure.row}:`,
    ...failure.issue.split("\n").map((line) => `  ${line}`),
  ]),
  ...(result.missing.length > 0
    ? [`not in this database: ${result.missing.join(", ")}`]
    : []),
  ...(result.sealed.length > 0
    ? [`sealed, not read (no key): ${result.sealed.join(", ")}`]
    : []),
  ...(result.unopened > 0
    ? [
        `${result.unopened} sealed value(s) the key does not open (the hub reads them as no secret)`,
      ]
    : []),
  `${result.checked} rows in ${result.columns} stored JSON columns; ${result.failures.length === 0 ? "every one is its shape" : `${result.failures.reduce((n, f) => n + f.count, 0)} fail, in ${result.failures.length} column(s)`}`,
];

/**
 * Every row of every stored JSON column (hub stored-json.ts `storedJson`)
 * in a hub database, read as the hub reads it: parsed and checked against
 * the column's schema. A row that fails is a migration missing, since the hub
 * would throw reading it. Used by scripts/stored-json-check.ts on any
 * database, and by migrations:check on the migrated fixture.
 *
 * The schema module is imported only when asked: its modules read the
 * environment (CAWCO_DB_PATH), which the caller sets first.
 */
import type { Database } from "bun:sqlite";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  isStoredShapeError,
  primaryKeyOf,
  readStoredText,
  type StoredShape,
  storedShapeOf,
  undeclaredKeys,
} from "../src/stored-json";

/** One column's failing rows: how many, and the first by its primary key, with what zod said of it. */
interface StoredFailure {
  column: string;
  count: number;
  issue: string;
  row: string;
  table: string;
}

/** A key a column's rows hold that its type does not declare (its read strips it), its array indices as `[]`. */
interface StoredUndeclared {
  column: string;
  /** Rows holding it. */
  count: number;
  key: string;
  table: string;
  /** Where it is to be declared: `X (its file)`. */
  type: string;
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
  /**
   * Keys rows hold that their column's type does not declare: written
   * before its writes were checked (2026-10-26) or refused one
   * (2026-11-04), or a key taken out of the type since. A read strips them;
   * a write is refused them (hub stored-json.ts `checkStored`).
   */
  undeclared: StoredUndeclared[];
  /** Sealed values the given key did not open: read as no secret, as the hub reads them. */
  unopened: number;
}

/** An array's every index read as one: `steps[3].input` is `steps[].input`. */
const INDEX = /\[\d+\]/gu;

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
  const undeclared = new Map<string, StoredUndeclared>();
  for (const row of rows) {
    result.checked += 1;
    const raw = String(row.v);
    const text = shape.seal && open ? open(raw) : raw;
    if (text === null) {
      result.unopened += 1;
      continue;
    }
    try {
      const parsed = readStoredText(shape.schema, text, at);
      const keys = undeclaredKeys(shape.schema, JSON.parse(text), parsed);
      for (const [key, type] of new Map(
        keys.map((one) => [one.key.replace(INDEX, "[]"), one.type])
      )) {
        const held = undeclared.get(key) ?? {
          table: at.table,
          column: at.column,
          key,
          type,
          count: 0,
        };
        held.count += 1;
        undeclared.set(key, held);
      }
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
  result.undeclared.push(...undeclared.values());
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
    undeclared: [],
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
  ...result.undeclared.map(
    (one) =>
      `${one.table}.${one.column}: ${one.count} row${one.count === 1 ? "" : "s"} hold \`${one.key}\`, which ${one.type} does not declare: read without it, and a write of it is refused`
  ),
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

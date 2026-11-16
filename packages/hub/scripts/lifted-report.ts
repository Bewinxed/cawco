/**
 * What a counting script for migrations that lift stored JSON into columns
 * shares (`bun run lifted-columns`, `bun run
 * compaction-decides-tracker-readings`): the database named on its command
 * line, opened read-only, its columns, and the lines it prints: each
 * column's count, and a migration that has already run.
 */
import { Database } from "bun:sqlite";
import type { Lifted, Reading } from "../src/db/json-reads";

/** The database `script` was named, opened read-only; exits naming the command when none was. */
export const liftedReport = (script: string) => {
  const path = process.argv.at(2);
  if (path === undefined) {
    console.error(`${script}: name the database: bun run ${script} <path>`);
    process.exit(2);
  }
  const client = new Database(path, { readonly: true });
  /** Every table's columns as `table.column`, generated ones included (`table_xinfo`). */
  const columns = new Set(
    client
      .query<{ at: string }, []>(
        "SELECT m.name || '.' || c.name AS at FROM sqlite_master m JOIN pragma_table_xinfo(m.name) c WHERE m.type = 'table'"
      )
      .all()
      .map((one) => one.at)
  );
  /** One column's count, then each restrictive value by its key. */
  const report = (column: string, rows: Lifted[]): void => {
    const count = (kind: Reading["kind"]) =>
      rows.filter((row) => row.reading.kind === kind).length;
    console.log(
      `${column}: ${rows.length} read, ${count("unset")} never set, ${count("placed")} placed, ${count("restrictive")} restrictive`
    );
    for (const row of rows) {
      if (row.reading.kind === "restrictive") {
        console.log(
          `  restrictive: ${row.key}: ${JSON.stringify(row.raw)}: ${row.reading.why}`
        );
      }
    }
  };
  /** A migration that has run: its columns are read by the hub, not here. */
  const ran = (migration: string, lifted: string): void => {
    console.log(
      `${lifted}: ${migration} has run on ${path}; read a copy taken before it`
    );
  };
  return { client, columns, report, ran };
};

/**
 * A forgotten fact's words in the hub's database (forget-fact.ts): every
 * text cell that holds them, in any table, found by reading the database's
 * own layout (`pragma_table_info`), so a column added tomorrow is covered
 * with no change here. A cell holds the words as given, or as JSON writes
 * them inside a string (a quote or a line break escaped), since many
 * columns keep JSON. A forget writes `[redacted]` in their place, then
 * rewrites the file without the old bytes (VACUUM) and empties its WAL, as
 * sealing a secret does (seal-at-rest.ts): an UPDATE leaves them in freed
 * pages and in the WAL until something writes over them.
 *
 * A key column is left as it is, its count named: rewriting a key would cut
 * the rows that point at it. Drizzle's own migrations table is not read.
 */
import type { Database } from "bun:sqlite";

/** What a forgotten fact's words become wherever they stood. */
const FORGOTTEN = "[redacted]";

/** One column's cells that hold the words. */
export interface FactCells {
  column: string;
  /** A key column: its cells stay as they are. */
  key: boolean;
  rows: number;
  table: string;
}

/** Tables never read: SQLite's own and drizzle's migrations. */
const SKIPPED = /^(?:sqlite_|__drizzle)/u;

/** The forms the words take in a cell: as given, and inside a JSON string. */
const formsOf = (text: string): string[] => [
  ...new Set([text, JSON.stringify(text).slice(1, -1)]),
];

/** A name, quoted for SQL. */
const quoted = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/** Every table's text columns, keys marked. */
const textColumns = (sqlite: Database) =>
  (
    sqlite
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
      .all() as { name: string }[]
  )
    .filter(({ name }) => !SKIPPED.test(name))
    .flatMap(({ name: table }) =>
      (
        sqlite
          .query("SELECT name, type, pk FROM pragma_table_info(?)")
          .all(table) as { name: string; pk: number; type: string }[]
      )
        // Text, or no declared type (a column SQLite gives any value).
        .filter((column) => ["TEXT", ""].includes(column.type.toUpperCase()))
        .map((column) => ({ table, column: column.name, key: column.pk > 0 }))
    );

/** The condition a cell holding any of `forms` meets, with its values. */
const holding = (column: string, forms: string[]) => ({
  where: forms.map(() => `instr(${quoted(column)}, ?) > 0`).join(" OR "),
  values: forms,
});

export const factRowsDb = (sqlite: Database) => {
  /** Every column whose cells hold `text`, with how many. */
  const cells = (text: string): FactCells[] => {
    const forms = formsOf(text);
    return textColumns(sqlite).flatMap(({ table, column, key }) => {
      const { where, values } = holding(column, forms);
      const { rows } = sqlite
        .query(`SELECT count(*) AS rows FROM ${quoted(table)} WHERE ${where}`)
        .get(...values) as { rows: number };
      return rows > 0 ? [{ table, column, key, rows }] : [];
    });
  };

  return {
    cells,

    /**
     * The workspaces whose work items hold `text` in any of their words (a
     * brief, a title, a report): what a carry of theirs was made from, so a
     * forget lets it go (forget-fact.ts, by lineage).
     */
    workspacesHolding: (text: string): string[] => {
      const forms = formsOf(text);
      const columns = textColumns(sqlite).filter(
        (each) => each.table === "work_items"
      );
      if (columns.length === 0) {
        return [];
      }
      const conditions = columns.map(({ column }) => holding(column, forms));
      return (
        sqlite
          .query(
            `SELECT DISTINCT workspace_id AS id FROM work_items WHERE ${conditions.map((each) => `(${each.where})`).join(" OR ")}`
          )
          .all(...conditions.flatMap((each) => each.values)) as {
          id: string;
        }[]
      ).map((row) => row.id);
    },

    /**
     * `text` written {@link FORGOTTEN} in every cell that holds it but a
     * key's, in one transaction, then the file rewritten without the old
     * bytes; answers what held it, keys included.
     */
    forget: (text: string): FactCells[] => {
      const forms = formsOf(text);
      const found = sqlite
        .transaction(() => {
          const held = cells(text);
          for (const { table, column } of held.filter((each) => !each.key)) {
            const { where, values } = holding(column, forms);
            const replaced = forms.reduce(
              (cell) => `replace(${cell}, ?, '${FORGOTTEN}')`,
              quoted(column)
            );
            sqlite
              .query(
                `UPDATE ${quoted(table)} SET ${quoted(column)} = ${replaced} WHERE ${where}`
              )
              .run(...forms, ...values);
          }
          return held;
        })
        .immediate();
      if (found.some((each) => !each.key)) {
        sqlite.run("VACUUM");
        sqlite.run("PRAGMA wal_checkpoint(TRUNCATE)");
      }
      return found;
    },
  };
};

export type FactRowsDb = ReturnType<typeof factRowsDb>;

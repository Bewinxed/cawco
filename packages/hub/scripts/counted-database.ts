/**
 * What a script that counts a migration's rows before it runs opens: the
 * database named on its command line, read-only (a copy of a live hub's, or
 * a fixture unpacked), whether a column its migration drops is still there,
 * and the line it says for a table its migration has run on. Used by
 * continuations-moves-relay.ts and cold-waits-heads.ts.
 */
import { Database } from "bun:sqlite";

/** The database `script` was named, opened read-only; exits 2 when none was. */
export const countedDatabase = (script: string) => {
  const [path] = process.argv.slice(2);
  if (!path) {
    console.error(`${script}: name the database: bun run ${script} <path>`);
    process.exit(2);
  }
  const client = new Database(path, { readonly: true });
  return {
    client,
    /** Whether `table` has `column`: the JSON column a migration drops is still there. */
    has: (table: string, column: string): boolean =>
      client
        .query<{ found: number }, [string, string]>(
          "SELECT count(*) AS found FROM pragma_table_info(?) WHERE name = ?"
        )
        .get(table, column)?.found === 1,
    /** Says `migration` has run on the database, so `column` is not counted. */
    ran: (column: string, migration: string): void => {
      console.log(
        `${column}: ${migration} has run on ${path}; read a copy taken before it`
      );
    },
  };
};

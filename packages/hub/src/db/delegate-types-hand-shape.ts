/**
 * Until migration 0397, `delegate_types` and `delegate_types_meta` were made
 * and grown by hand, outside Drizzle's migrations: a `CREATE TABLE IF NOT
 * EXISTS`, then an `ALTER` for each column added after the first release,
 * probed as the hub opened its database. A database can hold the table at
 * any of those shapes, or not at all, and SQL cannot ask which. So before
 * 0397's SQL runs, this brings both tables to that code's last shape, and
 * 0397 copies them into the schema's tables from that one shape.
 */
import type { Database } from "bun:sqlite";

/**
 * Makes or grows both tables to the last shape the hand-made code gave
 * them. Run only in a start that applies 0397 (db/migrate.ts).
 */
export const delegateTypesHandShape = (client: Database): void => {
  client.run(`
    CREATE TABLE IF NOT EXISTS delegate_types (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      harness TEXT NOT NULL,
      model TEXT NOT NULL,
      effort TEXT,
      skills TEXT,
      deny_tools TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  const columns = new Set(
    client
      .query<{ name: string }, []>(
        "SELECT name FROM pragma_table_info('delegate_types')"
      )
      .all()
      .map((column) => column.name)
  );
  // A type that could delegate (`can_delegate = 1`) may start any.
  if (!columns.has("may_start")) {
    client.run("ALTER TABLE delegate_types ADD COLUMN may_start TEXT");
    if (columns.has("can_delegate")) {
      client.run(
        `UPDATE delegate_types SET may_start = '["any"]' WHERE can_delegate = 1`
      );
    }
  }
  for (const gone of ["can_delegate", "cawco_todos"]) {
    if (columns.has(gone)) {
      client.run(`ALTER TABLE delegate_types DROP COLUMN ${gone}`);
    }
  }
  for (const added of ["account", "connections", "starting_set"]) {
    if (!columns.has(added)) {
      client.run(`ALTER TABLE delegate_types ADD COLUMN ${added} TEXT`);
    }
  }
  client.run(`
    CREATE TABLE IF NOT EXISTS delegate_types_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
};

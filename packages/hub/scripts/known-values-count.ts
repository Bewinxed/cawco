/**
 * `bun run known-values-count <database>` in packages/hub: how many stored
 * rows already hold a value the known values (src/known-values.ts) would
 * replace, written before they were replaced where text enters the hub.
 * Opens the database read-only (a copy of a live hub's, or a fixture
 * unpacked) and reads every text column of every table but the secret
 * columns themselves and `session_identities`, row by row, through the
 * module's own matching:
 *
 * - **Session credentials** are matched by their hash in
 *   `session_identities`, as the hub matches them: no key is needed.
 * - **Sealed values** open only with the hub's key, read as migrations:check
 *   `--db` reads it: `secrets.key` beside the database, copied into a
 *   scratch folder this removes, never written beside the database; no
 *   other place is looked in. With no key there, it opens nothing, makes no
 *   key, and says that sealed values were not counted.
 *
 * Each column with a row that holds one is named with its count, and each
 * sealed value's count by the secret column it comes from, so a value that
 * is a common string shows as one source with many rows. Nothing secret is
 * printed, plain or sealed: a value is never named, only where it came from.
 */
import { Database } from "bun:sqlite";
import { databaseNamed, keyBeside } from "./key-beside";

const path = databaseNamed("known-values-count");
const { keyed, remove } = keyBeside(path);
try {
  const { createKnownValues } = await import("../src/known-values");
  const { sealedColumns } = await import("../src/db/sealed-columns");
  const { schemaTables } = await import("../src/db/forget");
  const client = new Database(path, { readonly: true });
  const columnsOf = (table: string): Set<string> =>
    new Set(
      client
        .query<{ name: string }, [string]>(
          "SELECT name FROM pragma_table_info(?)"
        )
        .all(table)
        .map((column) => column.name)
    );
  // The secret columns this database has: one a later migration adds is
  // not there yet on an older copy.
  const sealed = sealedColumns((await schemaTables()).values()).filter(
    (column) => columnsOf(column.table).has(column.column)
  );
  const isSealed = (table: string, column: string): boolean =>
    sealed.some((one) => one.table === table && one.column === column);
  const credentials = createKnownValues(client);
  const open = keyed
    ? (await import("../src/secret-box")).hubSecrets().open
    : undefined;
  const all = open
    ? createKnownValues(client, { columns: sealed, open })
    : undefined;
  /** One per secret column: which a sealed value a row holds comes from. */
  const bySource = open
    ? sealed.map((column) => ({
        source: `${column.table}.${column.column}`,
        values: createKnownValues(client, { columns: [column], open }),
      }))
    : [];
  const held =
    client
      .query<{ n: number }, []>(
        "SELECT count(*) AS n FROM session_identities WHERE credential_hash IS NOT NULL OR pending_hash IS NOT NULL"
      )
      .get()?.n ?? 0;
  console.log(
    `known-values-count: session credentials matched by their hash (${held} session(s) hold one); sealed values ${open ? `read from ${sealed.length} secret column(s) with the key beside ${path}` : `not counted: no secrets.key beside ${path}`}`
  );
  const tables = client
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('session_identities', '__drizzle_migrations') ORDER BY name"
    )
    .all()
    .map((table) => table.name);
  let rows = 0;
  let found = 0;
  for (const table of tables) {
    for (const column of columnsOf(table)) {
      if (isSealed(table, column)) {
        continue;
      }
      const cells = client
        .query<{ value: unknown }, []>(
          `SELECT "${column}" AS value FROM "${table}" WHERE typeof("${column}") = 'text'`
        )
        .iterate();
      let credentialRows = 0;
      let sealedRows = 0;
      const sources = new Map<string, number>();
      for (const { value } of cells) {
        if (typeof value !== "string") {
          continue;
        }
        rows += 1;
        const unCredentialed = credentials.text(value);
        const credential = unCredentialed !== value;
        const secret = all ? all.text(value) !== unCredentialed : false;
        credentialRows += credential ? 1 : 0;
        sealedRows += secret ? 1 : 0;
        found += credential || secret ? 1 : 0;
        if (secret) {
          for (const { source, values } of bySource) {
            if (values.text(unCredentialed) !== unCredentialed) {
              sources.set(source, (sources.get(source) ?? 0) + 1);
            }
          }
        }
      }
      if (credentialRows > 0 || sealedRows > 0) {
        const from = [...sources]
          .map(([source, count]) => `${source} ${count}`)
          .join(", ");
        console.log(
          `${table}.${column}: ${credentialRows} row(s) hold a session credential, ${sealedRows} a sealed value${from ? ` (from ${from})` : ""}`
        );
      }
    }
  }
  client.close();
  console.log(
    `known-values-count: ${found} of ${rows} stored text value(s) hold a value the known values would replace${open ? "" : " (session credentials only)"}`
  );
} finally {
  remove();
}

/**
 * The cutover to sealed secrets (secret-box.ts): every secret column a hub
 * kept as plain text is sealed in place, once, at start, right after the
 * schema's own migrations and before anything reads the rows. From then on
 * a sealed column is the only way the hub reads or writes them
 * (schema.ts `sealedText`, `sealedJson`).
 *
 * A value is sealed when it carries the box's mark (`v1:`); every other one
 * is sealed now, as it is stored: a JSON column's text is exactly what
 * `sealedJson` seals. So it runs on every start and finds nothing the second
 * time: idempotent without a marker of its own. A marked value the key does
 * not open (the key file was replaced) is left as it is: it reads as no
 * secret, and its feature asks for it again. A start that sealed anything
 * also rewrites the file (VACUUM) and empties its WAL, so no plain value is
 * left in freed pages.
 */
import type { Database } from "bun:sqlite";
import { hubSecrets, isSealed } from "../secret-box";

/** Every secret column, by table and the key its rows are found by. */
const SECRET_COLUMNS = [
  { table: "openrouter_connection", key: "id", columns: ["api_key"] },
  { table: "jev_settings", key: "id", columns: ["typesafe_key"] },
  { table: "supervisor_config", key: "id", columns: ["api_key"] },
  { table: "push_devices", key: "pairing_id", columns: ["secret", "key"] },
  {
    table: "fleet_mcp_oauth",
    key: "name",
    columns: ["client", "tokens", "token_client", "pending"],
  },
  { table: "mcp_servers", key: "name", columns: ["config"] },
  { table: "connections", key: "id", columns: ["sealed"] },
] as const;

/** Seals each plain secret in place, in one transaction; answers how many, by `table.column`. */
export const sealAtRest = (sqlite: Database): Record<string, number> => {
  const sealed: Record<string, number> = {};
  sqlite.transaction(() => {
    for (const { table, key, columns } of SECRET_COLUMNS) {
      for (const column of columns) {
        const rows = sqlite
          .query(
            `SELECT ${key} AS id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`
          )
          .all() as { id: string; value: string }[];
        const update = sqlite.query(
          `UPDATE ${table} SET ${column} = ? WHERE ${key} = ?`
        );
        let count = 0;
        for (const row of rows) {
          if (!isSealed(row.value)) {
            update.run(hubSecrets().seal(row.value), row.id);
            count += 1;
          }
        }
        if (count > 0) {
          sealed[`${table}.${column}`] = count;
        }
      }
    }
  })();
  if (Object.keys(sealed).length > 0) {
    // An UPDATE leaves the old bytes in the file's freed space and in the
    // WAL until something writes over them: the plain values would still be
    // on disk. VACUUM rewrites the file without them, and a truncating
    // checkpoint empties the WAL. Once, on the start that sealed anything.
    sqlite.run("VACUUM");
    sqlite.run("PRAGMA wal_checkpoint(TRUNCATE)");
  }
  return sealed;
};

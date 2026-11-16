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
  { table: "push_devices", key: "pairing_id", columns: ["secret", "key"] },
  {
    table: "fleet_mcp_oauth",
    key: "name",
    columns: [
      "client",
      "tokens",
      "token_client",
      "pending_verifier",
      "pending_unread",
    ],
  },
  { table: "mcp_servers", key: "name", columns: ["config"] },
  { table: "connections", key: "id", columns: ["sealed_unread"] },
  {
    table: "connection_secrets",
    key: "connection_id",
    columns: [
      "key",
      "tokens",
      "client",
      "verifier",
      "app_private_key",
      "app_client_secret",
      "app_webhook_secret",
      "device_code",
    ],
  },
] as const;

/**
 * Says once, at the start whose key is new (secret-box.ts `made`: no key
 * file was there), how many of the values sealed before do not open with
 * it, and where the key file goes back: each reads as no secret meanwhile,
 * every connection asks to be signed in again, and values 0420 kept as not
 * read are read again at the next start once it is back
 * (sealed-facts-unread.ts).
 */
const sayFreshKey = (marked: readonly string[]): void => {
  if (marked.length === 0) {
    return;
  }
  const box = hubSecrets();
  if (!box.made) {
    return;
  }
  const unopened = marked.filter((value) => {
    try {
      box.open(value);
      return false;
    } catch {
      return true;
    }
  }).length;
  if (unopened > 0) {
    console.warn(
      `[secret-box] no key file was at ${box.path}, so this start made a new key, and ${unopened} value(s) sealed before it do not open with it: each reads as no secret, and every connection and fleet sign-in they held needs signing in again. Putting the old key file back at ${box.path} and starting the hub again opens them, not what was sealed since.`
    );
  }
};

/** Seals each plain secret in place, in one transaction; answers how many, by `table.column`. */
export const sealAtRest = (sqlite: Database): Record<string, number> => {
  const sealed: Record<string, number> = {};
  /** Every value sealed before this start, for {@link sayFreshKey}. */
  const marked: string[] = [];
  // Immediate, as every transaction on the hub's file (db/index.ts `make`):
  // it reads, then writes, and a read that upgrades is refused at once while
  // another connection writes.
  sqlite
    .transaction(() => {
      for (const { table, key, columns } of SECRET_COLUMNS) {
        for (const column of columns) {
          const rows = sqlite
            .query<{ id: string; value: string }, []>(
              `SELECT ${key} AS id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`
            )
            .all();
          const update = sqlite.query(
            `UPDATE ${table} SET ${column} = ? WHERE ${key} = ?`
          );
          let count = 0;
          for (const row of rows) {
            if (isSealed(row.value)) {
              marked.push(row.value);
              continue;
            }
            update.run(hubSecrets().seal(row.value), row.id);
            count += 1;
          }
          if (count > 0) {
            sealed[`${table}.${column}`] = count;
          }
        }
      }
    })
    .immediate();
  sayFreshKey(marked);
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

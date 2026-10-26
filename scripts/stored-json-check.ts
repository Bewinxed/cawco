/**
 * `bun scripts/stored-json-check.ts <hub.db> [--key <secrets.key>]`: every
 * row of every stored JSON column in a hub database, checked against its
 * column's schema as the hub would read it (core stored-json.ts). It prints
 * each failing table and column with how many rows fail, the first one's
 * primary key, and what zod says is wrong. It exits 1 when any row fails:
 * each failure is a migration this commit is missing.
 *
 * The database is opened read-only and nothing is written: not the
 * database, and not a key. Sealed columns are opened with the hub's key, the
 * `secrets.key` beside the database unless `--key` names another. With no
 * key there, they are named and not read. migrations:check runs the same
 * check over the repository's migrated fixture (packages/hub
 * scripts/stored-rows.ts).
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const keyAt = args.indexOf("--key");
const keyArg = keyAt === -1 ? undefined : args[keyAt + 1];
const path = args.find(
  (arg, i) => !arg.startsWith("--") && (keyAt === -1 || i !== keyAt + 1)
);
if (!path) {
  console.error(
    "stored-json-check: name a hub database: bun scripts/stored-json-check.ts <hub.db> [--key <secrets.key>]"
  );
  process.exit(2);
}
const database = resolve(path);
if (!existsSync(database)) {
  console.error(`stored-json-check: ${database} is not there`);
  process.exit(2);
}
// Before the hub's modules load: config.ts reads it once, at import.
process.env.CAWCO_DB_PATH = database;

const { makeSecretBox } = await import("../packages/hub/src/secret-box");
const { storedRows, storedRowsReport } =
  await import("../packages/hub/scripts/stored-rows");

const keyFile = resolve(keyArg ?? join(dirname(database), "secrets.key"));
// makeSecretBox makes a key when there is none; only one that is there is read.
const box = existsSync(keyFile) ? makeSecretBox(keyFile) : undefined;
const open = box
  ? (raw: string): string | null => {
      try {
        return box.open(raw);
      } catch {
        return null;
      }
    }
  : undefined;

const sqlite = new Database(database, { readonly: true });
try {
  const result = await storedRows(sqlite, open);
  console.log(`stored-json-check: ${database}`);
  for (const line of storedRowsReport(result)) {
    console.log(line);
  }
  process.exit(result.failures.length > 0 ? 1 : 0);
} finally {
  sqlite.close();
}

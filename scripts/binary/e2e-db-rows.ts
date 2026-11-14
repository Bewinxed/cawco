/**
 * Reads and writes rows of a hub database on a test machine, which has no
 * sqlite3: run there by the installed binary acting as bun (BUN_BE_BUN=1),
 * by the migration rig's checks and by the fake builds that fail their trial
 * (e2e-fixture.ts `broken-binary`). Every write is one a running build may
 * repeat (the hub's unit starts a failing build again and again).
 *   cawco e2e-db-rows.ts write <db> <name>   a row in data_migrations named <name>
 *   cawco e2e-db-rows.ts has <db> <name>     `yes` or `no`
 *   cawco e2e-db-rows.ts migrate <db>        an applied migration newer than every one the database records,
 *                                            as a build with one more migration leaves it
 *   cawco e2e-db-rows.ts reshape <db>        every agents.build the JSON string "reshaped", which the hub's
 *                                            schema for it (an object) does not read
 *   cawco e2e-db-rows.ts check <db>          what PRAGMA quick_check says
 */
import { Database } from "bun:sqlite";

const [, , verb, path, name] = Bun.argv;
if (!path) {
  throw new Error(
    "usage: e2e-db-rows.ts write|has|migrate|reshape|check <db> [name]"
  );
}
const db = new Database(path, { readwrite: true });
db.run("PRAGMA busy_timeout = 5000");
try {
  switch (verb) {
    case "write":
      db.query(
        "INSERT OR IGNORE INTO data_migrations (name, at) VALUES (?, ?)"
      ).run(name ?? "", Date.now());
      break;
    case "has":
      console.log(
        db.query("SELECT 1 FROM data_migrations WHERE name = ?").get(name ?? "")
          ? "yes"
          : "no"
      );
      break;
    case "migrate":
      db.run(
        "INSERT INTO __drizzle_migrations (hash, created_at) SELECT 'e2e-newer', max(created_at) + 1 FROM __drizzle_migrations WHERE NOT EXISTS (SELECT 1 FROM __drizzle_migrations WHERE hash = 'e2e-newer')"
      );
      break;
    case "reshape":
      db.run(`UPDATE agents SET build = '"reshaped"'`);
      break;
    case "check":
      console.log(
        db
          .query<{ quick_check: string }, []>("PRAGMA quick_check")
          .all()
          .map((row) => row.quick_check)
          .join("; ")
      );
      break;
    default:
      throw new Error(`unknown verb ${verb}`);
  }
} finally {
  db.close();
}

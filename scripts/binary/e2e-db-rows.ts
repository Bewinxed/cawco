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
 *   cawco e2e-db-rows.ts copy <db> <to>      SQLite's own copy of the database (VACUUM INTO), whole beside a live hub
 *   cawco e2e-db-rows.ts foreign <db>        an applied migration no build has, stamped just below the newest the
 *                                            database records; prints its stamp
 *   cawco e2e-db-rows.ts unapply <db> <dir>  the record of one applied migration taken out: the newest before the
 *                                            last in the journal in <dir> whose SQL makes, alters, drops or renames
 *                                            nothing (so it runs again on the finished schema); prints its tag
 */
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** SQL that makes, alters, drops or renames something: a migration without it runs again on a finished schema. */
const SCHEMA_CHANGE = /\b(CREATE|ALTER|DROP|RENAME)\b/iu;
const [, , verb, path, name] = Bun.argv;
/** The newest `created_at` the database records. */
const newest = (handle: Database): number =>
  Number(
    (
      handle
        .query("SELECT max(created_at) AS at FROM __drizzle_migrations")
        .get() as {
        at: number;
      }
    ).at
  );
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
      // The stamp a scalar subquery, never the outer select's own aggregate: an
      // aggregate query returns its one row even where WHERE is false, so each
      // repeat would add a row stamped NULL.
      db.run(
        "INSERT INTO __drizzle_migrations (hash, created_at) SELECT 'e2e-newer', (SELECT max(created_at) + 1 FROM __drizzle_migrations) WHERE NOT EXISTS (SELECT 1 FROM __drizzle_migrations WHERE hash = 'e2e-newer')"
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
    case "copy":
      db.run(`VACUUM INTO '${(name ?? "").replaceAll("'", "''")}'`);
      break;
    case "foreign": {
      const at = newest(db) - 1;
      db.query(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('e2e-foreign', ?)"
      ).run(at);
      console.log(at);
      break;
    }
    case "unapply": {
      const dir = name ?? "";
      const { entries } = JSON.parse(
        readFileSync(join(dir, "meta/_journal.json"), "utf8")
      ) as { entries: { idx: number; tag: string; when: number }[] };
      const older = entries
        .toSorted((a, b) => a.idx - b.idx)
        .slice(0, -1)
        .findLast(
          (entry) =>
            !SCHEMA_CHANGE.test(
              readFileSync(join(dir, `${entry.tag}.sql`), "utf8")
            )
        );
      if (!older) {
        throw new Error(
          `no migration in ${dir} runs again on a finished schema`
        );
      }
      db.query("DELETE FROM __drizzle_migrations WHERE created_at = ?").run(
        older.when
      );
      console.log(older.tag);
      break;
    }
    default:
      throw new Error(`unknown verb ${verb}`);
  }
} finally {
  db.close();
}

/**
 * An update's rollback puts back the hub database it had before the update,
 * intact (cli binary-apply.ts `backUpDatabase`, `putBackup`,
 * `restoreDatabase`), on the update helper's own functions:
 *
 * 1. Rollback journal, the hub's own mode (it opens its file with no
 *    `journal_mode`): rows written, the pre-update copy taken, then the hub
 *    killed mid-transaction as its unit's SIGTERM does (the kernel's, no
 *    JavaScript runs after it), leaving a hot `cawco.db-journal`; the trial
 *    build damages the file as the stage-2 `migrates` fixture does; the copy
 *    is put back. The restored file, opened as the hub opens it, answers
 *    drizzle's first statement, `PRAGMA integrity_check` says `ok`, and every
 *    row is there.
 * 2. The same in WAL mode, with committed writes left in the WAL.
 * 3. While the helper holds the hub's lock (`<db>.lock`, core db-lock.ts), a
 *    hub that starts refuses the database; once the helper lets it go, a hub
 *    takes it. A live hub holding it keeps the helper out until it is gone.
 *
 *   bun scripts/probe-kit/run.ts rollback-database
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backUpDatabase,
  putBackup,
} from "../../../packages/cli/src/binary-apply";
import {
  DatabaseHeld,
  lockDatabase,
  releaseDatabase,
} from "../../../packages/core/src/db-lock";
import type { Kit, Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");
const DB_LOCK = join(ROOT, "packages", "core", "src", "db-lock.ts");
const ROWS = 600;

/** A database with `ROWS` rows over many pages, and the rule the rig saves. */
const seed = (path: string, wal: boolean): void => {
  const db = new Database(path);
  if (wal) {
    db.run("PRAGMA journal_mode = WAL");
  }
  db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, v BLOB)");
  db.run("CREATE TABLE u (id INTEGER PRIMARY KEY, v BLOB)");
  db.run("CREATE TABLE rules (name TEXT)");
  db.run("INSERT INTO rules VALUES ('kept-through-rollback')");
  // Two tables' pages interleaved, then one dropped: a file that has lived,
  // with free pages between the rows, which the copy's VACUUM INTO packs
  // tight, so a page of one is not the same page of the other.
  const insert = db.prepare("INSERT INTO t VALUES (?, randomblob(3000))");
  const other = db.prepare("INSERT INTO u VALUES (?, randomblob(3000))");
  for (let i = 1; i <= ROWS; i += 1) {
    insert.run(i);
    other.run(i);
  }
  db.run("DROP TABLE u");
  db.close();
};

/**
 * A hub killed while it writes: a process of its own rewrites every row in
 * one open transaction (a tiny page cache, so the pages reach the file
 * before the commit), says so, and is killed with SIGKILL. In WAL mode it
 * first commits rewrites that stay in the WAL (no checkpoint).
 */
const killedMidWrite = async (path: string, wal: boolean): Promise<void> => {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `const { Database } = require("bun:sqlite");
const db = new Database(${JSON.stringify(path)});
db.run("PRAGMA busy_timeout = 5000");
db.run("PRAGMA cache_size = 2");
${wal ? 'db.run("PRAGMA wal_autocheckpoint = 0"); for (let i = 0; i < 3; i++) db.run("UPDATE t SET v = randomblob(3000)");' : ""}
db.run("BEGIN IMMEDIATE");
db.run("UPDATE t SET v = randomblob(3000)");
console.log("ready");
await Bun.sleep(60000);`,
    ],
    { stdout: "pipe", stderr: "inherit" }
  );
  const reader = child.stdout.getReader();
  let said = "";
  while (!said.includes("ready")) {
    // biome-ignore lint/performance/noAwaitInLoops: a stream read, chunk by chunk
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    said += new TextDecoder().decode(value);
  }
  child.kill("SIGKILL");
  await child.exited;
};

/** What the hub meets on opening `path`: its first statement, the check, the rows. */
const openAsHub = (
  path: string
): { check: string; rows: number; rule: boolean } | { error: string } => {
  try {
    const db = new Database(path);
    try {
      db.run(
        'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)'
      );
      const check = db
        .query<{ integrity_check: string }, []>("PRAGMA integrity_check")
        .all()
        .map((row) => row.integrity_check)
        .join("; ");
      const rows =
        db.query<{ n: number }, []>("SELECT count(*) AS n FROM t").get()?.n ??
        0;
      const rule =
        db
          .query<{ name: string }, []>(
            "SELECT name FROM rules WHERE name = 'kept-through-rollback'"
          )
          .get() !== null;
      return { check, rows, rule };
    } finally {
      db.close();
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

/** One rollback, start to end, in a folder of its own; the restored file as the hub opens it. */
const rollback = async (kit: Kit, scratch: string, wal: boolean) => {
  const mode = wal ? "WAL" : "rollback journal";
  const folder = join(scratch, wal ? "wal" : "journal");
  mkdirSync(folder, { recursive: true });
  const db = join(folder, "cawco.db");
  seed(db, wal);
  const backup = backUpDatabase(db, "0.0.1-test.2");
  await killedMidWrite(db, wal);
  const sidecars = ["-journal", "-wal", "-shm"].filter((suffix) =>
    existsSync(`${db}${suffix}`)
  );
  kit.check(
    `${mode}: the hub killed mid-write left ${wal ? "its WAL" : "a hot journal"} beside the database`,
    sidecars.includes(wal ? "-wal" : "-journal"),
    sidecars.length
      ? sidecars.map((s) => `cawco.db${s}`).join(", ")
      : "no sidecar file"
  );
  // The trial build's hub, as the stage-2 `migrates` fixture is.
  await appendFile(db, "migrated-and-broken");
  await putBackup(db, backup, "0.0.1-test.8");
  const opened = openAsHub(db);
  kit.check(
    `${mode}: the restored database opens as the hub opens it and PRAGMA integrity_check says ok`,
    "check" in opened && opened.check === "ok",
    "error" in opened ? opened.error : opened.check.slice(0, 300)
  );
  kit.check(
    `${mode}: every row and the saved rule are in the restored database`,
    "rows" in opened && opened.rows === ROWS && opened.rule,
    "error" in opened
      ? opened.error
      : `${opened.rows} rows, rule ${opened.rule}`
  );
  const aside = `${db}.migrated-0.0.1-test.8`;
  kit.check(
    `${mode}: every sidecar the killed hub left is moved aside with the migrated file`,
    sidecars.every((suffix) => existsSync(`${aside}${suffix}`)) &&
      sidecars.every((suffix) => !existsSync(`${db}${suffix}`)),
    sidecars
      .map(
        (suffix) =>
          `${suffix}: aside ${existsSync(`${aside}${suffix}`)}, beside the restored ${existsSync(`${db}${suffix}`)}`
      )
      .join("; ")
  );
};

/** A hub's start, in a process of its own: `lockDatabase` as hub index.ts calls it; its exit says whether it took the lock. */
const hubStart = (db: string, hold: boolean) =>
  Bun.spawn(
    [
      process.execPath,
      "-e",
      `const { lockDatabase, DatabaseHeld } = await import(${JSON.stringify(DB_LOCK)});
try { await lockDatabase(${JSON.stringify(db)}); } catch (error) { if (error instanceof DatabaseHeld) process.exit(1); throw error; }
console.log("held");
${hold ? "await Bun.sleep(60000);" : ""}
process.exit(0);`,
    ],
    { stdout: "pipe", stderr: "inherit" }
  );

const lockLegs = async (kit: Kit, scratch: string) => {
  const db = join(scratch, "lock", "cawco.db");
  mkdirSync(join(scratch, "lock"), { recursive: true });
  // A live hub holds it: the helper is kept out until that hub is gone.
  const live = hubStart(db, true);
  const reader = live.stdout.getReader();
  await reader.read();
  const refused = await lockDatabase(db).then(
    () => false,
    (error: unknown) => error instanceof DatabaseHeld
  );
  kit.check(
    "while a live hub holds the database, the helper cannot take it",
    refused
  );
  live.kill("SIGKILL");
  await live.exited;
  await lockDatabase(db);
  kit.check("once that hub is gone, the helper takes its lock over", true);
  // A hub any unit starts while the helper holds it refuses the database.
  const during = await hubStart(db, false).exited;
  kit.check(
    "a hub started while the helper holds the lock refuses the database (exit 1)",
    during === 1,
    `exit ${during}`
  );
  await releaseDatabase(db);
  const after = await hubStart(db, false).exited;
  kit.check(
    "once the helper lets it go, a hub starting takes it (exit 0)",
    after === 0,
    `exit ${after}`
  );
};

const spec: Spec = {
  name: "rollback-database",
  run: async (kit: Kit) => {
    const scratch = mkdtempSync(join(tmpdir(), "rollback-database-"));
    // The helper's log (`apply.log`) goes under the scratch folder's binary root.
    const xdg = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = join(scratch, "data");
    mkdirSync(join(scratch, "data", "cawco", "binary"), { recursive: true });
    try {
      await rollback(kit, scratch, false);
      await rollback(kit, scratch, true);
      await lockLegs(kit, scratch);
    } finally {
      if (xdg === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = xdg;
      }
      rmSync(scratch, { recursive: true, force: true });
    }
  },
};

export default spec;

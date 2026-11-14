/**
 * Whether a hub database was migrated by a newer build than this one: THE ONE
 * check, asked by the hub as it starts (hub index.ts `startHub`) and as it
 * opens the database (hub db/migrate.ts `applyMigrations`), by `cawco service install`
 * before it points the hub's unit at a database (cli service.ts), by the
 * installer before a first install (cli binary-install.ts), and by the update
 * helper when a rollback could not put the copy back (cli binary-apply.ts).
 *
 * Drizzle applies only the migrations newer than the newest one a database
 * records (hub db/migrate.ts), so a build whose journal ends before that applies
 * nothing and runs older code on tables it does not know. This build's journal
 * is the one its hub runs: a checkout's `packages/hub/drizzle`, a build's own
 * tree.
 *
 * ONLY THE NEWEST IS COMPARED. Main's journal renumbered and re-stamped
 * eleven entries over its history, and a published nightly's database still
 * records one of the old `when`s (hub fixtures/realistic-db.sqlite.gz holds
 * 1787866655058, 0027's before), so an applied migration the journal lacks is
 * no sign of a newer build. A newer build's own migrations always sort above
 * an older journal's last: migrations:check refuses a journal whose `when`
 * does not increase with idx (hub scripts/migrations-check.ts `outOfOrder`). If
 * that check is ever loosened, this one loosens with it.
 */
import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { runtimeTree, standalone } from "./runtime";
import { copyBeforeUpdate } from "./update-copies";
import { hubDatabaseWords } from "./words/hub-database";

/**
 * Defined only in the published package's bundle (scripts/build-binary.ts),
 * where this module is `cli.js` and the migrations sit beside it.
 */
declare const __CAWCO_RELEASE__: boolean | undefined;

/** The hub's SQL migrations, shipped with the package so a fresh boot never needs a drizzle-kit step: a build's own tree, the published bundle's folder beside it, a checkout's `packages/hub/drizzle`. */
export const MIGRATIONS_DIR = standalone
  ? runtimeTree("drizzle")
  : Bun.fileURLToPath(
      new URL(
        typeof __CAWCO_RELEASE__ === "boolean"
          ? "./drizzle"
          : "../../hub/drizzle",
        import.meta.url
      )
    );

/** Drizzle's journal of the SQL migrations (`meta/_journal.json`). */
const Journal = z.object({
  entries: z.array(z.object({ tag: z.string(), when: z.number() })),
});

/** Each migration's `when` by its tag, as this build's journal keeps it. */
export const journalWhens = (): Map<string, number> => {
  const journal = Journal.parse(
    JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"))
  );
  return new Map(journal.entries.map(({ tag, when }) => [tag, when]));
};

/** The way out with no copy from before an update beside the database: a build's, or a checkout's. */
const wayOut = (): string =>
  standalone ? hubDatabaseWords.outOfBuild : hubDatabaseWords.outOfCheckout;

/**
 * Why the hub does not open the database at `path`, when a newer build
 * migrated it: its applied migrations newer than this build's newest, counted,
 * the newest one's time, and the way out: the copy from before an update
 * when the update helper left one beside it, else a checkout's or a build's.
 * `undefined` when there are none, or no database, or one no migration has run
 * on. Opened read-write and never written: a read-only open of a WAL database
 * with no `-shm` beside it is refused on macOS's SQLite (migrations-check.ts
 * `read`).
 */
export const newerDatabase = (path: string): string | undefined => {
  if (!existsSync(path)) {
    return undefined;
  }
  const last = Math.max(...journalWhens().values());
  const db = new Database(path, { readwrite: true });
  try {
    const kept = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'"
      )
      .get();
    if (!kept) {
      return undefined;
    }
    const newer = db
      .query<{ at: number }, []>(
        "SELECT created_at AS at FROM __drizzle_migrations"
      )
      .all()
      .map((row) => Number(row.at))
      .filter((at) => at > last);
    if (newer.length === 0) {
      return undefined;
    }
    const copy = copyBeforeUpdate(path);
    return hubDatabaseWords.newer(
      path,
      newer.length,
      new Date(Math.max(...newer)).toISOString(),
      copy ? hubDatabaseWords.outOfCopy(copy) : wayOut()
    );
  } finally {
    db.close();
  }
};

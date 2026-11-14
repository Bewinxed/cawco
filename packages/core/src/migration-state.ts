/**
 * Which of this build's migrations a hub database has applied, by identity:
 * THE ONE RESOLVER. The hub's start (hub index.ts `startHub`) and its open
 * (hub db/migrate.ts `applyMigrations`), `cawco service install` (cli
 * service.ts), the installer (cli binary-install.ts), the update helper's
 * rollback (cli binary-apply.ts) and migrations:check all ask it.
 *
 * Drizzle 0.45 stores a migration as `(hash, created_at)` and applies only
 * the journal entries whose `when` is above the newest `created_at`
 * (drizzle-orm sqlite-core/dialect.js:654-660): a migration from elsewhere
 * stamped later hides every pending one, silently (drizzle-orm#5316). Here a
 * row is a journal entry when its `created_at` is that entry's `when`, else
 * when its `hash` is the sha256 of that entry's `.sql` (drizzle-orm
 * migrator.js:23), the order drizzle 1.0 resolves old rows in
 * (up-migrations/sqlite.js:38-62). Neither alone is sound: main's journal
 * edited seven entries' SQL in place (old hashes in shipped databases) and
 * re-stamped nine (old `when`s, 0027's in 115 nightlies). migrations:check
 * holds every entry's `when` and SQL frozen from here on.
 *
 * A row no entry resolves is a migration this build does not have (a newer
 * build's, a branch's): the hub does not open that database. An entry no row
 * resolves is pending, and the hub applies it, in journal order, wherever its
 * `when` falls (hub db/migrate.ts).
 */
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
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
  entries: z.array(
    z.object({ idx: z.number(), tag: z.string(), when: z.number() })
  ),
});

/** One migration of a journal: its place, its name, its stamp and its file's hash, as drizzle records it. */
export interface JournalEntry {
  hash: string;
  idx: number;
  tag: string;
  when: number;
}

/** One row of `__drizzle_migrations`: what a database records of a migration it applied. */
export interface AppliedRow {
  createdAt: number;
  hash: string;
}

/**
 * The journal in `dir`, in idx order, each entry with the sha256 of its
 * `.sql` file's text, as drizzle's `readMigrationFiles` hashes it.
 */
export const journalEntries = (dir = MIGRATIONS_DIR): JournalEntry[] =>
  Journal.parse(
    JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8"))
  )
    .entries.map(({ idx, tag, when }) => ({
      idx,
      tag,
      when,
      hash: createHash("sha256")
        .update(readFileSync(join(dir, `${tag}.sql`), "utf8"))
        .digest("hex"),
    }))
    .toSorted((a, b) => a.idx - b.idx);

/** Every row `__drizzle_migrations` holds on the connection; none where no migration ever ran. */
export const appliedRows = (client: Database): AppliedRow[] =>
  client
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'"
    )
    .get()
    ? client
        .query<{ at: number | string; hash: string }, []>(
          "SELECT hash, created_at AS at FROM __drizzle_migrations"
        )
        .all()
        .map((row) => ({ hash: row.hash, createdAt: Number(row.at) }))
    : [];

/**
 * The rows no entry resolves (`unknown`), and the entries no row resolves
 * (`pending`, in idx order): each row is the entry whose `when` is its
 * `created_at`, else the one whose hash is its hash.
 */
export const migrationState = (
  rows: readonly AppliedRow[],
  entries: readonly JournalEntry[]
): { pending: JournalEntry[]; unknown: AppliedRow[] } => {
  const byWhen = new Map(entries.map((entry) => [entry.when, entry]));
  const byHash = new Map(entries.map((entry) => [entry.hash, entry]));
  const known = new Set<JournalEntry>();
  const unknown: AppliedRow[] = [];
  for (const row of rows) {
    const entry = byWhen.get(row.createdAt) ?? byHash.get(row.hash);
    if (entry) {
      known.add(entry);
    } else {
      unknown.push(row);
    }
  }
  return {
    pending: entries.filter((entry) => !known.has(entry)),
    unknown,
  };
};

/** The way out with no copy from before an update beside the database: a build's, or a checkout's. */
const wayOut = (): string =>
  standalone ? hubDatabaseWords.outOfBuild : hubDatabaseWords.outOfCheckout;

/** Why the hub does not open the database at `path`, which holds the `unknown` rows: each named by its stamp and hash, and the way out. */
export const unknownWords = (
  path: string,
  unknown: readonly AppliedRow[]
): string => {
  const copy = copyBeforeUpdate(path);
  return hubDatabaseWords.unknown(
    path,
    unknown
      .toSorted((a, b) => a.createdAt - b.createdAt)
      .map((row) =>
        hubDatabaseWords.migration(
          new Date(row.createdAt).toISOString(),
          row.hash.slice(0, 12)
        )
      ),
    copy ? hubDatabaseWords.outOfCopy(copy) : wayOut()
  );
};

/**
 * Why the hub does not open the database at `path`, when it holds a migration
 * this build does not have; `undefined` when every row is one of this
 * build's, or there is no database, or no migration ever ran on it. Opened
 * read-write and never written: a read-only open of a WAL database with no
 * `-shm` beside it is refused on macOS's SQLite (migrations-check.ts `read`).
 */
export const unknownMigrations = (path: string): string | undefined => {
  if (!existsSync(path)) {
    return undefined;
  }
  const db = new Database(path, { readwrite: true });
  try {
    const { unknown } = migrationState(appliedRows(db), journalEntries());
    return unknown.length > 0 ? unknownWords(path, unknown) : undefined;
  } finally {
    db.close();
  }
};

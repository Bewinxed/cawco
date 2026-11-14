/**
 * The hub's migrations as it opens its database: which of the SQL migrations
 * it applies (by identity, core migration-state.ts), and its code
 * migrations, what the SQL cannot do, in one list. The drizzle journal
 * (`drizzle/meta/_journal.json`) orders the SQL; a step here is keyed to a
 * journal tag, and each runs once, in its place.
 */
import type { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import {
  appliedRows,
  type JournalEntry,
  journalEntries,
  MIGRATIONS_DIR,
  migrationState,
  unknownWords,
} from "@cawco/core/migration-state";
import { hubStoppedPath } from "@cawco/core/paths/hub";
import { ownIdentity } from "@cawco/core/process-identity";
import { writeStateFileSync } from "@cawco/core/state-file";
import { hubDatabaseWords } from "@cawco/core/words/hub-database";
import { eq, is, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { DbCore } from "./core";
import { dropGraphPlaces } from "./drop-graph-places";
import { mergeProjectPages } from "./merge-project-pages";
import { FILE_HASHES } from "./migration-names";
import { rehashStoredFilesOnce } from "./rehash-stored-files";
import { dataMigrations } from "./schema";
import { sealAtRest } from "./seal-at-rest";

/** Where a step's work runs. */
type Step =
  /**
   * Beside the migrator, on the connection, with foreign keys off, inside
   * the migrations' transaction: immediately before the migration tagged
   * `before` in drizzle's journal applies, and only in a start that applies
   * it.
   */
  | {
      name: string;
      before: string;
      run: (client: Database) => void;
      at: "migrator";
    }
  /** On the connection, every start, after the last migration: its own idempotence. */
  | {
      name: string;
      after: "latest";
      run: (client: Database) => void;
      at: "open";
    }
  /** Once the store is up (recorded in `data_migrations`), after the last migration. */
  | {
      name: string;
      after: "latest";
      run: (db: BunSQLiteDatabase) => void;
      at: "opened";
    };

/**
 * In the order they run on one hub's start: the `migrator` steps in their
 * tags' journal order, then `open`, then `opened`. migrations:check holds
 * each tag to the journal and the list to that order. A once-step the hub
 * runs itself as it starts keeps its `data_migrations` name in
 * migration-names.ts, beside the others.
 */
export const MIGRATION_STEPS: readonly Step[] = [
  {
    name: "merge-project-pages",
    before: "0275_project_pages_outlive_sessions",
    at: "migrator",
    run: (client) => {
      mergeProjectPages(client);
    },
  },
  {
    name: "drop-graph-places",
    before: "0317_drop_graph_places",
    at: "migrator",
    run: (client) => {
      dropGraphPlaces(client);
    },
  },
  {
    name: "seal-at-rest",
    after: "latest",
    at: "open",
    run: (client) => {
      // Secrets kept as plain text before they were sealed are sealed now, before
      // anything reads them (seal-at-rest.ts).
      const sealed = sealAtRest(client);
      console.info(
        Object.keys(sealed).length > 0
          ? `[seal-at-rest] sealed in place: ${Object.entries(sealed)
              .map(([column, count]) => `${column} ${count}`)
              .join(", ")}`
          : "[seal-at-rest] every secret is sealed already"
      );
    },
  },
  {
    name: FILE_HASHES,
    after: "latest",
    at: "opened",
    run: (db) => {
      rehashStoredFilesOnce(db, FILE_HASHES);
    },
  },
];

/** Why the hub does not open the database at `path`: kept beside it for `cawco status` (core paths/hub.ts `hubStoppedPath`), and thrown. */
const stopOn = (path: string, why: string): never => {
  writeStateFileSync(hubStoppedPath(path), `${why}\n`);
  throw new Error(why);
};

/**
 * The first table or column the schema declares (`./schema`, its module
 * given) that the database on `client` does not have, as `table` or
 * `table.column`.
 */
const missingDeclared = (
  client: Database,
  schema: Record<string, unknown>
): string | undefined => {
  const columnsOf = client.query<{ name: string }, [string]>(
    "SELECT name FROM pragma_table_info(?)"
  );
  for (const table of Object.values(schema)) {
    if (!is(table, SQLiteTable)) {
      continue;
    }
    const { name, columns } = getTableConfig(table);
    const has = new Set(columnsOf.all(name).map((column) => column.name));
    if (has.size === 0) {
      return name;
    }
    const absent = columns.find((column) => !has.has(column.name));
    if (absent) {
      return `${name}.${absent.name}`;
    }
  }
  return undefined;
};

/** Drizzle's own table of applied migrations, as its migrator makes it (drizzle-orm sqlite-core/dialect.js:645-650). */
const MIGRATIONS_TABLE = sql`
			CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;

/**
 * This build's SQL migrations applied BY IDENTITY (core migration-state.ts),
 * never by drizzle's newest-stamp test, which skips any pending one stamped
 * below the newest a database records (drizzle-orm#5316):
 *
 * - a database holding a migration this build does not have is not opened,
 *   and nothing is applied to it;
 * - every pending migration is applied, in journal order, wherever its
 *   `when` falls, each recorded as drizzle records one, with each code step
 *   (`migrator`) immediately before its tag's SQL, all in one transaction;
 * - before that commits, every table and column the schema declares must be
 *   there: a migration applied behind a later one can rebuild a table and
 *   drop what the later one added, and then nothing is kept and the database
 *   is not opened.
 *
 * Then what runs on the connection after the last migration. Foreign keys
 * are off for the migrations and on from then on. Each way it does not open
 * the database is kept beside it for `cawco status`, and thrown, for every
 * hub that opens one (a start, migrations:check's hub).
 */
export const applyMigrations = async (
  db: BunSQLiteDatabase,
  client: Database,
  path: string
): Promise<void> => {
  db.run(MIGRATIONS_TABLE);
  const entries = journalEntries();
  const { pending, unknown } = migrationState(appliedRows(client), entries);
  if (unknown.length > 0) {
    stopOn(path, unknownWords(path, unknown));
  }
  // A marker for the update helper: while it names a live process the hub is
  // migrating, and the helper's wait for a healthy start does not run down.
  const migrating = `${path}.migrating`;
  writeStateFileSync(
    migrating,
    JSON.stringify({ ...(await ownIdentity()), startedAt: Date.now() })
  );
  // Migrations rebuild tables, which SQLite does with foreign keys off; they
  // run in one transaction, where the pragma cannot change, so it is set on
  // the connection around them. From then on every key the schema declares
  // holds, and its cascades run.
  client.run("PRAGMA foreign_keys = OFF");
  try {
    if (pending.length > 0) {
      applyPending(
        { db, client, path, schema: await import("./schema") },
        entries,
        pending
      );
    }
  } finally {
    rmSync(migrating, { force: true });
  }
  client.run("PRAGMA foreign_keys = ON");
  for (const step of MIGRATION_STEPS) {
    if (step.at === "open") {
      step.run(client);
    }
  }
};

/** The pending migrations, in one transaction (see {@link applyMigrations}). */
const applyPending = (
  on: {
    client: Database;
    db: BunSQLiteDatabase;
    path: string;
    schema: Record<string, unknown>;
  },
  entries: readonly JournalEntry[],
  pending: readonly JournalEntry[]
): void => {
  const { client, db, path } = on;
  const files = new Map(
    readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR }).map((file) => [
      file.folderMillis,
      file,
    ])
  );
  // Each pending one applied behind a later one this database held already.
  const held = entries.filter((entry) => !pending.includes(entry));
  const behind = pending.flatMap((entry) => {
    const later = held.findLast((one) => one.idx > entry.idx);
    return later ? [`${entry.tag} behind ${later.tag}`] : [];
  });
  const tags = pending.map((entry) => entry.tag);
  let missing: string | undefined;
  try {
    db.transaction(
      (tx) => {
        for (const entry of pending) {
          for (const step of MIGRATION_STEPS) {
            if (step.at === "migrator" && step.before === entry.tag) {
              step.run(client);
            }
          }
          const file = files.get(entry.when);
          if (!file) {
            throw new Error(
              `drizzle's migrations folder has no file for ${entry.tag}`
            );
          }
          for (const statement of file.sql) {
            tx.run(sql.raw(statement));
          }
          tx.run(
            sql`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES(${file.hash}, ${entry.when})`
          );
        }
        missing = missingDeclared(client, on.schema);
        if (missing) {
          // Nothing applied here is kept.
          tx.rollback();
        }
      },
      { behavior: "immediate" }
    );
  } catch (error) {
    if (!missing) {
      throw error;
    }
    stopOn(
      path,
      hubDatabaseWords.missingAfterApply(path, missing, tags, behind)
    );
  }
  console.info(
    `[migrations] applied ${tags.length <= 5 ? tags.join(", ") : `${tags.length} migrations, ${tags[0]} to ${tags.at(-1)}`}`
  );
  for (const line of behind) {
    console.info(
      `[migrations] applied ${line}, which this database already held`
    );
  }
};

/** The steps that run once the store is up, before it is handed out (every other step). */
export const runOpenedSteps = (db: BunSQLiteDatabase): void => {
  for (const step of MIGRATION_STEPS) {
    if (step.at === "opened") {
      step.run(db);
    }
  }
};

export interface DataMigrationsDb {
  /** Whether the one-time data migration `name` has run (`data_migrations`). */
  readonly dataMigrated: (name: string) => boolean;
  /** Marks the one-time data migration `name` run: it never runs again. */
  readonly markDataMigrated: (name: string) => void;
}

export const dataMigrationsDb = (core: DbCore): DataMigrationsDb => {
  const { db } = core;

  return {
    dataMigrated: (name) =>
      db
        .select()
        .from(dataMigrations)
        .where(eq(dataMigrations.name, name))
        .get() !== undefined,
    markDataMigrated: (name) => {
      db.insert(dataMigrations)
        .values({ name, at: new Date() })
        .onConflictDoNothing()
        .run();
    },
  };
};

/**
 * The hub's code migrations: what the SQL migrations cannot do, in one list.
 * The drizzle journal (`drizzle/meta/_journal.json`) orders the SQL; a step
 * here is keyed to a journal tag, and each runs once, in its place.
 */
import type { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import {
  journalWhens,
  MIGRATIONS_DIR,
  newerDatabase,
} from "@cawco/core/migrations-ahead";
import { ownIdentity } from "@cawco/core/process-identity";
import { writeStateFileSync } from "@cawco/core/state-file";
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { type MigrationMeta, readMigrationFiles } from "drizzle-orm/migrator";
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
   * Beside the migrator, on the connection, with foreign keys off: before
   * the migration tagged `before` in drizzle's journal applies.
   */
  | {
      name: string;
      before: string;
      run: (client: Database, when: number) => void;
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
    run: (client, when) => {
      mergeProjectPages(client, when);
    },
  },
  {
    name: "drop-graph-places",
    before: "0317_drop_graph_places",
    at: "migrator",
    run: (client, when) => {
      dropGraphPlaces(client, when);
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

/** The step's `when`, its place in the journal: refused for a tag no migration holds (migrations-check checks every one). */
const whenOf = (whens: Map<string, number>, tag: string): number => {
  const when = whens.get(tag);
  if (when === undefined) {
    throw new Error(`no migration tagged ${tag} in drizzle's journal`);
  }
  return when;
};

/**
 * Every SQL migration, with each code step beside the migrator in its place,
 * then what runs on the connection after the last one. Foreign keys are off
 * for the migrations and on from then on. A database a newer build migrated
 * is not opened (core migrations-ahead.ts): this throws its words before anything
 * runs on it, for every hub that opens one (a start, migrations:check's hub).
 */
export const applyMigrations = async (
  db: BunSQLiteDatabase,
  client: Database,
  path: string
): Promise<void> => {
  const newer = newerDatabase(path);
  if (newer) {
    throw new Error(newer);
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
    // Every migration before 0275, then a project's page rows of one name
    // folded into one (merge-project-pages.ts), then 0275 makes its name the
    // project's; every migration before 0317, then the decision graph's
    // places taken out of each page's state (drop-graph-places.ts), then
    // 0317 and the rest: drizzle applies only what is newer than the last
    // one applied, so each runs once, in order.
    const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR });
    // What drizzle's bun-sqlite `migrate` is (its migrator.js), whose
    // dialect and session its types keep internal.
    const { dialect, session } = db as unknown as {
      dialect: {
        migrate: (
          migrations: MigrationMeta[],
          session: unknown,
          config: { migrationsFolder: string }
        ) => void;
      };
      session: unknown;
    };
    const whens = journalWhens();
    for (const step of MIGRATION_STEPS) {
      if (step.at !== "migrator") {
        continue;
      }
      const when = whenOf(whens, step.before);
      dialect.migrate(
        migrations.filter((one) => one.folderMillis < when),
        session,
        { migrationsFolder: MIGRATIONS_DIR }
      );
      step.run(client, when);
    }
    dialect.migrate(migrations, session, { migrationsFolder: MIGRATIONS_DIR });
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

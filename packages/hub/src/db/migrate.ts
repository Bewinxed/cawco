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
import { logAsksUnread } from "./asks-unread";
import { logAtLimitUnread } from "./at-limit-unread";
import { logBudgetUnread } from "./budget-unread";
import { logContinuationsUnread } from "./continuation-askers-unread";
import type { DbCore } from "./core";
import { logCutFromUnread } from "./cut-from-unread";
import { delegateTypesHandShape } from "./delegate-types-hand-shape";
import { dropGraphPlaces } from "./drop-graph-places";
import { logGatePassesUnread } from "./gate-passes-unread";
import { logItemBlocksUnread } from "./item-blocks-unread";
import { logLandedUnread } from "./landed-unread";
import { logLimitLinesUnread } from "./limit-lines-unread";
import { logMayStartNarrowed } from "./may-start-narrowed";
import { mergeProjectPages } from "./merge-project-pages";
import { FILE_HASHES } from "./migration-names";
import { logMovesUnread } from "./move-states-unread";
import { logOutputsUnread } from "./outputs-unread";
import { logOwedSendsUnread } from "./owed-sends-unread";
import { logPassScopesUnread } from "./pass-scopes-unread";
import { logPlatformsRoutesUnread } from "./platforms-routes-unread";
import { logQueuedUnread } from "./queued-unread";
import { rehashStoredFilesOnce } from "./rehash-stored-files";
import { logRelayPortsUnread } from "./relay-ports-unread";
import { dataMigrations } from "./schema";
import { sealAtRest } from "./seal-at-rest";
import { placeSealedFacts } from "./sealed-facts-unread";
import { logSendOriginsUnread } from "./send-origins-unread";
import { logPlansUnread } from "./session-plans-unread";
import { logTrackerBaselinesUnread } from "./tracker-baselines-unread";

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
    name: "may-start-tables",
    before: "0397_may_start_tables",
    at: "migrator",
    run: (client) => {
      // The hand-made tables at their last shape, then the log of every
      // session and type 0397 places narrow, read before it runs.
      delegateTypesHandShape(client);
      logMayStartNarrowed(client);
    },
  },
  {
    name: "budget-unread",
    before: "0398_budget_columns",
    at: "migrator",
    run: (client) => {
      // Every budget 0398 keeps as not read, read before it runs.
      logBudgetUnread(client);
    },
  },
  {
    name: "at-limit-unread",
    before: "0399_at_limit_columns",
    at: "migrator",
    run: (client) => {
      // Every at-limit policy 0399 keeps as not read, read before it runs.
      logAtLimitUnread(client);
    },
  },
  {
    name: "landed-unread",
    before: "0400_landed_columns",
    at: "migrator",
    run: (client) => {
      // Every landing 0400 keeps as not read, read before it runs.
      logLandedUnread(client);
    },
  },
  {
    name: "gate-passes-unread",
    before: "0401_gate_passes_table",
    at: "migrator",
    run: (client) => {
      // Every record of gate passes 0401 keeps as not read, read before it runs.
      logGatePassesUnread(client);
    },
  },
  {
    name: "outputs-unread",
    before: "0404_outputs_tables",
    at: "migrator",
    run: (client) => {
      // Every list of outputs 0404 keeps as not read or reads again, read before it runs.
      logOutputsUnread(client);
    },
  },
  {
    name: "queued-unread",
    before: "0405_queued_request_schemas",
    at: "migrator",
    run: (client) => {
      // Every queued call and ask 0405 holds as not read, read before it runs.
      logQueuedUnread(client);
    },
  },
  {
    name: "platforms-routes-unread",
    before: "0406_platforms_routes_tables",
    at: "migrator",
    run: (client) => {
      // Every server's platforms and the fleet's routes 0406 keeps as not read, read before it runs.
      logPlatformsRoutesUnread(client);
    },
  },
  {
    name: "tracker-baselines-unread",
    before: "0407_tracker_baseline_columns",
    at: "migrator",
    run: (client) => {
      // Every tracker baseline 0407 keeps as not read, its link's merge held, read before it runs.
      logTrackerBaselinesUnread(client);
    },
  },
  {
    name: "asks-unread",
    before: "0408_ask_columns",
    at: "migrator",
    run: (client) => {
      // Every ask record 0408 keeps as not read, never read as an ask, read before it runs.
      logAsksUnread(client);
    },
  },
  {
    name: "pass-scopes-unread",
    before: "0409_pass_origins",
    at: "migrator",
    run: (client) => {
      // Every preview pass scope 0409 keeps as not read, opening no origin, read before it runs.
      logPassScopesUnread(client);
    },
  },
  {
    name: "limit-lines-unread",
    before: "0410_limit_line_kinds",
    at: "migrator",
    run: (client) => {
      // Every limit line and compaction plan 0410 keeps as not read, read before it runs.
      logLimitLinesUnread(client);
    },
  },
  {
    name: "cut-from-unread",
    before: "0411_cut_from_columns",
    at: "migrator",
    run: (client) => {
      // Every workspace's source 0411 keeps as not read, read before it runs.
      logCutFromUnread(client);
    },
  },
  {
    name: "item-blocks-unread",
    before: "0412_blocked_columns",
    at: "migrator",
    run: (client) => {
      // Every work item's block 0412 keeps as not read, read before it runs.
      logItemBlocksUnread(client);
    },
  },
  {
    name: "send-origins-unread",
    before: "0413_send_origin_columns",
    at: "migrator",
    run: (client) => {
      // Every send whose origin's kind 0413 reads as null, read before it runs.
      logSendOriginsUnread(client);
    },
  },
  {
    name: "continuations-unread",
    before: "0414_continuation_asker_columns",
    at: "migrator",
    run: (client) => {
      // Every continuation asker and wait 0414 keeps as not read, read before it runs.
      logContinuationsUnread(client);
    },
  },
  {
    name: "moves-unread",
    before: "0415_move_columns",
    at: "migrator",
    run: (client) => {
      // Every project move state 0415 keeps as not read, read before it runs.
      logMovesUnread(client);
    },
  },
  {
    name: "relay-ports-unread",
    before: "0416_relay_port_columns",
    at: "migrator",
    run: (client) => {
      // Every relay proof's chips and relay ports 0416 keeps as not read, read before it runs.
      logRelayPortsUnread(client);
    },
  },
  {
    name: "session-plans-unread",
    before: "0418_session_plan_rows",
    at: "migrator",
    run: (client) => {
      // Every session's plan 0418 keeps as not read, read before it runs.
      logPlansUnread(client);
    },
  },
  {
    name: "sealed-facts",
    before: "0420_connection_sealed_dropped",
    at: "migrator",
    run: (client) => {
      // What each connection held and each sign-in under way, opened with
      // the hub's key and placed in 0419's columns, each secret sealed alone,
      // before 0420 drops the sealed values (sealed-facts-unread.ts).
      placeSealedFacts(client, "migration");
    },
  },
  {
    name: "owed-sends-unread",
    before: "0421_sent_owed_held",
    at: "migrator",
    run: (client) => {
      // Every owed send whose owed envelope 0421 does not fold as it
      // stands, read before it runs.
      logOwedSendsUnread(client);
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
    name: "sealed-facts-read-again",
    after: "latest",
    at: "open",
    run: (client) => {
      // What 0420 kept as not read, read again with the hub's key as it is
      // now, each placed as 0420 would have when it reads
      // (sealed-facts-unread.ts): a key file put back opens them again.
      client
        .transaction(() => {
          placeSealedFacts(client, "unread");
        })
        .immediate();
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
 * `table.column`. Read with `table_xinfo`, which lists a generated column
 * (`sent_messages.origin_kind`) as `table_info` does not.
 */
const missingDeclared = (
  client: Database,
  schema: Record<string, unknown>
): string | undefined => {
  const columnsOf = client.query<{ name: string }, [string]>(
    "SELECT name FROM pragma_table_xinfo(?)"
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
 * hub that opens one (a start, migrations:check's hub, a restore's scratch
 * copy of a forgotten project's record, restore-schema.ts).
 *
 * `journal` is the build's whole journal for every hub. Only the binary smoke
 * test's fixture (scripts/binary/smoke-runtime.ts `smoke-fixture`) passes a
 * journal short of its end, to leave a database as the build before left
 * it; the schema declares the build's last entry, so the check that every
 * declared table and column is there runs only on a journal that reaches it,
 * and no hub skips it.
 */
export const applyMigrations = async (
  db: BunSQLiteDatabase,
  client: Database,
  path: string,
  journal: readonly JournalEntry[] = journalEntries()
): Promise<void> => {
  await migrateTo(db, client, path, journal);
  client.run("PRAGMA foreign_keys = ON");
  for (const step of MIGRATION_STEPS) {
    if (step.at === "open") {
      step.run(client);
    }
  }
};

/**
 * {@link applyMigrations}'s migrations alone: `journal`'s pending entries,
 * each with its `migrator` steps, and none of what runs after the last
 * migration, with foreign keys left off. A restore builds a forgotten
 * project's record's schema so (restore-schema.ts): `journal` is the
 * entries the hub had applied when it was forgotten, where a step that runs
 * after the last migration reads tables that schema may not have yet.
 */
export const migrateTo = async (
  db: BunSQLiteDatabase,
  client: Database,
  path: string,
  journal: readonly JournalEntry[]
): Promise<void> => {
  db.run(MIGRATIONS_TABLE);
  const whole = journal.at(-1)?.tag === journalEntries().at(-1)?.tag;
  const { pending, unknown } = migrationState(appliedRows(client), journal);
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
  // the connection around them. Once {@link applyMigrations} sets it on
  // again, every key the schema declares holds, and its cascades run.
  client.run("PRAGMA foreign_keys = OFF");
  try {
    if (pending.length > 0) {
      applyPending(
        {
          db,
          client,
          path,
          // No tables declared: nothing to check on a partial journal.
          schema: whole ? await import("./schema") : {},
        },
        journal,
        pending
      );
    }
  } finally {
    rmSync(migrating, { force: true });
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

/**
 * `bun run migrations:check` in packages/hub (part of the root typecheck):
 * every migration applies to a realistic database, and the hub opened on it
 * answers. The database is fixtures/realistic-db.sqlite.gz (fixture-db.ts):
 * a seeded scratch fleet's, at a published nightly's schema, so every
 * migration added since runs over real row shapes, as it will on a hub
 * updating from that nightly. A table the fixture had rows in must still
 * have rows: a migration that empties one is caught here, and one that drops
 * a table the schema still declares, unless every row it had is one a
 * migration declares it moves ({@link MOVES}), and each of those is found
 * where it went. A table the schema no longer declares
 * may be dropped, its rows with it. Every foreign key
 * the schema declares stands in the migrated database with the same
 * ON DELETE and ON UPDATE ({@link foreignKeyDrift}). The journal's `when`
 * increases strictly with idx ({@link outOfOrder}), and the code migration
 * steps are listed in the order they run, by their tags' journal order
 * ({@link misplacedSteps}). No check constraint
 * names a column through its table ({@link qualifiedChecks}). Once the hub has
 * started, no row names a row that is not there (`PRAGMA
 * foreign_key_check`): a hub that kept a port for a project no longer there
 * died at every start (nightly 4627).
 *
 * `--db <path>`: the same over a copy of that database instead (a live
 * hub's, or a copy of one), taken by `VACUUM INTO`; the given file is never
 * written: hub start-up and migrations are proven on a copy of the live
 * database before landing. Its hub's `secrets.key` is copied beside the copy,
 * so its sealed values open as they do on that hub. Its hub opens no port
 * and dials nothing (hub-in-process.ts), so it runs beside the live hub on
 * the live hub's own machine and network and leaves both alone.
 */
import { Database } from "bun:sqlite";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { choiceEntryProblem } from "@cawco/core/choices";
import {
  type AppliedRow,
  appliedRows,
  type JournalEntry,
  journalEntries,
  migrationState,
} from "@cawco/core/migration-state";
import { getTableName, is } from "drizzle-orm";
import {
  getTableConfig,
  type SQLiteColumn,
  SQLiteTable,
} from "drizzle-orm/sqlite-core";
import { applyUpdate, Doc } from "yjs";
import { z } from "zod";
import { type TitleSource, titleFor, titlesSaid } from "../src/artifact-titles";
import type { OwnedOp, OwnedRow } from "../src/db/owned-rows";
import { type OwnerKind, ownerOf } from "../src/db/owner-columns";
import { PROGRAM_FILE } from "../src/decision-program";
import { hubInProcess } from "./hub-in-process";
import { baseRefOf } from "./openapi-inputs";
import { newestNightly } from "./shipped";
import { storedRows, storedRowsReport } from "./stored-rows";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["packages/hub/"];

/** Every page doc's picks read as the hub reads them (core `choiceEntryProblem`): how many, and each one that is not a choice. */
const docChoices = (
  dbPath: string
): { checked: number; failures: string[] } => {
  const sqlite = new Database(dbPath, { readonly: true });
  const pages = sqlite
    .query<{ id: string }, []>("SELECT id FROM artifacts WHERE kind = 'page'")
    .all();
  const updates = sqlite.query<{ update: Uint8Array }, [string]>(
    'SELECT "update" FROM artifact_updates WHERE artifact_id = ? ORDER BY seq'
  );
  let checked = 0;
  const failures: string[] = [];
  for (const { id } of pages) {
    const doc = new Doc();
    for (const row of updates.all(id)) {
      applyUpdate(doc, row.update);
    }
    for (const [key, entry] of Object.entries(doc.getMap("state").toJSON())) {
      checked += 1;
      const problem = choiceEntryProblem(key, entry);
      if (problem) {
        failures.push(`${id}#${key}: ${problem}`);
      }
    }
    doc.destroy();
  }
  sqlite.close();
  return { checked, failures };
};

/**
 * The artifacts with no title before the hub starts (every one, on a
 * database from before migration 0375), each with the title the hub's
 * one-time pass gives it (artifact-titles.ts `titleFor`), its decision
 * page's program read from the artifacts folder beside the database.
 */
const untitledBefore = (
  dbPath: string
): Map<string, { source: TitleSource; title: string }> => {
  const sqlite = new Database(dbPath, { readwrite: true });
  const columns = new Set(
    sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM pragma_table_info('artifacts')"
      )
      .all()
      .map((column) => column.name)
  );
  // A database from before asks (migration 0267) has none: an empty ask, as that migration leaves it.
  const rows = sqlite
    .query<{ ask: string; id: string; kind: string; name: string }, []>(
      `SELECT id, kind, name, ${columns.has("ask") ? "ask" : "'' AS ask"} FROM artifacts${columns.has("title") ? " WHERE title = ''" : ""}`
    )
    .all();
  sqlite.close();
  const root = join(dirname(dbPath), "artifacts");
  return new Map(
    rows.map((row) => {
      const file = join(root, row.id, PROGRAM_FILE);
      const program = existsSync(file) ? readFileSync(file, "utf8") : undefined;
      return [row.id, titleFor(row as Parameters<typeof titleFor>[0], program)];
    })
  );
};

/** Each artifact's title once the hub started, by id. */
const titlesAfter = (dbPath: string): Map<string, string> => {
  const sqlite = new Database(dbPath, { readwrite: true });
  const rows = sqlite
    .query<{ id: string; title: string }, []>("SELECT id, title FROM artifacts")
    .all();
  sqlite.close();
  return new Map(rows.map((row) => [row.id, row.title]));
};

const started = performance.now();
const HUB = resolve(import.meta.dir, "..");
const FIXTURE = join(HUB, "fixtures", "realistic-db.sqlite.gz");
const at = process.argv.indexOf("--db");
/** A database to check instead of the fixture, copied first; undefined: the fixture. */
const GIVEN = at === -1 ? undefined : process.argv[at + 1];
const scratch = mkdtempSync(join(tmpdir(), "cawco-migrations-"));

/**
 * Two journal entries with one `when` or one file hash: either witness would
 * then name two migrations (core migration-state.ts resolves a row by its
 * `created_at`, then its hash), each as a sentence.
 */
const sharedWitnesses = (journal: readonly JournalEntry[]): string[] => {
  const problems: string[] = [];
  for (const witness of ["when", "hash"] as const) {
    const seen = new Map<string | number, string>();
    for (const entry of journal) {
      const first = seen.get(entry[witness]);
      if (first) {
        problems.push(
          `\`${entry.tag}\` has the same ${witness} as \`${first}\`: a database's row of one would read as the other`
        );
      }
      seen.set(entry[witness], entry.tag);
    }
  }
  return problems;
};

/** git in this repository: its output, or `undefined` where it fails (a path a commit does not hold). */
const gitOut = (args: string[]): string | undefined => {
  const run = Bun.spawnSync(["git", ...args], {
    cwd: HUB,
    env: process.env,
    stderr: "pipe",
  });
  return run.exitCode === 0 ? run.stdout.toString() : undefined;
};

/** A journal as a commit kept it: each entry's tag and `when`. */
const JournalTags = z.object({
  entries: z.array(z.object({ tag: z.string(), when: z.number() })),
});

/**
 * A MIGRATION ON MAIN IS FROZEN. Every entry of the journal at the base (the
 * merge-base with origin/main, or `--base`) and at the newest published
 * nightly keeps its `when` here, and the entry with that `when` keeps that
 * commit's `.sql` bytes: a database records `(hash, created_at)` and nothing
 * else, so an edited or re-stamped migration reads as another one (core
 * migration-state.ts). Its tag may be renumbered. A migration found wrong
 * after it lands is fixed by a new one. The bases are the ones
 * stored-compat.ts holds the stored shapes to.
 */
const editedMigrations = (
  journal: readonly JournalEntry[]
): { problems: string[]; said: string } => {
  const byWhen = new Map(journal.map((entry) => [entry.when, entry]));
  const bases = new Map<string, string>();
  for (const base of [
    { label: "the base", commit: baseRefOf(process.argv) },
    newestNightly(HUB),
  ]) {
    const commit = gitOut(["rev-parse", `${base.commit}^{commit}`])?.trim();
    if (!commit) {
      throw new Error(`${base.label} (${base.commit}) is not a commit here`);
    }
    if (!bases.has(commit)) {
      bases.set(
        commit,
        base.label === "the base"
          ? `the base ${commit.slice(0, 12)}`
          : base.label
      );
    }
  }
  const problems: string[] = [];
  for (const [commit, label] of bases) {
    const text = gitOut([
      "show",
      `${commit}:packages/hub/drizzle/meta/_journal.json`,
    ]);
    if (!text) {
      continue;
    }
    const then = JournalTags.parse(JSON.parse(text)).entries;
    for (const entry of then) {
      const now = byWhen.get(entry.when);
      if (!now) {
        problems.push(
          `${entry.tag} (when ${entry.when}) is in ${label}'s journal and in none here: a migration on main keeps its \`when\`; fix it with a new migration`
        );
        continue;
      }
      const sqlThen = gitOut([
        "show",
        `${commit}:packages/hub/drizzle/${entry.tag}.sql`,
      ]);
      const sqlNow = readFileSync(
        join(HUB, "drizzle", `${now.tag}.sql`),
        "utf8"
      );
      if (sqlThen !== undefined && sqlThen !== sqlNow) {
        problems.push(
          `${now.tag}.sql differs from ${label}'s ${entry.tag}.sql: a migration on main keeps its bytes; fix it with a new migration`
        );
      }
    }
  }
  return {
    problems,
    said: `every migration in ${[...bases.values()].join(" and ")} keeps its \`when\` and its SQL here`,
  };
};

/** SQL that makes, alters, drops or renames something: a migration without it runs again on a finished schema. */
const SCHEMA_CHANGE = /\b(CREATE|ALTER|DROP|RENAME)\b/iu;

/** `__drizzle_migrations` and `sqlite_master` as they stand: what a database refused must still be. */
const shapeOf = (path: string): string => {
  const sqlite = new Database(path, { readwrite: true });
  const said = JSON.stringify([
    sqlite
      .query("SELECT hash, created_at FROM __drizzle_migrations ORDER BY rowid")
      .all(),
    sqlite
      .query("SELECT type, name, sql FROM sqlite_master ORDER BY name")
      .all(),
  ]);
  sqlite.close();
  return said;
};

/** A row no migration of this build is: `created_at` given, its hash of a text no migration file has. */
const foreignRow = (path: string, createdAt: number): AppliedRow => {
  const hash = new Bun.CryptoHasher("sha256")
    .update("migrations:check: a migration from elsewhere")
    .digest("hex");
  const sqlite = new Database(path, { readwrite: true });
  sqlite.run(
    'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)',
    [hash, createdAt]
  );
  sqlite.close();
  return { hash, createdAt };
};

/** Opens the database at `path` as the hub does (db/index.ts `make`): its migrations, by identity. */
const openAsHub = async (path: string): Promise<void> => {
  const { drizzle } = await import("drizzle-orm/bun-sqlite");
  const { applyMigrations } = await import("../src/db/migrate");
  const db = drizzle(path);
  try {
    await applyMigrations(db, db.$client, path);
  } finally {
    db.$client.close();
  }
};

/**
 * THE THREE WAYS DRIZZLE'S NEWEST-STAMP TEST GOES WRONG, each on a scratch
 * copy, opened as the hub opens its database:
 * - R1, the live hub's case: a row from elsewhere stamped above the journal's
 *   newest. Stock drizzle 0.45 applies none of the fixture's pending
 *   migrations and returns. Here: not opened, nothing applied.
 * - R2: the same row stamped inside the journal's range, which the newest
 *   stamp alone lets through. Here: not opened, nothing applied.
 * - A: an older migration left unapplied behind applied ones (the newest
 *   before the last whose SQL makes, alters, drops or renames nothing, so it
 *   runs again on the finished schema). Stock drizzle skips it. Here: applied,
 *   and the schema guard passes.
 * One line for each.
 */
const identityCases = async (
  migrated: string,
  journal: readonly JournalEntry[]
): Promise<string[]> => {
  const said: string[] = [];
  const newestEntry = Math.max(...journal.map((entry) => entry.when));
  const fixture = Bun.gunzipSync(
    new Uint8Array(await Bun.file(FIXTURE).arrayBuffer())
  );
  for (const [name, stamp] of [
    ["R1", (_fixtureNewest: number) => newestEntry + 1],
    ["R2", (fixtureNewest: number) => fixtureNewest + 1],
  ] as const) {
    const path = join(scratch, `case-${name}.db`);
    await Bun.write(path, fixture);
    const sqlite = new Database(path, { readwrite: true });
    const fixtureNewest = Math.max(
      ...appliedRows(sqlite).map((applied) => applied.createdAt)
    );
    sqlite.close();
    const row = foreignRow(path, stamp(fixtureNewest));
    const shape = shapeOf(path);
    const pending = migrationState(
      [...appliedRows(new Database(path, { readwrite: true }))],
      journal
    ).pending.length;
    const refused = await openAsHub(path).then(
      () => undefined,
      (error: unknown) =>
        error instanceof Error ? error.message : String(error)
    );
    const time = new Date(row.createdAt).toISOString();
    if (!(
      refused?.includes("holds a migration this build of CawCo doesn't have") &&
      refused.includes(`written ${time}, hash ${row.hash.slice(0, 12)}`)
    )) {
      throw new Error(
        `case ${name}: a database holding a migration stamped ${time} that this build does not have was ${refused ? `refused with other words: ${refused}` : "opened"}`
      );
    }
    if (shapeOf(path) !== shape) {
      throw new Error(`case ${name}: the database it did not open was changed`);
    }
    said.push(
      `case ${name}: a row from elsewhere stamped ${time} (${name === "R1" ? "above the journal's newest" : "inside the journal's range"}), ${pending} migrations pending: not opened, nothing applied`
    );
  }
  const path = join(scratch, "case-A.db");
  const source = new Database(migrated, { readwrite: true });
  source.run(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
  source.close();
  const older = journal
    .slice(0, -1)
    .findLast(
      (entry) =>
        !SCHEMA_CHANGE.test(
          readFileSync(join(HUB, "drizzle", `${entry.tag}.sql`), "utf8")
        )
    );
  if (!older) {
    throw new Error(
      "case A: no migration's SQL runs again on a finished schema"
    );
  }
  const sqlite = new Database(path, { readwrite: true });
  sqlite.run('DELETE FROM "__drizzle_migrations" WHERE created_at = ?', [
    older.when,
  ]);
  sqlite.close();
  await openAsHub(path);
  const after = new Database(path, { readwrite: true });
  const state = migrationState(appliedRows(after), journal);
  after.close();
  if (state.pending.length > 0 || state.unknown.length > 0) {
    throw new Error(
      `case A: ${older.tag}, unapplied behind the rest, is still pending once the database was opened`
    );
  }
  said.push(
    `case A: ${older.tag} unapplied behind ${journal.at(-1)?.tag}: applied, recorded, every declared table and column there`
  );
  return said;
};

/**
 * Rows in every table, and how many migrations the database records.
 * Opened read-write, on the scratch copy only: the fixture is a WAL database
 * (it was a hub's), and a read-only open of one with no -shm beside it is
 * refused (SQLITE_CANTOPEN on macOS's SQLite). Read-write also reads what
 * the hub left in the WAL after it closed, which `immutable` would not.
 */
const read = (path: string) => {
  const sqlite = new Database(path, { readwrite: true });
  const tables = sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    )
    .all()
    .map(({ name }) => name);
  const rows = new Map(
    tables.map((name) => [
      name,
      sqlite
        .query<{ n: number }, []>(`SELECT count(*) AS n FROM "${name}"`)
        .get()?.n ?? 0,
    ])
  );
  const applied = appliedRows(sqlite);
  sqlite.close();
  return {
    rows,
    applied,
    migrations: rows.get("__drizzle_migrations") ?? 0,
  };
};

/**
 * Rows a migration moves out of a table on purpose: `rows`, a condition on
 * `from` naming them as its SQL does; `key`, an expression over each giving
 * the key it has where it went; `arrived`, a condition on `to` that its row
 * meets, `?` its key. Read only over a database the migration runs on.
 */
interface Move {
  arrived: string;
  from: string;
  key: string;
  /** The migration's tag, as the journal names it. */
  migration: string;
  rows: string;
  to: string;
  why: string;
}

const MOVES: readonly Move[] = [
  {
    migration: "0337_asks",
    from: "parked_asks",
    rows: "json_type(`envelope`, '$.payload.adminWrite') = 'text'",
    key: "'ask_' || `request_id`",
    to: "asks",
    // Open as the migration writes it, or withdrawn by the hub's own start
    // (asks.ts `boot`: its session had ended), which says so.
    arrived:
      "`id` = ? AND (`state` = 'open' OR (`state` = 'withdrawn' AND json_extract(`record`, '$.withdrawn.by') = 'hub'))",
    why: "an admin write parked before the ask became an open `approve` ask (core asks.ts)",
  },
];

/** What each move that runs on the database at `path` takes, by its source table: the keys its rows have where they go. */
const moving = (
  path: string,
  runs: (migration: string) => boolean
): Map<Move, string[]> => {
  const sqlite = new Database(path, { readwrite: true });
  const tables = new Set(
    sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      )
      .all()
      .map(({ name }) => name)
  );
  const taken = new Map(
    MOVES.filter((move) => runs(move.migration) && tables.has(move.from)).map(
      (move) => [
        move,
        sqlite
          .query<{ key: string }, []>(
            `SELECT ${move.key} AS key FROM "${move.from}" WHERE ${move.rows}`
          )
          .all()
          .map(({ key }) => key),
      ]
    )
  );
  sqlite.close();
  return taken;
};

/** Every moved row not found where its move says it went, one line each. */
const notArrived = (path: string, moved: Map<Move, string[]>): string[] => {
  const sqlite = new Database(path, { readwrite: true });
  const lost = [...moved].flatMap(([move, keys]) =>
    keys
      .filter(
        (key) =>
          !sqlite
            .query<{ n: number }, [string]>(
              `SELECT count(*) AS n FROM "${move.to}" WHERE ${move.arrived}`
            )
            .get(key)?.n
      )
      .map(
        (key) =>
          `${move.migration} moves ${move.from} row ${key} to ${move.to} (${move.why}); it is not there.`
      )
  );
  sqlite.close();
  return lost;
};

/** A foreign key as `table.col, … → target(col, …)`, the key both sides are matched by. */
const keyOf = (table: string, from: string[], target: string, to: string[]) =>
  `${table}.${from.join(", ")} → ${target}(${to.join(", ")})`;

/** An action as SQLite reports it (`PRAGMA foreign_key_list`): upper case, NO ACTION when none is named. */
const action = (named: string | undefined): string =>
  (named ?? "no action").toUpperCase();

/**
 * Every foreign key the schema declares whose ON DELETE or ON UPDATE the
 * migrated database at `path` does not have, or that it does not have at
 * all, one line each naming the column. drizzle-kit 0.31 writes an added
 * column's REFERENCES without its actions (`ALTER TABLE … ADD … REFERENCES
 * t(id)`, drizzle-orm#5619, fixed only in the 1.0 beta), so a migration
 * generated that way needs its clause written by hand; this is what says so.
 * The schema is imported only now, after the hub ran: imported before
 * {@link hubInProcess}, its modules read the environment the hub sets up.
 */
const foreignKeyDrift = async (path: string): Promise<string[]> => {
  const schema = await import("../src/db/schema");
  const sqlite = new Database(path, { readwrite: true });
  const migrated = new Map<string, { onDelete: string; onUpdate: string }>();
  const declared = Object.values(schema).flatMap((value) =>
    is(value, SQLiteTable) ? [getTableConfig(value)] : []
  );
  for (const { name } of declared) {
    const rows = sqlite
      .query<
        {
          from: string;
          id: number;
          on_delete: string;
          on_update: string;
          table: string;
          to: string;
        },
        []
      >(`PRAGMA foreign_key_list("${name}")`)
      .all();
    for (const id of new Set(rows.map((row) => row.id))) {
      const parts = rows.filter((row) => row.id === id);
      const [first] = parts;
      migrated.set(
        keyOf(
          name,
          parts.map((row) => row.from),
          first.table,
          parts.map((row) => row.to)
        ),
        { onDelete: first.on_delete, onUpdate: first.on_update }
      );
    }
  }
  sqlite.close();
  return declared.flatMap(({ name, foreignKeys }) =>
    foreignKeys.flatMap((fk) => {
      const { columns, foreignColumns, foreignTable } = fk.reference();
      const key = keyOf(
        name,
        columns.map((column) => column.name),
        getTableConfig(foreignTable).name,
        foreignColumns.map((column) => column.name)
      );
      const want = {
        onDelete: action(fk.onDelete),
        onUpdate: action(fk.onUpdate),
      };
      const has = migrated.get(key);
      if (!has) {
        return [
          `${key}: the schema declares it; the migrated database has no such foreign key.`,
        ];
      }
      return (["onDelete", "onUpdate"] as const)
        .filter((which) => has[which] !== want[which])
        .map(
          (which) =>
            `${key}: the schema declares ${which === "onDelete" ? "ON DELETE" : "ON UPDATE"} ${want[which]}; the migrated database has ${has[which]}.`
        );
    })
  );
};

/**
 * Every entry whose `when` is not after the one before it, as a sentence
 * naming both. Drizzle's migrator applies only the migrations whose `when`
 * is after the newest one a database records, so a hub that ran the earlier
 * entry never runs a later one stamped before it.
 */
const outOfOrder = (entries: { tag: string; when: number }[]): string[] =>
  entries.flatMap((entry, i) => {
    const prior = entries[i - 1];
    return prior && entry.when <= prior.when
      ? [
          `\`${entry.tag}\`'s when (${entry.when}) is before \`${prior.tag}\`'s (${prior.when}): hubs that ran ${prior.tag.slice(0, 4)} skip it.`,
        ]
      : [];
  });

/**
 * Every check constraint in the newest snapshot that names a column through
 * its table (`"sent_messages"."instance_id"`), as a sentence. drizzle-kit
 * 0.31.11 remakes a table as `__new_<table>`, renames that qualifier to the
 * new name, then renames the table back: macOS's SQLite (3.54.0) refuses the
 * rename ("no such column: __new_sent_messages.thread_id") where Linux's
 * takes it, so the hub's migrations failed on a Mac alone.
 */
const qualifiedChecks = async (tag: string): Promise<string[]> => {
  const { tables } = (await Bun.file(
    join(HUB, `drizzle/meta/${tag.slice(0, 4)}_snapshot.json`)
  ).json()) as {
    tables: Record<
      string,
      { checkConstraints: Record<string, { name: string; value: string }> }
    >;
  };
  return Object.entries(tables).flatMap(([table, { checkConstraints }]) =>
    Object.values(checkConstraints)
      .filter(({ value }) => value.includes(`"${table}".`))
      .map(
        ({ name }) =>
          `\`${table}\`'s check \`${name}\` names a column through its table: write it \`sql.identifier("<column>")\`, so a remake of the table renames cleanly on macOS's SQLite.`
      )
  );
};

/** What a foreign key to this column says its own column names: the key is the schema's statement of an owner. */
const KEYED_OWNER: Readonly<Record<string, OwnerKind>> = {
  "agents.machine_id": "machine",
  "instances.id": "session",
  "projects.id": "project",
};

/** What each registry operation moves, by the owner it names. */
const OPERATION_OWNER: Readonly<
  Record<OwnedOp | "goesWithMachine", OwnerKind>
> = {
  drop: "session",
  fold: "session",
  foldProject: "project",
  goesWithMachine: "machine",
  rekey: "machine",
};

/** A column declared as naming an owner: which, and whether a foreign key answers for it. */
interface OwnerColumn {
  kind: OwnerKind;
  withKey: boolean;
}

/** A column as the check names it: `table.column`. */
const columnKey = (column: SQLiteColumn): string =>
  `${getTableName(column.table)}.${column.name}`;

/** The registry's problems: a row of a column not declared as an owner's, or an operation that moves another owner's rows. */
const registryProblems = (
  rows: readonly OwnedRow[],
  owners: Map<string, OwnerColumn>
): string[] =>
  rows.flatMap((row) => {
    const key = columnKey(row.column);
    const owner = owners.get(key);
    if (!owner) {
      return [
        `owned-rows.ts names ${key}, which the schema does not declare as naming a session, machine or project`,
      ];
    }
    return Object.entries(OPERATION_OWNER).flatMap(([op, moves]) =>
      op in row && moves !== owner.kind
        ? [
            `owned-rows.ts gives ${key}, a ${owner.kind}'s column, \`${op}\`, which moves a ${moves}'s rows`,
          ]
        : []
    );
  });

/** KNOWN_UNOWNED's problems: an entry the schema does not declare, one something now answers for, or one with no reason. */
const exceptionProblems = (
  exceptions: readonly { column: SQLiteColumn; reason: string }[],
  owners: Map<string, OwnerColumn>,
  registered: Set<string>
): string[] =>
  exceptions.flatMap(({ column, reason }) => {
    const key = columnKey(column);
    const owner = owners.get(key);
    if (!owner) {
      return [
        `KNOWN_UNOWNED names ${key}, which the schema does not declare as naming a session, machine or project`,
      ];
    }
    if (owner.withKey || registered.has(key)) {
      return [
        `${key} is in KNOWN_UNOWNED but now has ${owner.withKey ? "a foreign key" : "an owned-rows entry"}: take it off the list`,
      ];
    }
    return reason.trim() === "" ? [`KNOWN_UNOWNED gives ${key} no reason`] : [];
  });

/**
 * Every column the schema declares as naming a session, machine or project
 * (db/owner-columns.ts) is an owner's to answer for: a foreign key, a row in
 * the owned-rows registry whose operations fit the owner it names, or a
 * named exception with its reason ({@link KNOWN_UNOWNED}). A new column with
 * none of these is a decision the check surfaces. A column the schema keys
 * to a session's, machine's or project's id and declares plain has its mark
 * forgotten; one with no key declares what it names by its mark alone.
 */
const unownedColumns = async (): Promise<string[]> => {
  // Imported here, as the schema is: they load the hub's config, which a hub in this process reads first.
  const { KNOWN_UNOWNED, OWNED_ROWS } = await import("../src/db/owned-rows");
  const schema = await import("../src/db/schema");
  const declared = Object.values(schema).flatMap((value) =>
    is(value, SQLiteTable) ? [getTableConfig(value)] : []
  );
  const owners = new Map<string, OwnerColumn>();
  const unmarked: string[] = [];
  for (const table of declared) {
    const keyed = new Map<string, OwnerKind | undefined>(
      table.foreignKeys.flatMap((fk) => {
        const { columns, foreignColumns } = fk.reference();
        return columns.map((from, i): [string, OwnerKind | undefined] => {
          const to = foreignColumns[i];
          return [
            from.name,
            to && KEYED_OWNER[`${getTableName(to.table)}.${to.name}`],
          ];
        });
      })
    );
    for (const column of table.columns) {
      const key = `${table.name}.${column.name}`;
      const kind = ownerOf(column);
      const named = keyed.get(column.name);
      if (kind) {
        owners.set(key, { kind, withKey: keyed.has(column.name) });
      } else if (named) {
        unmarked.push(
          `${key} has a foreign key to a ${named}'s id but is declared plain: declare it with sessionColumn, machineColumn or projectColumn (db/owner-columns.ts)`
        );
      }
    }
  }
  if (owners.size === 0) {
    return [
      "No schema column carries an owner mark: drizzle no longer hands a builder's config to its column (db/owner-columns.ts `configOf`), so the marks are lost",
    ];
  }
  const registered = new Set(OWNED_ROWS.map((row) => columnKey(row.column)));
  const excepted = new Set(
    KNOWN_UNOWNED.map(({ column }) => columnKey(column))
  );
  const unanswered = [...owners]
    .filter(
      ([key, { withKey }]) =>
        !(withKey || registered.has(key) || excepted.has(key))
    )
    .map(
      ([key]) =>
        `${key} names a session, machine or project with no foreign key and no owned-rows entry: register it in db/owned-rows.ts, or add it to KNOWN_UNOWNED with its reason`
    );
  return [
    ...unmarked,
    ...registryProblems(OWNED_ROWS, owners),
    ...exceptionProblems(KNOWN_UNOWNED, owners, registered),
    ...unanswered,
  ];
};

/** The phases a hub's start runs the code migration steps in, in order. */
const STEP_PHASES = ["migrator", "open", "opened"] as const;

/**
 * The code migration steps (db/migrate.ts `MIGRATION_STEPS`) as the runner
 * reads them: each `migrator` step names a tag the journal holds, the steps
 * are listed in the order they run (every `migrator` step, then `open`, then
 * `opened`), and the `migrator` steps in their tags' journal order. A step
 * listed ahead of one with an earlier tag would apply the SQL up to its own
 * tag first, and the earlier step would then run against a later schema.
 */
const misplacedSteps = async (
  entries: readonly { idx: number; tag: string }[]
): Promise<string[]> => {
  // Read once the hub in this process has its database (hub-in-process.ts).
  const { MIGRATION_STEPS } = await import("../src/db/migrate");
  const problems: string[] = [];
  let phase = 0;
  let last: { idx: number; name: string; tag: string } | undefined;
  for (const step of MIGRATION_STEPS) {
    const runs = STEP_PHASES.indexOf(step.at);
    if (runs < phase) {
      problems.push(
        `db/migrate.ts lists ${step.name} (${step.at}) after a step that runs later (${STEP_PHASES[phase]}): list the steps in the order they run`
      );
    }
    phase = Math.max(phase, runs);
    if (step.at !== "migrator") {
      continue;
    }
    const entry = entries.find(({ tag }) => tag === step.before);
    if (!entry) {
      problems.push(
        `db/migrate.ts's ${step.name} names a journal tag no migration has: ${step.before}`
      );
      continue;
    }
    if (last && entry.idx <= last.idx) {
      problems.push(
        `db/migrate.ts lists ${step.name} (before ${step.before}) after ${last.name} (before ${last.tag}), out of the journal's order: list the migrator steps by their tags' order`
      );
    }
    last = { idx: entry.idx, name: step.name, tag: step.before };
  }
  return problems;
};

try {
  const { entries } = (await Bun.file(
    join(HUB, "drizzle/meta/_journal.json")
  ).json()) as { entries: { idx: number; tag: string; when: number }[] };
  const sorted = entries.toSorted((a, b) => a.idx - b.idx);
  const disordered = outOfOrder(sorted);
  if (disordered.length) {
    throw new Error(
      `The migration journal's \`when\` must increase with idx:\n${disordered.join("\n")}`
    );
  }
  const journal = journalEntries(join(HUB, "drizzle"));
  const twins = sharedWitnesses(journal);
  if (twins.length) {
    throw new Error(twins.join("\n"));
  }
  const thawed = editedMigrations(journal);
  if (thawed.problems.length) {
    throw new Error(thawed.problems.join("\n"));
  }
  const last = sorted.at(-1);
  const qualified = last ? await qualifiedChecks(last.tag) : [];
  if (qualified.length) {
    throw new Error(qualified.join("\n"));
  }
  const dbPath = join(scratch, "hub.db");
  mkdirSync(join(scratch, "home"));
  if (GIVEN) {
    // SQLite's own copy, never the file's bytes: a hub's database is in WAL
    // (hub db/wal.ts), and its committed writes not yet checkpointed are in
    // `-wal` beside it, which a copy of the file alone would lose. One read
    // transaction, so the copy is one commit's state even beside a live hub.
    const given = new Database(GIVEN, { readonly: true });
    try {
      given.run(`VACUUM INTO '${dbPath.replaceAll("'", "''")}'`);
    } finally {
      given.close();
    }
    // Its hub's key beside the copy (secret-box.ts keeps it beside the
    // database): the hub started on the copy opens its sealed values as that
    // hub does, so one that does not open is a real mismatch, not the copy's.
    const key = join(dirname(resolve(GIVEN)), "secrets.key");
    if (existsSync(key)) {
      copyFileSync(key, join(scratch, "secrets.key"));
      chmodSync(join(scratch, "secrets.key"), 0o600);
    }
    // Its decision pages' programs beside the copy, read only from the
    // given hub's artifacts folder: the start's title pass reads each
    // page's own title from it (artifact-titles.ts).
    const pages = join(dirname(resolve(GIVEN)), "artifacts");
    if (existsSync(pages)) {
      for (const id of readdirSync(pages)) {
        const program = join(pages, id, PROGRAM_FILE);
        if (existsSync(program)) {
          mkdirSync(join(scratch, "artifacts", id), { recursive: true });
          copyFileSync(program, join(scratch, "artifacts", id, PROGRAM_FILE));
        }
      }
    }
  } else {
    await Bun.write(
      dbPath,
      Bun.gunzipSync(new Uint8Array(await Bun.file(FIXTURE).arrayBuffer()))
    );
  }
  const before = read(dbPath);
  // A move runs on this database when its migration was pending before the
  // start, as the hub applies them (by identity, core migration-state.ts).
  const pendingBefore = new Set(
    migrationState(before.applied, journal).pending.map((entry) => entry.tag)
  );
  const moved = moving(dbPath, (migration) => pendingBefore.has(migration));
  const untitled = untitledBefore(dbPath);
  const { hub, lifetime } = await hubInProcess(dbPath, join(scratch, "home"));
  const answers: string[] = [];
  const answer = async (path: string): Promise<unknown> => {
    const response = await hub.handle(new Request(`http://127.0.0.1${path}`));
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `GET ${path} answered ${response.status}: ${text.slice(0, 300)}`
      );
    }
    answers.push(path);
    return JSON.parse(text);
  };
  const projects = (await answer("/api/projects")) as { id: string }[];
  await answer("/api/instances");
  await answer("/api/agents");
  const project = projects[0]?.id;
  if (!project) {
    throw new Error("The hub lists no project from the database's");
  }
  await answer(`/api/projects/${project}/tasks`);
  await answer(`/api/projects/${project}/caw`);
  lifetime.close();
  const after = read(dbPath);
  // Both ways, the fixture and a given database alike: every journal entry
  // is a row of the database once the hub started, and every row an entry.
  const resolved = migrationState(after.applied, journal);
  if (resolved.pending.length > 0 || resolved.unknown.length > 0) {
    throw new Error(
      `Once the hub started, the database records none of ${resolved.pending.map((entry) => entry.tag).join(", ") || "no entry"}, and holds rows no journal entry is: ${resolved.unknown.map((row) => `${row.createdAt} ${row.hash.slice(0, 12)}`).join(", ") || "none"}`
    );
  }
  // What a given database's start empties by itself, never a migration: the
  // task index (project_task_*), rebuilt from project folders a copy does
  // not carry, and the tool-call keys, kept 10 minutes past their answer
  // (tool-call-keys.ts TOOL_CALL_KEY_KEPT_MS) and pruned as the hub starts,
  // and fleet watch's notices, each dropped at the hub's start once its
  // session runs no more or its work item is over (fleet-watch.ts, the sweep
  // in createFleetWatch).
  const startEmpties = (name: string): boolean =>
    !!GIVEN &&
    (name.startsWith("project_task") ||
      name === "tool_call_keys" ||
      name === "fleet_watch_notices");
  // A table a migration drops goes with its rows, as its SQL says it does;
  // one the schema still declares must still be there.
  const schema = await import("../src/db/schema");
  const declared = new Set(
    Object.values(schema).flatMap((value) =>
      is(value, SQLiteTable) ? [getTableConfig(value).name] : []
    )
  );
  // Rows each table had that a migration declares it moves.
  const movedOut = new Map<string, number>();
  for (const [move, keys] of moved) {
    movedOut.set(move.from, (movedOut.get(move.from) ?? 0) + keys.length);
  }
  const emptied = [...before.rows]
    .filter(
      ([name, n]) =>
        n > 0 &&
        (after.rows.has(name) || declared.has(name)) &&
        (after.rows.get(name) ?? 0) === 0 &&
        movedOut.get(name) !== n
    )
    .filter(([name]) => !startEmpties(name))
    .map(([name]) => name);
  if (emptied.length) {
    throw new Error(
      `A migration emptied ${emptied.join(", ")}, which the fixture had rows in`
    );
  }
  const lost = notArrived(dbPath, moved);
  if (lost.length) {
    throw new Error(lost.join("\n"));
  }
  const dangling = new Database(dbPath, { readwrite: true })
    .query<{ parent: string; rowid: number; table: string }, []>(
      "PRAGMA foreign_key_check"
    )
    .all();
  if (dangling.length) {
    throw new Error(
      `${dangling.length} row${dangling.length === 1 ? "" : "s"} name a row that is not there once the hub started: ${dangling
        .slice(0, 10)
        .map((row) => `${row.table} rowid ${row.rowid} → ${row.parent}`)
        .join("; ")}`
    );
  }
  const drift = await foreignKeyDrift(dbPath);
  if (drift.length) {
    throw new Error(
      `A migration's foreign keys don't match the schema (drizzle-kit 0.31 drops an added column's ON DELETE and ON UPDATE, drizzle-orm#5619: write the clause into the migration by hand):\n${drift.join("\n")}`
    );
  }
  // Every stored JSON row reads as its column's schema once migrated: a
  // shape changed without a migration for its rows fails here.
  const stored = new Database(dbPath, { readwrite: true });
  const { hubSecrets } = await import("../src/secret-box");
  const shapes = await storedRows(stored, (raw) => {
    try {
      return hubSecrets().open(raw);
    } catch {
      return null;
    }
  });
  stored.close();
  if (shapes.failures.length > 0) {
    throw new Error(
      `Stored JSON rows that are not their column's shape: a migration is missing.\n${storedRowsReport(shapes).join("\n")}`
    );
  }
  // Every pick a page's doc keeps reads as one once the hub started: a
  // choice's shape changed without its docs rewritten fails here.
  const choices = docChoices(dbPath);
  if (choices.failures.length > 0) {
    throw new Error(
      `Picks in page docs that are not a choice's shape: a pass over the docs is missing.\n${choices.failures.slice(0, 10).join("\n")}`
    );
  }
  // Every artifact made before titles took its title from the start's one
  // pass, the source its words came from counted; none is left untitled.
  const titles = titlesAfter(dbPath);
  const counts: Record<TitleSource, number> = { page: 0, ask: 0, name: 0 };
  const mistitled: string[] = [];
  for (const [id, expected] of untitled) {
    const title = titles.get(id);
    if (title === undefined) {
      continue;
    }
    if (title !== expected.title) {
      mistitled.push(
        `${id}: "${title}", where its ${expected.source} gives "${expected.title}"`
      );
    }
    counts[expected.source] += 1;
  }
  const empty = [...titles].filter(([, title]) => title === "");
  if (mistitled.length > 0 || empty.length > 0) {
    throw new Error(
      `Artifacts the start's title pass left wrong: ${[...mistitled, ...empty.map(([id]) => `${id}: no title`)].slice(0, 10).join("; ")}`
    );
  }
  const stepProblems = await misplacedSteps(entries);
  if (stepProblems.length) {
    throw new Error(stepProblems.join("\n"));
  }
  const unowned = await unownedColumns();
  if (unowned.length) {
    throw new Error(unowned.join("\n"));
  }
  const cases = await identityCases(dbPath, journal);
  const seeded = [...before.rows.values()].reduce((sum, n) => sum + n, 0);
  console.log(`migrations:check: ${cases.join("; ")}; ${thawed.said}`);
  console.log(
    `migrations:check: ${after.migrations - before.migrations} migration${after.migrations - before.migrations === 1 ? "" : "s"} applied over ${seeded} ${GIVEN ? "rows of the given database" : "fixture rows"}; the hub answered ${answers.join(", ")}; ${shapes.checked} stored JSON rows are their shape; ${choices.checked} picks in page docs are a choice's shape; ${titlesSaid(counts)}, none left untitled; ${((performance.now() - started) / 1000).toFixed(1)} s`
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(0);

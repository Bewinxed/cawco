/**
 * `bun run migrations:check` in packages/hub (part of the root typecheck):
 * every migration applies to a realistic database, and the hub opened on it
 * answers. The database is fixtures/realistic-db.sqlite.gz (fixture-db.ts),
 * or with `--fixture lists` fixtures/lists-db.sqlite.gz (fixture-db.ts
 * `--lists`; the package's script runs both): a seeded scratch fleet's, at
 * a published nightly's schema, so every
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
 * the live hub's own machine and network and leaves both alone. A fixture
 * is checked with the fixtures' key beside it (hub-in-process.ts
 * `writeFixtureKey`), the one its values were sealed under.
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
import { hubInProcess, writeFixtureKey } from "./hub-in-process";
import { baseRefOf } from "./openapi-inputs";
import { type Baseline, newestNightly } from "./shipped";
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
const fixtureAt = process.argv.indexOf("--fixture");
/** Which fixture: the realistic one, or `--fixture lists` (fixture-db.ts `--lists`). */
const FIXTURE_NAME =
  fixtureAt === -1 ? "realistic" : process.argv[fixtureAt + 1];
const FIXTURE = join(HUB, "fixtures", `${FIXTURE_NAME}-db.sqlite.gz`);
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
 * Migrations on main whose SQL may differ from the base's (the merge-base)
 * alone, each while the newest published nightly's journal holds no entry
 * of its tag: no database outside dev and scratch ones has applied it, and
 * those resolve it by its `when`, which stays (core migration-state.ts), so
 * its new hash refuses none of them. Once a nightly holds it, it is frozen
 * like every other, with no edit here.
 */
const UNSHIPPED_EDITS: ReadonlyMap<string, string> = new Map([
  [
    "0397_may_start_tables",
    // Not shipped in any nightly (newest 7813). A guard only: its `__types`
    // update read json_each(may_start) behind an AND, which SQLite may run
    // first on a trashed type whose may_start is not JSON; it is now inside
    // a CASE. The same rows are written for every input.
    "its `__types` update's json_each now inside a CASE; the same rows",
  ],
]);

/**
 * Why {@link UNSHIPPED_EDITS} lets `tag`'s SQL differ from `commit`'s: only
 * against a base that is not `nightly`, and only while `nightly`'s journal
 * holds no entry of `tag`. Undefined when it does not.
 */
const unshippedExcuse = (
  nightly: Baseline
): ((commit: string, tag: string) => string | undefined) => {
  const nightlyCommit = gitOut([
    "rev-parse",
    `${nightly.commit}^{commit}`,
  ])?.trim();
  const nightlyJournal = gitOut([
    "show",
    `${nightly.commit}:packages/hub/drizzle/meta/_journal.json`,
  ]);
  if (!nightlyJournal) {
    throw new Error(
      `${nightly.label} (${nightly.commit}) has no migration journal to hold the unshipped edits to`
    );
  }
  const shipped = new Set(
    JournalTags.parse(JSON.parse(nightlyJournal)).entries.map(
      (entry) => entry.tag
    )
  );
  return (commit, tag) =>
    commit !== nightlyCommit && !shipped.has(tag)
      ? UNSHIPPED_EDITS.get(tag)
      : undefined;
};

/** The commits whose journals freeze migrations here, each once with its label: the base, then `nightly`. */
const frozenBases = (nightly: Baseline): Map<string, string> => {
  const bases = new Map<string, string>();
  for (const base of [
    { label: "the base", commit: baseRefOf(process.argv) },
    nightly,
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
  return bases;
};

/**
 * A MIGRATION ON MAIN IS FROZEN. Every entry of the journal at the base (the
 * merge-base with origin/main, or `--base`) and at the newest published
 * nightly keeps its `when` here, and the entry with that `when` keeps that
 * commit's `.sql` bytes: a database records `(hash, created_at)` and nothing
 * else, so an edited or re-stamped migration reads as another one (core
 * migration-state.ts). Its tag may be renumbered. A migration found wrong
 * after it lands is fixed by a new one. The bases are the ones
 * stored-compat.ts holds the stored shapes to. The one way past it is
 * {@link UNSHIPPED_EDITS}, against the merge-base only.
 */
const editedMigrations = (
  journal: readonly JournalEntry[]
): { problems: string[]; said: string } => {
  const byWhen = new Map(journal.map((entry) => [entry.when, entry]));
  const nightly = newestNightly(HUB);
  const bases = frozenBases(nightly);
  const excused = unshippedExcuse(nightly);
  const allowed: string[] = [];
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
      if (!sqlEdited(commit, entry.tag, now.tag)) {
        continue;
      }
      const why = excused(commit, entry.tag);
      if (why) {
        allowed.push(
          `${now.tag} (${why}; in no nightly up to ${nightly.label})`
        );
        continue;
      }
      problems.push(
        `${now.tag}.sql differs from ${label}'s ${entry.tag}.sql: a migration on main keeps its bytes; fix it with a new migration`
      );
    }
  }
  const but =
    allowed.length === 0
      ? ""
      : `, but for the unshipped edit${allowed.length === 1 ? "" : "s"} ${allowed.join(", ")}`;
  return {
    problems,
    said: `every migration in ${[...bases.values()].join(" and ")} keeps its \`when\` and its SQL here${but}`,
  };
};

/** Whether `nowTag`'s SQL here differs from `tag`'s at `commit` (false when that commit has no such file). */
const sqlEdited = (commit: string, tag: string, nowTag: string): boolean => {
  const sqlThen = gitOut(["show", `${commit}:packages/hub/drizzle/${tag}.sql`]);
  return (
    sqlThen !== undefined &&
    sqlThen !== readFileSync(join(HUB, "drizzle", `${nowTag}.sql`), "utf8")
  );
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

/** A database opened as the hub opens it, in a process of its own whose hub key is the one beside `path` (secret-box.ts reads it beside CAWCO_DB_PATH, set before the hub's modules load). */
const openAsHubAlone = (path: string): void => {
  const run = Bun.spawnSync(
    [process.execPath, import.meta.path, "--open-as-hub", path],
    {
      cwd: HUB,
      env: {
        ...process.env,
        CAWCO_DB_PATH: path,
        CAWCO_NO_MDNS: "1",
        HOME: join(dirname(path), "home"),
      },
      stderr: "pipe",
      stdout: "pipe",
    }
  );
  if (run.exitCode !== 0) {
    throw new Error(
      `the hub did not open ${path}: ${run.stderr.toString().slice(-600)}`
    );
  }
};

/** Each live connection's and sign-in's stored value in `column`, by its row, of the database at `path`. */
const sealedValues = (
  path: string,
  connections: string,
  pending: string
): Map<string, string> => {
  const sqlite = new Database(path, { readwrite: true });
  const rows = sqlite
    .query<{ key: string; value: string }, []>(
      `SELECT 'connection ' || id AS key, ${connections} AS value FROM connections WHERE ${connections} IS NOT NULL UNION ALL SELECT 'sign-in ' || name, ${pending} FROM fleet_mcp_oauth WHERE ${pending} IS NOT NULL`
    )
    .all();
  sqlite.close();
  return new Map(rows.map((row) => [row.key, row.value]));
};

/**
 * KEY ABSENT, THEN RESTORED, on a scratch copy of the fixture before 0420
 * (db/sealed-facts-unread.ts): opened as the hub opens it with no key file
 * beside it, every sealed connection and sign-in under way is kept as
 * stored, byte for byte, in `sealed_unread` or `pending_unread`, none
 * deleted, and the hub opens; opened again with the fixtures' key put back,
 * the start's read again places exactly what reads with that key, as 0420
 * places it with the key there from the start. One line.
 */
const keyCase = async (): Promise<string> => {
  const dir = join(scratch, "case-key");
  mkdirSync(join(dir, "home"), { recursive: true });
  const path = join(dir, "hub.db");
  await Bun.write(
    path,
    Bun.gunzipSync(new Uint8Array(await Bun.file(FIXTURE).arrayBuffer()))
  );
  const probe = new Database(path, { readwrite: true });
  const holds =
    probe
      .query<{ there: number }, []>(
        "SELECT (SELECT count(*) FROM pragma_table_info('connections') WHERE name = 'sealed') + (SELECT count(*) FROM pragma_table_info('fleet_mcp_oauth') WHERE name = 'pending') + (SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'config_trash') AS there"
      )
      .get()?.there === 3;
  probe.close();
  if (!holds) {
    return `case key absent, then restored: the ${FIXTURE_NAME} fixture's schema is before connections' sealed values, so nothing is sealed to keep; the lists fixture runs it`;
  }
  const { hubSecrets, isSealed } = await import("../src/secret-box");
  const { sealedFactsKept } = await import("../src/db/sealed-facts-unread");
  const stored = sealedValues(path, "sealed", "pending");
  const sealed = [...stored].filter(([, value]) => isSealed(value));
  // What 0420 places with the fixtures' key there from the start: the key
  // this process's hub holds (writeFixtureKey, beside its database).
  const before = new Database(path, { readwrite: true });
  const reads = sealedFactsKept(before, hubSecrets, "migration");
  before.close();
  const readsWhole = new Set(
    [
      ...reads.connections.flatMap((one) =>
        one.trash === undefined && one.reading.kind === "placed"
          ? [`connection ${one.id}`]
          : []
      ),
      ...reads.pending.flatMap((one) =>
        one.trash === undefined && one.reading.kind === "placed"
          ? [`sign-in ${one.id}`]
          : []
      ),
    ].filter((key) => isSealed(stored.get(key) ?? ""))
  );
  openAsHubAlone(path);
  const kept = sealedValues(path, "sealed_unread", "pending_unread");
  const lost = sealed.filter(([key, value]) => kept.get(key) !== value);
  if (lost.length > 0) {
    throw new Error(
      `case key absent: ${lost.map(([key]) => key).join(", ")} not kept as stored with no key`
    );
  }
  rmSync(join(dir, "secrets.key"), { force: true });
  writeFixtureKey(dir);
  openAsHubAlone(path);
  const still = sealedValues(path, "sealed_unread", "pending_unread");
  const placed = sealed.filter(([key]) => !still.has(key)).map(([key]) => key);
  const wrong = [
    ...placed.filter((key) => !readsWhole.has(key)),
    ...[...readsWhole].filter((key) => still.has(key)),
  ];
  if (wrong.length > 0) {
    throw new Error(
      `case key restored: ${wrong.join(", ")} placed otherwise than with the key there from the start`
    );
  }
  const of = (keys: string[], kind: string) =>
    keys.filter((key) => key.startsWith(kind)).length;
  const sealedKeys = sealed.map(([key]) => key);
  return `case key absent, then restored: ${sealed.length} sealed value(s) (${of(sealedKeys, "connection")} connection(s), ${of(sealedKeys, "sign-in")} sign-in(s)) kept as stored with no key, none deleted or rewritten, the hub opened; with the fixtures' key back, ${of(placed, "connection")} connection(s) and ${of(placed, "sign-in")} sign-in(s) placed at the next start, ${sealed.length - placed.length} still not read, as with the key there from the start`;
};

/** The project the restore case forgets: the lists fixture's, whose tasks, tracker links and move hold the moved columns. */
const RESTORED = "proj-00001-8ibdf7";

/** Each server the restore case seeds for {@link RESTORED}, by name, with its `platforms` as 0406 reads it. */
const SEEDED_SERVERS = [
  { name: "restore-every-platform", platforms: null },
  { name: "restore-darwin-linux", platforms: '["darwin","linux"]' },
  { name: "restore-unread-platforms", platforms: "linux and darwin" },
] as const;

/** A project's rows as a forget records them (db forget.ts `ProjectRows`'s tables). */
interface TablesKept {
  columns: string[];
  rows: unknown[][];
  table: string;
}

/**
 * A database opened as a hub's start opens it: its migrations, then the
 * steps that run once the store is up (db/index.ts `make`).
 */
const openWhole = async (path: string): Promise<void> => {
  const { drizzle } = await import("drizzle-orm/bun-sqlite");
  const { applyMigrations, runOpenedSteps } = await import("../src/db/migrate");
  const db = drizzle(path);
  try {
    await applyMigrations(db, db.$client, path);
    runOpenedSteps(db);
  } finally {
    db.$client.close();
  }
};

/**
 * Each table's rows as text, sorted, a sealed value opened with this
 * process's hub key: two databases holding the same rows read the same,
 * whatever nonce sealed them.
 */
const rowsText = async (
  tables: readonly TablesKept[]
): Promise<Map<string, string[]>> => {
  const { hubSecrets, isSealed } = await import("../src/secret-box");
  const opened = (value: unknown) =>
    typeof value === "string" && isSealed(value)
      ? { opened: hubSecrets().open(value) }
      : value;
  return new Map(
    tables.map((kept) => [
      kept.table,
      kept.rows
        .map((row) =>
          JSON.stringify(
            Object.fromEntries(
              kept.columns.map((column, index) => [column, opened(row[index])])
            )
          )
        )
        .toSorted(),
    ])
  );
};

/** Each of `from`'s rows `than` does not hold, by table, a row held twice counted twice. */
const rowsBeyond = (
  from: Map<string, string[]>,
  than: Map<string, string[]>
): [string, string][] =>
  [...from].flatMap(([table, texts]) => {
    const unmatched = [...(than.get(table) ?? [])];
    return texts.flatMap((text): [string, string][] => {
      const found = unmatched.indexOf(text);
      if (found < 0) {
        return [[table, text]];
      }
      unmatched.splice(found, 1);
      return [];
    });
  });

/**
 * The lists fixture unpacked twice at its base schema, {@link SEEDED_SERVERS}
 * seeded in both for {@link RESTORED}: `forgotten`, where it is forgotten,
 * and `stayed`, where it stays. Undefined: the fixture's schema is past the
 * moved columns, or holds no such project.
 */
const seededCopies = async (dir: string) => {
  const forgotten = join(dir, "forgotten.db");
  const stayed = join(dir, "stayed.db");
  await Bun.write(
    forgotten,
    Bun.gunzipSync(new Uint8Array(await Bun.file(FIXTURE).arrayBuffer()))
  );
  const base = new Database(forgotten, { readwrite: true });
  try {
    const fits =
      base
        .query<{ there: number }, [string]>(
          "SELECT (SELECT count(*) FROM pragma_table_info('mcp_servers') WHERE name = 'platforms') + (SELECT count(*) FROM pragma_table_info('moves') WHERE name = 'state') + (SELECT count(*) FROM projects WHERE id = ?1) AS there"
        )
        .get(RESTORED)?.there === 3;
    const config = base
      .query<{ config: string }, []>(
        "SELECT config FROM mcp_servers WHERE project_id IS NOT NULL LIMIT 1"
      )
      .get()?.config;
    if (!(fits && config)) {
      return;
    }
    for (const server of SEEDED_SERVERS) {
      base.run(
        "INSERT INTO mcp_servers (name, config, scope, project_id, platforms, created_at) VALUES (?, ?, 'local', ?, ?, ?)",
        [server.name, config, RESTORED, server.platforms, Date.now()]
      );
    }
    const entries = journalEntries(join(HUB, "drizzle"));
    const { pending } = migrationState(appliedRows(base), entries);
    base.run(`VACUUM INTO '${stayed.replaceAll("'", "''")}'`);
    return {
      forgotten,
      stayed,
      baseTag: entries.filter((entry) => !pending.includes(entry)).at(-1)?.tag,
    };
  } finally {
    base.close();
  }
};

/** {@link RESTORED} forgotten on the database at `path` by today's forget (db forget.ts), at that database's schema: its record. */
const forgottenAt = async (path: string) => {
  const { drizzle } = await import("drizzle-orm/bun-sqlite");
  const { forgetDb, schemaTables } = await import("../src/db/forget");
  const { artifactEvents } = await import("../src/db/artifacts");
  const db = drizzle(path);
  // As the hub's connection holds them (db/migrate.ts): a forget cascades.
  db.$client.run("PRAGMA foreign_keys = ON");
  const marks: AppliedRow[][] = [];
  const kept = forgetDb(
    db,
    artifactEvents(db).dropArtifacts,
    await schemaTables()
  ).forget(RESTORED, (_kept, applied) => {
    marks.push(applied);
  });
  db.$client.close();
  const [migrations] = marks;
  if (!(kept && migrations)) {
    throw new Error(`case restore: ${RESTORED} was not forgotten`);
  }
  return { rows: kept, migrations };
};

/**
 * The record's rows at today's schema (db restore-schema.ts), at the schema
 * it names; and the entry its columns alone place it at, which must bring
 * the same rows.
 */
const migratedRecord = async (
  record: Awaited<ReturnType<typeof forgottenAt>>
) => {
  const { migratedRows, recordSchema } =
    await import("../src/db/restore-schema");
  const marked = recordSchema(record.rows, record.migrations);
  const found = recordSchema(record.rows, undefined);
  if (!(marked.ok && found.ok && typeof found.found === "object")) {
    throw new Error(
      `case restore: the record's schema was not placed: ${JSON.stringify(marked.ok ? found : marked)}`
    );
  }
  const migrated = await migratedRows(RESTORED, record.rows, marked.journal);
  const byColumns = await migratedRows(RESTORED, record.rows, found.journal);
  if (!(migrated.ok && byColumns.ok)) {
    throw new Error(
      `case restore: the record's rows did not go in at its schema: ${JSON.stringify(migrated.ok ? byColumns : migrated)}`
    );
  }
  const atNamed = await rowsText(migrated.tables);
  const atFound = await rowsText(byColumns.tables);
  const differ = [
    ...rowsBeyond(atNamed, atFound),
    ...rowsBeyond(atFound, atNamed),
  ];
  if (differ.length > 0) {
    throw new Error(
      `case restore: the record placed by its columns at ${found.found.tag} brings other rows than at the schema it names: ${differ
        .slice(0, 5)
        .map(([table, text]) => `${table} ${text.slice(0, 200)}`)
        .join("; ")}`
    );
  }
  return { tables: migrated.tables, foundTag: found.found.tag };
};

/** {@link RESTORED}'s rows on the database at `path`, as a forget would record them, as text ({@link rowsText}). */
const rowsOn = async (path: string): Promise<Map<string, string[]>> => {
  const { drizzle } = await import("drizzle-orm/bun-sqlite");
  const { projectRowsAt } = await import("../src/db/forget");
  const db = drizzle(path);
  try {
    return await rowsText(projectRowsAt(db, RESTORED));
  } finally {
    db.$client.close();
  }
};

/** The rows `migrated` restored onto the database at `path` (db forget.ts `restore`), its cut links from `record`. */
const restoredOn = async (
  path: string,
  migrated: TablesKept[],
  record: Awaited<ReturnType<typeof forgottenAt>>
) => {
  const { drizzle } = await import("drizzle-orm/bun-sqlite");
  const { forgetDb, schemaTables } = await import("../src/db/forget");
  const { artifactEvents } = await import("../src/db/artifacts");
  const { ProjectRowsSchema } = await import("../src/db/forget");
  const db = drizzle(path);
  db.$client.run("PRAGMA foreign_keys = ON");
  try {
    const restored = forgetDb(
      db,
      artifactEvents(db).dropArtifacts,
      await schemaTables()
    ).restore(
      RESTORED,
      ProjectRowsSchema.parse({
        tables: migrated,
        unlinked: record.rows.unlinked,
      })
    );
    if (!restored.ok) {
      throw new Error(
        `case restore: not restored: ${JSON.stringify(restored)}`
      );
    }
    return restored;
  } finally {
    db.$client.close();
  }
};

/** The value `column` holds in `table`'s row named `name`, of `rows` ({@link rowsText}). */
const valueIn = (
  rows: Map<string, string[]>,
  table: string,
  name: string,
  column: string
): unknown =>
  (rows.get(table) ?? [])
    .map((text) => z.record(z.string(), z.unknown()).parse(JSON.parse(text)))
    .find((row) => row.name === name)?.[column];

/**
 * A FORGOTTEN PROJECT RESTORED ACROSS MIGRATIONS, on scratch copies of the
 * lists fixture at its base schema (db/restore-schema.ts, db/forget.ts):
 * {@link RESTORED}, its tasks' outputs (0404), tracker links' baselines
 * (0407) and move's state (0415) as the fixture seeded them, and three MCP
 * servers seeded for it, their platforms null, set, and not readable (0406),
 * is forgotten at the base schema by today's forget; the copy is opened as
 * a hub (every migration since), and the record restored onto it. A second
 * copy, where the project stayed, opened the same way, is how the
 * migrations place its rows on a live hub: the restored project holds
 * exactly those rows, but the ones held back, each of them a value a
 * migration kept as not read or a row hanging off one, named with why. The
 * record's schema found from its columns alone (a record made before
 * records named their migrations) brings the same rows. One line.
 */
const restoreCase = async (): Promise<string> => {
  const dir = join(scratch, "case-restore");
  mkdirSync(dir, { recursive: true });
  const copies = await seededCopies(dir);
  if (!copies) {
    return `case restore across migrations: the ${FIXTURE_NAME} fixture's schema is past the moved columns or has no ${RESTORED}; the lists fixture runs it`;
  }
  const record = await forgottenAt(copies.forgotten);
  await openWhole(copies.forgotten);
  await openWhole(copies.stayed);
  const { tables, foundTag } = await migratedRecord(record);
  const restored = await restoredOn(copies.forgotten, tables, record);
  const after = await rowsOn(copies.forgotten);
  const placed = await rowsOn(copies.stayed);
  const added = rowsBeyond(after, placed);
  if (added.length > 0) {
    throw new Error(
      `case restore: the restore put back rows the migrations do not place: ${added
        .slice(0, 5)
        .map(([table, text]) => `${table} ${text.slice(0, 200)}`)
        .join("; ")}`
    );
  }
  const { projectTrashWords } = await import("@cawco/core/words/project-trash");
  const { held } = restored;
  const missed = rowsBeyond(placed, after);
  const unexplained = held.filter(
    (one) => one.why.kind !== "unread" && one.why.kind !== "depends"
  );
  if (unexplained.length > 0 || missed.length !== held.length) {
    throw new Error(
      `case restore: ${missed.length} row(s) the migrations place did not come back and ${held.length} were held back, ${unexplained.length} of them for a reason no migration gave: ${[...unexplained.map(projectTrashWords.heldRow), ...missed.slice(0, 5).map(([table, text]) => `${table} ${text.slice(0, 160)}`)].join("; ")}`
    );
  }
  const unread = held.find(
    (one) =>
      one.table === "mcp_servers" && one.id === "restore-unread-platforms"
  );
  if (!unread) {
    throw new Error(
      "case restore: the server whose platforms do not read was not held back"
    );
  }
  if (
    valueIn(
      after,
      "mcp_servers",
      "restore-every-platform",
      "every_platform"
    ) !== 1 ||
    valueIn(after, "mcp_servers", "restore-darwin-linux", "every_platform") !==
      0
  ) {
    throw new Error(
      "case restore: a server's null platforms did not come back as every platform, or its set ones as some"
    );
  }
  const count = (table: string) => after.get(table)?.length ?? 0;
  const back = Object.values(restored.back).reduce((sum, n) => sum + n, 0);
  const of = (kind: string) =>
    held.filter((one) => one.why.kind === kind).length;
  return `case restore across migrations: ${RESTORED} forgotten at ${copies.baseTag}, its schema the record names and, found from its columns alone, ${foundTag}, bringing the same rows; restored on today's schema: ${back} rows back in ${Object.keys(restored.back).length} tables, each as the migrations place it on a hub where it stayed (${count("mcp_server_platforms")} server platform rows, ${count("project_task_outputs")} task outputs, ${count("tracker_link_synced_labels")} tracker labels, ${count("moves")} moves), ${held.length} held back and named (${of("unread")} kept as not read, ${of("depends")} hanging off one), as "${projectTrashWords.heldRow(unread)}"`;
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

const opening = process.argv.indexOf("--open-as-hub");
if (opening !== -1) {
  // {@link openAsHubAlone}'s own process: the database opened, nothing else.
  try {
    await openAsHub(process.argv[opening + 1] ?? "");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  process.exit(0);
}

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
    // The key the fixture's hub sealed its values under, beside it.
    writeFixtureKey(scratch);
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
  // Every stored row (JSON, or a closed set of text) reads as its column's schema once migrated: a
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
      `Stored rows that are not their column's shape: a migration is missing.\n${storedRowsReport(shapes).join("\n")}`
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
  if (!GIVEN) {
    cases.push(await keyCase());
    cases.push(await restoreCase());
  }
  const seeded = [...before.rows.values()].reduce((sum, n) => sum + n, 0);
  console.log(`migrations:check: ${cases.join("; ")}; ${thawed.said}`);
  console.log(
    `migrations:check: ${after.migrations - before.migrations} migration${after.migrations - before.migrations === 1 ? "" : "s"} applied over ${seeded} ${GIVEN ? "rows of the given database" : `${FIXTURE_NAME} fixture rows`}; the hub answered ${answers.join(", ")}; ${shapes.checked} stored rows in ${shapes.columns} columns (${shapes.sets} of them closed sets of text) are their shape; ${choices.checked} picks in page docs are a choice's shape; ${titlesSaid(counts)}, none left untitled; ${((performance.now() - started) / 1000).toFixed(1)} s`
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(0);

/**
 * `bun run migrations:check` in packages/hub (part of the root typecheck):
 * every migration applies to a realistic database, and the hub opened on it
 * answers. The database is fixtures/realistic-db.sqlite.gz (fixture-db.ts):
 * a seeded scratch fleet's, at a published nightly's schema, so every
 * migration added since runs over real row shapes, as it will on a hub
 * updating from that nightly. A table the fixture had rows in must still
 * have rows: a migration that empties one is caught here, and one that drops
 * a table the schema still declares. A table the schema no longer declares
 * may be dropped, its rows with it. Every foreign key
 * the schema declares stands in the migrated database with the same
 * ON DELETE and ON UPDATE ({@link foreignKeyDrift}). The journal's `when`
 * increases strictly with idx ({@link outOfOrder}). Once the hub has
 * started, no row names a row that is not there (`PRAGMA
 * foreign_key_check`): a hub that kept a port for a project no longer there
 * died at every start (nightly 4627).
 *
 * `--db <path>`: the same over a copy of that database instead (a live
 * hub's, or a copy of one), taken by `VACUUM INTO`; the given file is never
 * written: hub start-up and migrations are proven on a copy of the live
 * database before landing.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { hubInProcess } from "./hub-in-process";
import { storedRows, storedRowsReport } from "./stored-rows";

const started = performance.now();
const HUB = resolve(import.meta.dir, "..");
const FIXTURE = join(HUB, "fixtures", "realistic-db.sqlite.gz");
const at = process.argv.indexOf("--db");
/** A database to check instead of the fixture, copied first; undefined: the fixture. */
const GIVEN = at === -1 ? undefined : process.argv[at + 1];
const scratch = mkdtempSync(join(tmpdir(), "cawco-migrations-"));

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
  const applied = new Set(
    rows.get("__drizzle_migrations")
      ? sqlite
          .query<{ at: number }, []>(
            "SELECT created_at AS at FROM __drizzle_migrations"
          )
          .all()
          .map((row) => Number(row.at))
      : []
  );
  sqlite.close();
  return {
    rows,
    applied,
    migrations: rows.get("__drizzle_migrations") ?? 0,
  };
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
  } else {
    await Bun.write(
      dbPath,
      Bun.gunzipSync(new Uint8Array(await Bun.file(FIXTURE).arrayBuffer()))
    );
  }
  const before = read(dbPath);
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
  await answer(`/api/projects/${project}/threads`);
  lifetime.close();
  const after = read(dbPath);
  const journal = entries.length;
  // A given database is a live hub's: drizzle applies only what is newer
  // than the newest it records, so that is what must be recorded after.
  const newest = Math.max(0, ...before.applied);
  const unapplied = entries.filter(
    (entry) => entry.when > newest && !after.applied.has(entry.when)
  );
  if (GIVEN && unapplied.length) {
    throw new Error(
      `The database records none of ${unapplied.map((entry) => entry.tag).join(", ")}, newer than its newest before`
    );
  }
  if (!GIVEN && after.migrations !== journal) {
    throw new Error(
      `The database records ${after.migrations} migrations; this commit has ${journal}`
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
  const emptied = [...before.rows]
    .filter(
      ([name, n]) =>
        n > 0 &&
        (after.rows.has(name) || declared.has(name)) &&
        (after.rows.get(name) ?? 0) === 0
    )
    .filter(([name]) => !startEmpties(name))
    .map(([name]) => name);
  if (emptied.length) {
    throw new Error(
      `A migration emptied ${emptied.join(", ")}, which the fixture had rows in`
    );
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
  // A given database's sealed values open with its own hub's key, read where
  // it lies and never made; the fixture's with the scratch hub's.
  const { hubSecrets, makeSecretBox } = await import("../src/secret-box");
  const givenKey = GIVEN && join(dirname(resolve(GIVEN)), "secrets.key");
  const box =
    givenKey && existsSync(givenKey) ? makeSecretBox(givenKey) : hubSecrets();
  const shapes = await storedRows(stored, (raw) => {
    try {
      return box.open(raw);
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
  const seeded = [...before.rows.values()].reduce((sum, n) => sum + n, 0);
  console.log(
    `migrations:check: ${after.migrations - before.migrations} migration${after.migrations - before.migrations === 1 ? "" : "s"} applied over ${seeded} ${GIVEN ? "rows of the given database" : "fixture rows"}; the hub answered ${answers.join(", ")}; ${shapes.checked} stored JSON rows are their shape; ${((performance.now() - started) / 1000).toFixed(1)} s`
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(0);

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
 * increases strictly with idx ({@link outOfOrder}). No check constraint
 * names a column through its table ({@link qualifiedChecks}). Once the hub has
 * started, no row names a row that is not there (`PRAGMA
 * foreign_key_check`): a hub that kept a port for a project no longer there
 * died at every start (nightly 4627).
 *
 * `--db <path>`: the same over a copy of that database instead (a live
 * hub's, or a copy of one), taken by `VACUUM INTO`; the given file is never
 * written: hub start-up and migrations are proven on a copy of the live
 * database before landing. Its hub's `secrets.key` is copied beside the copy,
 * so its sealed values open as they do on that hub.
 */
import { Database } from "bun:sqlite";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
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
    // (admin-asks.ts `boot`: its session had ended), which says so.
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
  } else {
    await Bun.write(
      dbPath,
      Bun.gunzipSync(new Uint8Array(await Bun.file(FIXTURE).arrayBuffer()))
    );
  }
  const before = read(dbPath);
  // A move runs on this database when its migration is newer than the
  // newest the database records, as drizzle applies it.
  const whenOf = new Map(entries.map((entry) => [entry.tag, entry.when]));
  const newestBefore = Math.max(0, ...before.applied);
  const moved = moving(
    dbPath,
    (migration) => (whenOf.get(migration) ?? 0) > newestBefore
  );
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
  const unapplied = entries.filter(
    (entry) => entry.when > newestBefore && !after.applied.has(entry.when)
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
  const seeded = [...before.rows.values()].reduce((sum, n) => sum + n, 0);
  console.log(
    `migrations:check: ${after.migrations - before.migrations} migration${after.migrations - before.migrations === 1 ? "" : "s"} applied over ${seeded} ${GIVEN ? "rows of the given database" : "fixture rows"}; the hub answered ${answers.join(", ")}; ${shapes.checked} stored JSON rows are their shape; ${((performance.now() - started) / 1000).toFixed(1)} s`
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(0);

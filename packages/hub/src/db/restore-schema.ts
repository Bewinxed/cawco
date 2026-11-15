/**
 * A forgotten project's record brought to today's schema before any row of
 * it goes back (db forget.ts `restore`, project-trash.ts): the rows a
 * record keeps are its tables' rows as they stood when it was made, and
 * every migration since, its code steps with it, places them as it placed
 * the live database's.
 *
 * 1. The record's schema. A record names the migrations its hub had applied
 *    when it was made (`migrations`, as `__drizzle_migrations` records
 *    them), each found in this build's journal by identity (core
 *    migration-state.ts). A record made before it named them is placed by
 *    its own tables: the newest journal entry whose snapshot
 *    (`drizzle/meta/NNNN_snapshot.json`) holds exactly each recorded
 *    table's recorded columns ({@link recordSchema}). Several fit only when
 *    nothing told them apart for these tables: each table's snapshot the
 *    same, and no migration between them naming one of them in its SQL,
 *    since that one would write their rows. Else, as when none fits, the
 *    record is not placed and nothing of it goes back.
 * 2. A scratch database at that schema: the journal up to it applied by the
 *    hub's own migrator (db/migrate.ts `migrateTo`), its code steps with it,
 *    and the record's rows inserted there as they are, which is right at
 *    that schema.
 * 3. The migrator from there to this build's newest, as a hub's start runs
 *    it (`applyMigrations`, then `runOpenedSteps`): every SQL migration and
 *    every code step, the same functions.
 * 4. The project's rows read out of it as a forget today would read them
 *    (forget.ts `projectRowsAt`), for the live database's typed insert.
 *
 * The scratch database lives in its own folder under the system's temporary
 * one, gone when the restore is.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AppliedRow,
  type JournalEntry,
  journalEntries,
  MIGRATIONS_DIR,
  migrationState,
} from "@cawco/core/migration-state";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { z } from "zod";
import { type ProjectRows, projectRowsAt, sqliteValue } from "./forget";
import { applyMigrations, migrateTo, runOpenedSteps } from "./migrate";

/** The migrations a record's hub had applied when it was made, as `__drizzle_migrations` records each. */
export const RecordMigrationsSchema = z.array(
  z.object({ hash: z.string(), createdAt: z.number() }).strict()
);

/** Where a record's rows stand: the journal entries its hub had applied, or why that can't be told. */
export type RecordSchema =
  | {
      ok: true;
      /** The entries applied, in journal order. */
      journal: JournalEntry[];
      /** `marked`: the record names them; else the entry its columns placed it at. */
      found: "marked" | { tag: string };
    }
  /** The record names migrations this build does not have: a newer build made it. */
  | { ok: false; why: "newer"; unknown: AppliedRow[] }
  /** No entry's snapshot holds the record's tables with their columns. */
  | { ok: false; why: "none" }
  /** Several entries hold them, and something tells them apart for these tables. */
  | { ok: false; why: "several"; tags: string[] };

/** A snapshot's tables, each read whole: its columns by name, the rest as drizzle-kit wrote it. */
const SnapshotSchema = z.object({
  tables: z.record(
    z.string(),
    z.object({ columns: z.record(z.string(), z.unknown()) }).loose()
  ),
});

/** Entry `idx`'s snapshot's tables; undefined where drizzle-kit kept none (some of the earliest). */
const snapshotOf = (idx: number) => {
  const path = join(
    MIGRATIONS_DIR,
    "meta",
    `${String(idx).padStart(4, "0")}_snapshot.json`
  );
  return existsSync(path)
    ? SnapshotSchema.parse(JSON.parse(readFileSync(path, "utf8"))).tables
    : undefined;
};

/** A snapshot's value as text with every object's keys sorted: two snapshots that hold the same read the same, whatever order drizzle-kit or a hand wrote them in. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, held: unknown) =>
    held !== null && typeof held === "object" && !Array.isArray(held)
      ? Object.fromEntries(
          Object.entries(held).toSorted(([a], [b]) => a.localeCompare(b))
        )
      : held
  );

/** An identifier as SQL quotes it. */
const quoted = (identifier: string): string =>
  `"${identifier.replaceAll('"', '""')}"`;

/** Whether the SQL names `table`, as a word of its own. */
const names = (text: string, table: string): boolean =>
  new RegExp(`(^|[^\\w])${RegExp.escape(table)}([^\\w]|$)`, "u").test(text);

/**
 * The schema `rows` stand at: `migrations` resolved against this build's
 * journal, or, for a record made before records named them, the newest
 * entry whose snapshot holds each recorded table with exactly its recorded
 * columns, when nothing tells the entries that fit apart for those tables
 * (as above).
 */
export const recordSchema = (
  rows: ProjectRows,
  migrations: readonly AppliedRow[] | undefined
): RecordSchema => {
  const journal = journalEntries();
  if (migrations) {
    const { pending, unknown } = migrationState(migrations, journal);
    if (unknown.length > 0) {
      return { ok: false, why: "newer", unknown };
    }
    return {
      ok: true,
      journal: journal.filter((entry) => !pending.includes(entry)),
      found: "marked",
    };
  }
  const recorded = rows.tables.map((kept) => ({
    table: kept.table,
    columns: new Set(kept.columns),
  }));
  /** Each entry with a snapshot, and whether it fits; the recorded tables' definitions where it does. */
  const read = journal.flatMap((entry) => {
    const tables = snapshotOf(entry.idx);
    if (!tables) {
      return [];
    }
    const fits = recorded.every(({ table, columns }) => {
      const has = Object.keys(tables[table]?.columns ?? {});
      return (
        has.length === columns.size &&
        has.every((column) => columns.has(column))
      );
    });
    return [
      {
        entry,
        fits,
        shape: fits
          ? canonical(recorded.map(({ table }) => tables[table]))
          : "",
      },
    ];
  });
  const fit = read.filter((one) => one.fits);
  const oldest = fit.at(0);
  const newest = fit.at(-1);
  if (!(oldest && newest)) {
    return { ok: false, why: "none" };
  }
  const between = journal.filter(
    (entry) => entry.idx > oldest.entry.idx && entry.idx <= newest.entry.idx
  );
  const apart =
    fit.some((one) => one.shape !== newest.shape) ||
    read.some(
      (one) =>
        !one.fits &&
        one.entry.idx > oldest.entry.idx &&
        one.entry.idx < newest.entry.idx
    ) ||
    between.some((entry) => {
      const text = readFileSync(
        join(MIGRATIONS_DIR, `${entry.tag}.sql`),
        "utf8"
      );
      return recorded.some(({ table }) => names(text, table));
    });
  if (apart) {
    return {
      ok: false,
      why: "several",
      tags: fit.map((one) => one.entry.tag),
    };
  }
  return {
    ok: true,
    journal: journal.filter((entry) => entry.idx <= newest.entry.idx),
    found: { tag: newest.entry.tag },
  };
};

/** Project `id`'s rows at today's schema, or the recorded column its record's schema does not have. */
export type MigratedRows =
  { ok: true; tables: ProjectRows["tables"] } | { ok: false; missing: string };

/**
 * `rows` brought from `journal` (the record's schema, {@link recordSchema})
 * to this build's newest on a scratch database, and project `id`'s rows read
 * out of it (as above). A migration that throws on them throws here, and
 * nothing of the record goes back.
 */
export const migratedRows = async (
  id: string,
  rows: ProjectRows,
  journal: readonly JournalEntry[]
): Promise<MigratedRows> => {
  const dir = mkdtempSync(join(tmpdir(), "cawco-restore-"));
  const path = join(dir, "record.db");
  const db = drizzle(path);
  try {
    await migrateTo(db, db.$client, path, journal);
    // Rows go in as the record keeps them, naming rows the live database
    // holds (its sessions, its accounts): no key is checked here.
    db.$client.run("PRAGMA foreign_keys = OFF");
    for (const kept of rows.tables) {
      const columns = new Map(
        db.$client
          .query<{ hidden: number; name: string }, [string]>(
            "SELECT name, hidden FROM pragma_table_xinfo(?)"
          )
          .all(kept.table)
          .map((column) => [column.name, column.hidden])
      );
      const missing = kept.columns.find((column) => !columns.has(column));
      if (missing !== undefined) {
        return { ok: false, missing: `${kept.table}.${missing}` };
      }
      // A generated column is made again from what it is generated from.
      const used = kept.columns.flatMap((column, at) =>
        columns.get(column) === 0 ? [{ column, at }] : []
      );
      const insert = db.$client.query(
        `INSERT INTO ${quoted(kept.table)} (${used.map((one) => quoted(one.column)).join(", ")}) VALUES (${used.map(() => "?").join(", ")})`
      );
      for (const row of kept.rows) {
        insert.run(...used.map((one) => sqliteValue(row[one.at])));
      }
    }
    await applyMigrations(db, db.$client, path);
    runOpenedSteps(db);
    return { ok: true, tables: projectRowsAt(db, id) };
  } finally {
    db.$client.close();
    rmSync(dir, { recursive: true, force: true });
  }
};

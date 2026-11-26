/**
 * A project forgotten, and brought back (project-trash.ts, server.ts
 * `DELETE /api/projects/:id` and `POST /api/projects/:id/restore`).
 *
 * A forget deletes what it always deleted: the project's row, which its
 * foreign keys cascade through every table scoped to it (and on through
 * theirs) and unlink from the rows that outlive it (`ON DELETE SET NULL`:
 * its sessions, its other artifacts), plus what no key ties to it (its
 * queued task starts, where its rules stood with each session, the memory
 * documents scoped to it alone, its pages). Before that delete, in the same
 * transaction, every row it is about to take and every link it is about to
 * cut is read, by walking the database's own foreign keys
 * (`pragma_foreign_key_list`) out from those roots, so a table that gains a
 * key to a project tomorrow is kept with no change here. The rows go to the
 * caller's `keep` (which writes them beside the project's folder in the
 * trash) before anything is deleted; afterwards each table's count is held
 * to what was read, and a delete that took a row the walk did not read
 * throws, keeping the project whole.
 *
 * A restore takes the record's rows as today's schema holds them: brought
 * through every migration since the record was made, on a scratch database
 * (restore-schema.ts), and read there as a forget today would read them
 * ({@link projectRowsAt}). Each goes back through drizzle's typed insert on
 * its schema table, so every column's own read and write check runs on it
 * (stored-json.ts), with the foreign keys deferred to the commit, so the
 * order rows go back in does not matter. A row held back is named, with
 * why, and so is every row that hangs off it by a foreign key:
 *
 * - a value a migration kept as not read (an `*_unread` column set);
 * - a value that is not its column's shape, or one the database's own
 *   constraints do not take;
 * - a key another row made since holds (that one stays);
 * - something it names that went since (a session, an account), treated as
 *   that thing's delete would have treated it: its link set to null where
 *   the key says so, else the row stays out;
 * - a machine no longer in the fleet, for a row that goes with its machine
 *   (owned-rows.ts `GO_WITH_MACHINE`, a project's places among them): no
 *   foreign key holds it to its machine, so it is checked here, and a try
 *   again once the machine has joined again puts it back.
 *
 * Each cut link is set again where it still reads null and the row it
 * names stands; one naming a row held back waits with it. A project whose
 * own row is held back does not come back at all.
 *
 * The rows held back, as today's schema holds them, and the links waiting
 * on them, are the restore's `kept`: the trash lists them under the project
 * (project-trash.ts), and a try again ({@link ForgetDb.retry}) puts them
 * back the same way, once they are brought through every migration since
 * from the schema they were kept at (restore-schema.ts, read out by
 * {@link heldRowsAt}): what goes back is no longer kept, what is held back
 * again is, named again with why.
 */
import type { Database } from "bun:sqlite";
import type {
  RestoreHeldRow,
  RestoreHeldWhy,
} from "@cawco/core/forgotten-project";
import { type AppliedRow, appliedRows } from "@cawco/core/migration-state";
import {
  and,
  eq,
  getTableColumns,
  getTableName,
  is,
  type SQL,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { isStoredShapeError, primaryKeyOf } from "../stored-json";
import { type Deleter, projectPage } from "./artifacts";
import { GO_WITH_MACHINE } from "./owned-rows";
import { HUB_PLACE_MACHINE } from "./projects";
import { agents, artifacts, removedMachines } from "./schema";
import type { Tx } from "./tx";

/** A value as the record keeps it: SQLite's text, numbers and nulls as they are, a blob as base64. */
const CellSchema = z.union([
  z.string(),
  z.number(),
  z.null(),
  z.object({ bytes: z.string() }).strict(),
]);
type Cell = z.infer<typeof CellSchema>;

const IDENTIFIER = z.string().min(1);

/** Every row a forget took and every link it cut: what a restore puts back. */
export const ProjectRowsSchema = z.object({
  /** Each table's rows the forget deleted, its columns named once. */
  tables: z.array(
    z.object({
      table: IDENTIFIER,
      columns: z.array(IDENTIFIER),
      rows: z.array(z.array(CellSchema)),
    })
  ),
  /**
   * The rows that outlived it with their link to it cut: each row's key
   * (`key`'s columns, `rowid` for a table with no key of its own), then the
   * values `columns` held before the cut.
   */
  unlinked: z.array(
    z.object({
      table: IDENTIFIER,
      key: z.array(IDENTIFIER),
      columns: z.array(IDENTIFIER),
      rows: z.array(z.array(CellSchema)),
    })
  ),
});
export type ProjectRows = z.infer<typeof ProjectRowsSchema>;

/** By table: how many rows each outcome counted. */
type Counts = Record<string, number>;

/** What a restore, or a try again of the rows it held back, put back. */
export interface RowsPut {
  /** Rows put back. */
  back: Counts;
  /** Every row left out, each named, and why. */
  held: RestoreHeldRow[];
  /**
   * The rows left out, as the database's schema holds them, and each cut
   * link naming one of them: what a try again puts back.
   */
  kept: ProjectRows;
  /** The migrations the database has applied: `kept`'s schema. */
  migrations: AppliedRow[];
  /** Links set again. */
  relinked: Counts;
}

/** What a restore came to. */
export type RowsRestored =
  | ({ ok: true } & RowsPut)
  /** A live project holds the id. */
  | { ok: false; why: "live" }
  /** The project's own row is held back: nothing of it goes back. */
  | { ok: false; why: "own"; held: RestoreHeldRow }
  /** A live project holds one of its places. */
  | {
      ok: false;
      why: "place";
      holder: { id: string; name: string };
      machineId: string;
      path: string;
    };

export interface ForgetDb {
  /**
   * Forgets project `id` (its delete, as above), handing every row it takes
   * and every link it cuts to `keep` first, inside the transaction, with the
   * migrations the database has applied, as its `__drizzle_migrations`
   * records them (the record's schema, restore-schema.ts): a throw from
   * `keep` keeps the project whole. Undefined: there is no such project.
   */
  readonly forget: (
    id: string,
    keep: (rows: ProjectRows, migrations: AppliedRow[]) => void
  ) => ProjectRows | undefined;
  /**
   * Puts project `id`'s rows back (as above), `rows` as today's schema holds
   * them (restore-schema.ts `migratedRows`), or does not when a live project
   * holds its id or a place of it, or its own row is held back.
   */
  readonly restore: (id: string, rows: ProjectRows) => RowsRestored;
  /**
   * Puts back rows a restore of project `id` held back (its `kept`), `rows`
   * as today's schema holds them (restore-schema.ts `migratedRows`, read
   * out by {@link heldRowsAt}), checked and held back as a restore's are;
   * or does not while the project is not live.
   */
  readonly retry: (id: string, rows: ProjectRows) => RowsRetried;
}

/** What a try again of held rows came to. */
export type RowsRetried =
  | ({ ok: true } & RowsPut)
  /** The project is not live (forgotten again): nothing goes back into it. */
  | { ok: false; why: "gone" };

/** A foreign key, its columns in order. */
interface Edge {
  child: string;
  from: string[];
  /** Its index in `pragma_foreign_key_list(child)`, which `pragma_foreign_key_check` names it by. */
  id: number;
  onDelete: string;
  parent: string;
  to: string[];
}

/** The alias a row's rowid is read under, beside its columns. */
const ROWID = "cawco_rowid";

/** A row as read, its rowid apart. */
interface Read {
  row: Record<string, unknown>;
  rowid: number;
}

/** Tuples a single statement's IN list carries at most. */
const CHUNK = 200;

const chunks = <T>(items: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += CHUNK) {
    out.push(items.slice(at, at + CHUNK));
  }
  return out;
};

const name = (identifier: string): SQL => sql`${sql.identifier(identifier)}`;
const list = (parts: SQL[]) => sql.join(parts, sql`, `);

/**
 * A raw statement's first row as an object: drizzle's `get` answers a raw
 * statement's row as its values alone.
 */
const first = <T>(tx: Tx, query: SQL): T | undefined => tx.all<T>(query)[0];

/**
 * The table's columns as it stands, as an insert names them; empty when
 * there is no such table. `table_info` leaves out a generated column,
 * which no insert may name: a kept row's value of one is read back from
 * what it was generated from.
 */
const columnsOf = (tx: Tx, table: string): string[] =>
  tx
    .all<{ name: string }>(
      sql`select name from pragma_table_info(${table}) order by cid`
    )
    .map((column) => column.name);

/** The table's primary key's columns, in key order; empty: it has none but its rowid. */
const keyOf = (tx: Tx, table: string): string[] =>
  tx
    .all<{ name: string }>(
      sql`select name from pragma_table_info(${table}) where pk > 0 order by pk`
    )
    .map((column) => column.name);

/** Every foreign key in the database, as SQLite declares it now. */
const edgesOf = (tx: Tx): Edge[] => {
  const rows = tx.all<{
    child: string;
    from: string;
    id: number;
    on_delete: string;
    parent: string;
    to: string | null;
  }>(
    sql`select m.name as child, f.id as id, f."table" as parent, f."from" as "from", f."to" as "to", f.on_delete as on_delete
        from sqlite_master m join pragma_foreign_key_list(m.name) f
        where m.type = 'table' order by m.name, f.id, f.seq`
  );
  const edges = new Map<string, Edge>();
  for (const row of rows) {
    const at = `${row.child}\0${row.id}`;
    const edge = edges.get(at) ?? {
      child: row.child,
      from: [],
      id: row.id,
      onDelete: row.on_delete.toUpperCase(),
      parent: row.parent,
      to: [],
    };
    edge.from.push(row.from);
    // A key naming no parent column names the parent's primary key.
    if (row.to !== null) {
      edge.to.push(row.to);
    }
    edges.set(at, edge);
  }
  return [...edges.values()].map((edge) =>
    edge.to.length === edge.from.length
      ? edge
      : { ...edge, to: keyOf(tx, edge.parent) }
  );
};

/** The rows of `table` that `where` picks, each with its rowid. */
const select = (tx: Tx, table: string, where: SQL): Read[] =>
  tx
    .all<Record<string, unknown>>(
      sql`select rowid as ${name(ROWID)}, * from ${name(table)} where ${where}`
    )
    .map((row) => {
      const { [ROWID]: rowid, ...rest } = row;
      return { row: rest, rowid: Number(rowid) };
    });

/** `columns` holding one of `tuples`. */
const holding = (columns: string[], tuples: unknown[][]): SQL => {
  if (columns.length === 1) {
    return sql`${name(columns[0] ?? "")} in (${list(tuples.map((tuple) => sql`${tuple[0]}`))})`;
  }
  return sql`(${list(columns.map(name))}) in (values ${list(
    tuples.map((tuple) => sql`(${list(tuple.map((value) => sql`${value}`))})`)
  )})`;
};

/** A value as the record keeps it; anything else is refused by its table and column. */
const cell = (table: string, column: string, value: unknown): Cell => {
  if (value === null || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint" && Number.isSafeInteger(Number(value))) {
    return Number(value);
  }
  if (value instanceof Uint8Array) {
    return { bytes: Buffer.from(value).toString("base64") };
  }
  throw new Error(
    `${table}.${column} holds a ${typeof value}, which a forgotten project's record cannot keep`
  );
};

/** A kept value as SQLite takes it back. */
export const sqliteValue = (
  kept: Cell | undefined
): string | number | null | Uint8Array => {
  if (kept === undefined || kept === null) {
    return null;
  }
  return typeof kept === "object"
    ? new Uint8Array(Buffer.from(kept.bytes, "base64"))
    : kept;
};

const add = (counts: Counts, table: string, by = 1): void => {
  if (by > 0) {
    counts[table] = (counts[table] ?? 0) + by;
  }
};

/** Where a forget starts: each table's rows it deletes by name, besides what cascades from them. */
interface Root {
  /** How the rows go; the default deletes what `where` picks. */
  drop?: (tx: Tx) => void;
  table: string;
  where: SQL;
}

/** What a forget of project `id` deletes by name, in the order it deletes them. */
const rootsOf = (id: string, dropPages: (tx: Deleter) => void): Root[] => [
  // Its starts a stage's hook queued, which no key ties to it.
  {
    table: "queued_task_starts",
    where: sql`${name("project_id")} = ${id}`,
  },
  // Where its rules stood with each session, which no key ties to them.
  {
    table: "rule_state",
    where: sql`${name("rule_id")} in (select ${name("id")} from ${name("rules")} where ${name("scope_project_id")} = ${id})`,
  },
  // A memory document scoped to it alone goes with it: losing its last
  // project must not widen it to every session.
  {
    table: "fleet_memory_docs",
    where: sql`${name("path")} in (select ${name("path")} from ${name("fleet_memory_doc_projects")} where ${name("project_id")} = ${id})
      and ${name("path")} not in (select ${name("path")} from ${name("fleet_memory_doc_projects")} where ${name("project_id")} <> ${id})`,
  },
  // Its pages go with it: their sources were its folder's.
  {
    table: "artifacts",
    where: and(projectPage, eq(artifacts.projectId, id)) ?? sql`0`,
    drop: dropPages,
  },
  { table: "projects", where: sql`${name("id")} = ${id}` },
];

/**
 * Every row the roots' deletes take, through every cascade, and every link
 * they cut: read before anything is deleted, since a cascade answers nothing.
 */
const walk = (tx: Tx, roots: Root[]) => {
  const edges = edgesOf(tx);
  const taken = new Map<string, Map<number, Record<string, unknown>>>();
  const cut = new Map<string, { edge: Edge; rows: Map<number, Read> }>();
  /** The rows of `table` not read before, now read. */
  const take = (table: string, rows: Read[]): Read[] => {
    const kept = taken.get(table) ?? new Map();
    taken.set(table, kept);
    const fresh = rows.filter((one) => !kept.has(one.rowid));
    for (const one of fresh) {
      kept.set(one.rowid, one.row);
    }
    return fresh;
  };
  const queue = roots.map((root) => ({
    table: root.table,
    rows: take(root.table, select(tx, root.table, root.where)),
  }));
  for (let next = queue.shift(); next; next = queue.shift()) {
    const { table, rows } = next;
    for (const edge of edges.filter((one) => one.parent === table)) {
      const tuples = [
        ...new Map(
          rows
            .map((one) => edge.to.map((column) => one.row[column]))
            .filter((tuple) => tuple.every((part) => part !== null))
            .map((tuple) => [JSON.stringify(tuple, bytesAsText), tuple])
        ).values(),
      ];
      if (tuples.length === 0) {
        continue;
      }
      const children = chunks(tuples).flatMap((part) =>
        select(tx, edge.child, holding(edge.from, part))
      );
      switch (edge.onDelete) {
        case "CASCADE":
          queue.push({ table: edge.child, rows: take(edge.child, children) });
          break;
        case "SET NULL": {
          const at = `${edge.child}\0${edge.id}`;
          const kept = cut.get(at) ?? { edge, rows: new Map() };
          for (const one of children) {
            kept.rows.set(one.rowid, one);
          }
          cut.set(at, kept);
          break;
        }
        // The delete itself refuses while such a row stands, as it always has.
        case "NO ACTION":
        case "RESTRICT":
          break;
        default:
          throw new Error(
            `${edge.child}(${edge.from.join(", ")}) → ${edge.parent} is ${edge.onDelete} on delete, which a forget cannot keep`
          );
      }
    }
  }
  return { cut, reach: reachOf(edges, roots), taken };
};

/**
 * Every table a cascade from the roots could reach, rows read there or not:
 * the delete's count is held to the walk in each.
 */
const reachOf = (edges: Edge[], roots: Root[]): Set<string> => {
  const reach = new Set(roots.map((root) => root.table));
  for (const table of reach) {
    for (const edge of edges) {
      if (edge.parent === table && edge.onDelete === "CASCADE") {
        reach.add(edge.child);
      }
    }
  }
  return reach;
};

/** A Uint8Array as text in a tuple's key. */
const bytesAsText = (_key: string, part: unknown) =>
  part instanceof Uint8Array ? Buffer.from(part).toString("base64") : part;

/** How many rows `table` holds now. */
const countOf = (tx: Tx, table: string): number =>
  first<{ n: number }>(tx, sql`select count(*) as n from ${name(table)}`)?.n ??
  0;

/** The walk's rows as the record keeps them. */
const recordOf = (
  tx: Tx,
  { cut, taken }: Pick<ReturnType<typeof walk>, "cut" | "taken">
): ProjectRows => ({
  tables: [...taken]
    .filter(([, rows]) => rows.size > 0)
    .map(([table, rows]) => {
      const columns = Object.keys(rows.values().next().value ?? {});
      return {
        table,
        columns,
        rows: [...rows.values()].map((row) =>
          columns.map((column) => cell(table, column, row[column]))
        ),
      };
    }),
  unlinked: [...cut.values()].flatMap(({ edge, rows }) => {
    // A row the forget deletes is kept whole; its link is no cut.
    const deleted = taken.get(edge.child);
    const outlived = [...rows.values()].filter(
      (one) => !deleted?.has(one.rowid)
    );
    if (outlived.length === 0) {
      return [];
    }
    const own = keyOf(tx, edge.child);
    const key = own.length > 0 ? own : ["rowid"];
    return [
      {
        table: edge.child,
        key,
        columns: edge.from,
        rows: outlived.map((one) => [
          ...key.map((column) =>
            cell(
              edge.child,
              column,
              column === "rowid" && own.length === 0
                ? one.rowid
                : one.row[column]
            )
          ),
          ...edge.from.map((column) =>
            cell(edge.child, column, one.row[column])
          ),
        ]),
      },
    ];
  }),
});

export const forgetDb = (
  db: BunSQLiteDatabase & { $client: Database },
  /** db artifacts.ts `artifactEvents`'s `dropArtifacts`: the one way an artifact row goes, which tells its listeners. */
  dropArtifacts: (tx: Deleter, where: SQL | undefined) => void,
  /** {@link schemaTables}: a restore's typed insert goes through these. */
  tables: SchemaTables
): ForgetDb => ({
  forget: (id, keep) =>
    db.transaction((tx) => {
      if (!first(tx, sql`select 1 from ${name("projects")} where id = ${id}`)) {
        return;
      }
      const roots = rootsOf(id, (inner) =>
        dropArtifacts(inner, and(projectPage, eq(artifacts.projectId, id)))
      );
      const walked = walk(tx, roots);
      const rows = recordOf(tx, walked);
      keep(rows, appliedRows(db.$client));
      const before = new Map(
        [...walked.reach].map((table) => [table, countOf(tx, table)])
      );
      for (const root of roots) {
        if (root.drop) {
          root.drop(tx);
        } else {
          tx.run(sql`delete from ${name(root.table)} where ${root.where}`);
        }
      }
      // Every row the delete took was read and kept: a cascade the walk
      // missed would be a row no restore could bring back.
      for (const [table, count] of before) {
        const went = count - countOf(tx, table);
        const read = walked.taken.get(table)?.size ?? 0;
        if (went !== read) {
          throw new Error(
            `forgetting project ${id} took ${went} row(s) of ${table} and kept ${read}: the project stays`
          );
        }
      }
      return rows;
    }),

  restore: (id, rows) =>
    db.transaction((tx): RowsRestored => {
      if (isLive(tx, id)) {
        return { ok: false, why: "live" };
      }
      const held = placeHeld(tx, id, rows);
      if (held) {
        return held;
      }
      const edges = edgesOf(tx);
      const staged = stage(rows, tables);
      holdOffFleet(tx, staged);
      holdDependents(staged, edges);
      const own = staged.find((one) => one.table === "projects" && one.held);
      if (own) {
        return { ok: false, why: "own", held: heldRow(own) };
      }
      const put = putRows(tx, rows, staged, edges);
      if (!isLive(tx, id)) {
        throw new Error(`project ${id}'s row did not go back`);
      }
      return { ok: true, ...put, migrations: appliedRows(db.$client) };
    }),

  retry: (id, rows) =>
    db.transaction((tx): RowsRetried => {
      if (!isLive(tx, id)) {
        return { ok: false, why: "gone" };
      }
      const edges = edgesOf(tx);
      const staged = stage(rows, tables);
      holdOffFleet(tx, staged);
      holdDependents(staged, edges);
      return {
        ok: true,
        ...putRows(tx, rows, staged, edges),
        migrations: appliedRows(db.$client),
      };
    }),
});

/** Whether project `id` is live. */
const isLive = (tx: Tx, id: string): boolean =>
  first(tx, sql`select 1 from ${name("projects")} where id = ${id}`) !==
  undefined;

/**
 * Every staged row not held back inserted (as above), each that names
 * something gone since settled, and each cut link whose row stands set
 * again: what went back, and what was left out, named and kept.
 */
const putRows = (
  tx: Tx,
  rows: ProjectRows,
  staged: Staged[],
  edges: Edge[]
): Omit<RowsPut, "migrations"> => {
  // Checked at the commit: rows go back in any order.
  tx.run(sql`pragma defer_foreign_keys = on`);
  const inserted = putBack(tx, staged, edges);
  const settled = settleKeys(tx, inserted);
  const back = standingBack(tx, inserted, settled);
  // Once the rows that go back stand: a link names only a row that does.
  const { relinked, waiting } = relink(tx, rows.unlinked, edges);
  return {
    back,
    relinked,
    held: staged.flatMap((one) => (one.held ? [heldRow(one)] : [])),
    kept: {
      tables: rows.tables.flatMap((kept) => {
        const left = staged.flatMap((one) =>
          one.kept === kept && one.held ? [one.row] : []
        );
        return left.length > 0 ? [{ ...kept, rows: left }] : [];
      }),
      unlinked: waiting,
    },
  };
};

/**
 * How many inserted rows still stand, by table, once their keys are settled;
 * each that went is held back as an orphan, by the table of what it named
 * (`settled`, {@link settleKeys}), or none when it went with a row it hung
 * off.
 */
const standingBack = (
  tx: Tx,
  inserted: ReadonlyMap<string, ReadonlyMap<number, Staged>>,
  settled: ReadonlyMap<string, string>
): Counts => {
  const back: Counts = {};
  for (const [table, ids] of inserted) {
    const standing = new Set(
      chunks([...ids.keys()]).flatMap((part) =>
        tx
          .all<{ [ROWID]: number }>(
            sql`select rowid as ${name(ROWID)} from ${name(table)} where rowid in (${list(part.map((rowid) => sql`${rowid}`))})`
          )
          .map((one) => Number(one[ROWID]))
      )
    );
    add(back, table, standing.size);
    for (const [rowid, one] of ids) {
      if (!standing.has(rowid)) {
        one.held = {
          kind: "orphan",
          parent: settled.get(`${table}\0${rowid}`) ?? null,
        };
      }
    }
  }
  return back;
};

/**
 * Project `id`'s rows on `db` as a forget today would record them: every row
 * its delete would take, through every cascade, read and kept as a record
 * keeps them, nothing deleted. A restore reads its record's rows so from the
 * scratch database that brought them through the migrations since
 * (restore-schema.ts): a row a migration since moved to a table of its own
 * is read there, and one it left no longer the project's is not.
 */
export const projectRowsAt = (
  db: BunSQLiteDatabase,
  id: string
): ProjectRows["tables"] =>
  db.transaction(
    (tx) =>
      recordOf(
        tx,
        walk(
          tx,
          rootsOf(id, () => undefined)
        )
      ).tables
  );

/**
 * The rows `rows` keeps (a restore's `kept`) on `db`, as a restore reads a
 * record's ({@link projectRowsAt}), from the scratch database that brought
 * them through the migrations since (restore-schema.ts): each kept row,
 * found by its table's key as it stands, and every row a cascade from them
 * reaches, which a migration since may have made of them. That database
 * holds no project row to walk from, and a held row's parent stands in the
 * live database, not there. A table with no key of its own is read whole:
 * the scratch database holds no row of it but these.
 */
export const heldRowsAt = (
  db: BunSQLiteDatabase,
  rows: ProjectRows
): ProjectRows["tables"] =>
  db.transaction((tx) => {
    const roots = rows.tables.flatMap((kept): Root[] => {
      if (columnsOf(tx, kept.table).length === 0) {
        return [];
      }
      const key = keyOf(tx, kept.table);
      const at = key.map((column) => kept.columns.indexOf(column));
      if (key.length === 0 || at.some((index) => index < 0)) {
        return [{ table: kept.table, where: sql`1` }];
      }
      return chunks(
        kept.rows.map((row) => at.map((index) => sqliteValue(row[index])))
      ).map((part) => ({ table: kept.table, where: holding(key, part) }));
    });
    return recordOf(tx, walk(tx, roots)).tables;
  });

/** Every table the schema declares, by its SQL name. */
export type SchemaTables = ReadonlyMap<string, SQLiteTable>;

/** Every table `./schema` declares, by its SQL name: what a restore's typed insert goes through ({@link forgetDb}). */
export const schemaTables = async (): Promise<SchemaTables> =>
  new Map(
    Object.values(await import("./schema")).flatMap((value) =>
      is(value, SQLiteTable) ? [[getTableName(value), value] as const] : []
    )
  );

/** A row of the record, read as its table's insert takes it, and whether it is held back. */
interface Staged {
  /** Its values by column, as the record keeps them. */
  cells: Record<string, Cell>;
  held: RestoreHeldWhy | undefined;
  /** Its primary key, `/`-joined; null when its table has none. */
  id: string | null;
  /** Its table's rows as the record keeps them. */
  kept: ProjectRows["tables"][number];
  /** Its schema table; undefined when the schema no longer declares it. */
  of: SQLiteTable | undefined;
  /** Its values as the record keeps them, in `kept`'s columns. */
  row: Cell[];
  table: string;
  title: string | null;
  /** Its values as its schema table's insert takes them, by key; undefined when it is held back before its insert. */
  values: Record<string, unknown> | undefined;
}

/** A cell as a row names it: text, or a number written as text. */
const named = (kept: Cell | undefined): string | null =>
  typeof kept === "string" || typeof kept === "number" ? String(kept) : null;

/** What a value that did not read or write says, as its column's check said it. */
const issueOf = (error: unknown): string => {
  if (isStoredShapeError(error)) {
    return error.issue;
  }
  return error instanceof Error ? error.message : String(error);
};

/**
 * A row's cells as its schema table's insert takes them, by key, each read
 * as its column reads it and written as it writes it, both checks run; or
 * the first column whose value does not read or write. A generated column
 * is made again from what it is generated from.
 */
const insertValues = (
  table: SQLiteTable,
  cells: Record<string, Cell>
): { values: Record<string, unknown> } | { held: RestoreHeldWhy } => {
  const values: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    const stored = cells[column.name];
    if (column.generated !== undefined || stored === undefined) {
      continue;
    }
    const raw = sqliteValue(stored);
    try {
      const value = raw === null ? null : column.mapFromDriverValue(raw);
      if (value !== null) {
        column.mapToDriverValue(value);
      }
      values[key] = value;
    } catch (error) {
      return {
        held: { kind: "shape", column: column.name, issue: issueOf(error) },
      };
    }
  }
  return { values };
};

/** Why a row's values hold it back before its insert: a value a migration kept as not read, or one that does not read or write. */
const stagedValues = (
  table: SQLiteTable | undefined,
  cells: Record<string, Cell>
): { values: Record<string, unknown> } | { held: RestoreHeldWhy } => {
  if (!table) {
    return { held: { kind: "table" } };
  }
  const unread = Object.values(getTableColumns(table))
    .map((column) => column.name)
    .filter(
      (column) =>
        column.endsWith("_unread") &&
        cells[column] !== null &&
        cells[column] !== undefined
    );
  if (unread.length > 0) {
    return { held: { kind: "unread", columns: unread } };
  }
  return insertValues(table, cells);
};

/**
 * Every row of `rows` read as its schema table reads it and written as its
 * insert would write it ({@link stagedValues}): a value that does not read,
 * or does not write, holds its row back, as does a value a migration kept as
 * not read (an `*_unread` column set).
 */
const stage = (rows: ProjectRows, tables: SchemaTables): Staged[] =>
  rows.tables.flatMap((kept) => {
    const table = tables.get(kept.table);
    const keys = table ? primaryKeyOf(table).map((column) => column.name) : [];
    return kept.rows.map((row): Staged => {
      const cells = Object.fromEntries(
        kept.columns.map((column, at) => [column, row[at] ?? null])
      );
      const key = keys.map((one) => named(cells[one]));
      const staged = stagedValues(table, cells);
      return {
        cells,
        held: "held" in staged ? staged.held : undefined,
        id:
          key.length > 0 && key.every((part) => part !== null)
            ? key.join("/")
            : null,
        kept,
        of: table,
        row,
        table: kept.table,
        title: named(cells.title) ?? named(cells.name),
        values: "values" in staged ? staged.values : undefined,
      };
    });
  });

/** By table, the columns naming a machine whose rows go with it (owned-rows.ts `GO_WITH_MACHINE`). */
const machineColumns = new Map<string, string[]>();
for (const { column } of GO_WITH_MACHINE) {
  const table = getTableName(column.table);
  machineColumns.set(table, [
    ...(machineColumns.get(table) ?? []),
    column.name,
  ]);
}

/**
 * Each row not held back that goes with a machine (`machineColumns`) and
 * names one the fleet no longer has (the hub's own folder, on
 * `HUB_PLACE_MACHINE`, names none), held back, named by the hostname the
 * machine had when it was removed: no foreign key ties it to its machine,
 * so nothing else would keep it from coming back on one that is gone.
 */
const holdOffFleet = (tx: Tx, staged: Staged[]): void => {
  for (const one of staged) {
    for (const column of machineColumns.get(one.table) ?? []) {
      const machineId = one.cells[column];
      if (
        one.held ||
        typeof machineId !== "string" ||
        machineId === HUB_PLACE_MACHINE
      ) {
        continue;
      }
      const kept = tx
        .select({ machineId: agents.machineId })
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get();
      if (kept) {
        continue;
      }
      const removed = tx
        .select({ hostname: removedMachines.hostname })
        .from(removedMachines)
        .where(eq(removedMachines.machineId, machineId))
        .get();
      one.held = {
        kind: "machine",
        machineId,
        hostname: removed?.hostname ?? null,
      };
    }
  }
};

/** A held row as the restore names it. */
const heldRow = (one: Staged): RestoreHeldRow => ({
  table: one.table,
  title: one.title,
  id: one.id,
  why: one.held ?? { kind: "table" },
});

/** A tuple of cells as one key. */
const tupleKey = (cells: (Cell | undefined)[]): string | undefined =>
  cells.every((one) => one !== null && one !== undefined)
    ? JSON.stringify(cells)
    : undefined;

/**
 * Every row that hangs off a held row by a foreign key, at any depth, held
 * back with it: it names the row it hangs off.
 */
const holdDependents = (staged: Staged[], edges: Edge[]): void => {
  /** Each edge's child rows by the key they name, read once. */
  const byKey = new Map<Edge, Map<string, Staged[]>>();
  const childrenOf = (edge: Edge, key: string): Staged[] => {
    let index = byKey.get(edge);
    if (!index) {
      index = new Map();
      for (const one of staged) {
        if (one.table !== edge.child) {
          continue;
        }
        const at = tupleKey(edge.from.map((column) => one.cells[column]));
        if (at !== undefined) {
          index.set(at, [...(index.get(at) ?? []), one]);
        }
      }
      byKey.set(edge, index);
    }
    return index.get(key) ?? [];
  };
  const queue = staged.filter((one) => one.held);
  for (let next = queue.shift(); next; next = queue.shift()) {
    const parent = next;
    for (const edge of edges.filter((one) => one.parent === parent.table)) {
      const key = tupleKey(edge.to.map((column) => parent.cells[column]));
      if (key === undefined) {
        continue;
      }
      for (const child of childrenOf(edge, key)) {
        if (!child.held) {
          child.held = {
            kind: "depends",
            table: parent.table,
            title: parent.title,
            id: parent.id,
          };
          queue.push(child);
        }
      }
    }
  }
};

/** A row its insert did not take, with what was said: the savepoint it was tried in rolls back. */
class NotTaken extends Error {
  readonly row: Staged;
  constructor(row: Staged, options: { cause: unknown }) {
    super(issueOf(options.cause), options);
    this.row = row;
  }
}

/**
 * Every row not held back inserted through its schema table's typed insert,
 * but one whose key a row made since holds (`taken`, which stays out): the
 * rows that went back, by table and the rowid each went back under. A row
 * the database's own constraints do not take is held back with every row
 * that hangs off it, and the rest are tried again.
 */
const putBack = (
  tx: Tx,
  staged: Staged[],
  edges: Edge[]
): Map<string, Map<number, Staged>> => {
  for (;;) {
    const inserted = new Map<string, Map<number, Staged>>();
    try {
      tx.transaction((inner) => {
        for (const one of staged) {
          if (one.held || !one.of || !one.values) {
            continue;
          }
          let put: { rowid: number } | undefined;
          try {
            put = inner
              .insert(one.of)
              .values(one.values)
              .onConflictDoNothing()
              .returning({ rowid: sql<number>`rowid` })
              .get();
          } catch (error) {
            throw new NotTaken(one, { cause: error });
          }
          if (put) {
            const ids = inserted.get(one.table) ?? new Map<number, Staged>();
            ids.set(Number(put.rowid), one);
            inserted.set(one.table, ids);
          } else {
            one.held = { kind: "taken" };
          }
        }
      });
      return inserted;
    } catch (error) {
      if (!(error instanceof NotTaken)) {
        throw error;
      }
      for (const one of staged) {
        if (one.held?.kind === "taken") {
          one.held = undefined;
        }
      }
      error.row.held = isStoredShapeError(error.cause)
        ? { kind: "shape", column: error.cause.column, issue: error.message }
        : { kind: "constraint", detail: error.message };
      holdDependents(staged, edges);
    }
  }
};

/**
 * Each cut link set again where its row still stands and still reads null,
 * and the row it names stands: how many, by table. One whose named row does
 * not stand (held back) waits, while its own row stands and reads null; a
 * link its table no longer has is gone with it.
 */
const relink = (
  tx: Tx,
  unlinked: ProjectRows["unlinked"],
  edges: readonly Edge[]
): { relinked: Counts; waiting: ProjectRows["unlinked"] } => {
  const relinked: Counts = {};
  const waiting: ProjectRows["unlinked"] = [];
  for (const cut of unlinked) {
    const now = new Set(columnsOf(tx, cut.table));
    const edge = edges.find(
      (one) =>
        one.child === cut.table &&
        one.from.length === cut.columns.length &&
        one.from.every((column, at) => column === cut.columns[at])
    );
    if (!(edge && cut.key.every((one) => now.has(one) || one === "rowid"))) {
      continue;
    }
    const left: ProjectRows["unlinked"][number]["rows"] = [];
    for (const row of cut.rows) {
      const keyed = cut.key.map(
        (column, at) => sql`${name(column)} = ${sqliteValue(row[at])}`
      );
      const values = cut.columns.map((_column, at) =>
        sqliteValue(row[cut.key.length + at])
      );
      const unset = cut.columns.map((column) => sql`${name(column)} is null`);
      const where = sql.join([...keyed, ...unset], sql` and `);
      const stands = first(
        tx,
        sql`select 1 from ${name(edge.parent)} where ${sql.join(
          edge.to.map((column, at) => sql`${name(column)} = ${values[at]}`),
          sql` and `
        )}`
      );
      if (!stands) {
        if (first(tx, sql`select 1 from ${name(cut.table)} where ${where}`)) {
          left.push(row);
        }
        continue;
      }
      const set = cut.columns.map(
        (column, at) => sql`${name(column)} = ${values[at]}`
      );
      add(
        relinked,
        cut.table,
        tx.all(
          sql`update ${name(cut.table)} set ${list(set)} where ${where} returning 1`
        ).length
      );
    }
    if (left.length > 0) {
      waiting.push({ ...cut, rows: left });
    }
  }
  return { relinked, waiting };
};

/** A live project holding one of the record's places, as the refusal names it. */
const placeHeld = (
  tx: Tx,
  id: string,
  rows: ProjectRows
): Extract<RowsRestored, { why: "place" }> | undefined => {
  const places = rows.tables.find((one) => one.table === "project_places");
  if (!places) {
    return;
  }
  const machineAt = places.columns.indexOf("machine_id");
  const pathAt = places.columns.indexOf("path");
  for (const row of places.rows) {
    const machineId = row[machineAt];
    const path = row[pathAt];
    if (typeof machineId !== "string" || typeof path !== "string") {
      continue;
    }
    const holder = first<{ id: string; name: string }>(
      tx,
      sql`select p.id as id, p.name as name from ${name("project_places")} pl join ${name("projects")} p on p.id = pl.project_id
          where pl.machine_id = ${machineId} and pl.path = ${path} and pl.project_id <> ${id} limit 1`
    );
    if (holder) {
      return { ok: false, why: "place", holder, machineId, path };
    }
  }
};

/**
 * Each restored row that names something gone since, treated as that
 * thing's delete would have treated it: its link set to null where its key
 * says so, else the row deleted (which cascades on to what hangs off it).
 * Rows that broke a key before the restore are not its business. Answers
 * each row it deleted, by `table\0rowid`, with the table of what it named.
 */
const settleKeys = (
  tx: Tx,
  inserted: ReadonlyMap<string, ReadonlyMap<number, unknown>>
): Map<string, string> => {
  const edges = new Map(
    edgesOf(tx).map((edge) => [`${edge.child}\0${edge.id}`, edge])
  );
  /** Each row deleted here (`table\0rowid`), and the table of what it named. */
  const away = new Map<string, string>();
  // Each round settles at least one row, or ends: a delete can break no
  // row it does not take with it.
  for (;;) {
    let settled = 0;
    for (const [table, ids] of inserted) {
      if (ids.size === 0) {
        continue;
      }
      const broken = tx.all<{ fkid: number; parent: string; rowid: number }>(
        sql`select * from pragma_foreign_key_check(${table})`
      );
      for (const one of broken) {
        const at = `${table}\0${one.rowid}`;
        if (!ids.has(Number(one.rowid)) || away.has(at)) {
          continue;
        }
        const edge = edges.get(`${table}\0${one.fkid}`);
        if (edge?.onDelete === "SET NULL") {
          tx.run(
            sql`update ${name(table)} set ${list(edge.from.map((column) => sql`${name(column)} = null`))} where rowid = ${one.rowid}`
          );
        } else {
          tx.run(sql`delete from ${name(table)} where rowid = ${one.rowid}`);
          away.set(at, one.parent);
        }
        settled += 1;
      }
    }
    if (settled === 0) {
      return away;
    }
  }
};

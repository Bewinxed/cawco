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
 * A restore puts every row back as it was, with the foreign keys deferred to
 * the commit, so the order rows go back in does not matter. A row whose key
 * another row made since holds stays out (that one stays); a row that names
 * something gone since (a session, an account) is treated as that thing's
 * delete would have treated it: its link set to null where the key says so,
 * else the row stays gone. Each cut link is set again where it still reads
 * null. Columns a migration dropped since are left out, columns it added
 * take their defaults.
 */
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { z } from "zod";
import { type Deleter, projectPage } from "./artifacts";
import { artifacts } from "./schema";
import type { Tx } from "./tx";

/** A value as the record keeps it: SQLite's text, numbers and nulls as they are, a blob as base64. */
const CellSchema = z.union([
  z.string(),
  z.number(),
  z.null(),
  z.object({ bytes: z.string() }).strict(),
]);
type Cell = z.infer<typeof CellSchema>;

const IDENTIFIER = z.string().min(1).max(200);

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

/** What a restore came to. */
export type RowsRestored =
  | {
      ok: true;
      /** Rows put back. */
      back: Counts;
      /** Links set again. */
      relinked: Counts;
      /** Rows left out: a row made since holds their key. */
      taken: Counts;
      /** Rows left out: what they named went since, or their table did. */
      gone: Counts;
    }
  /** A live project holds the id. */
  | { ok: false; why: "live" }
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
   * and every link it cuts to `keep` first, inside the transaction: a throw
   * from `keep` keeps the project whole. Undefined: there is no such project.
   */
  readonly forget: (
    id: string,
    keep: (rows: ProjectRows) => void
  ) => ProjectRows | undefined;
  /** Puts project `id`'s rows back (as above), or refuses when a live project holds its id or a place of it. */
  readonly restore: (id: string, rows: ProjectRows) => RowsRestored;
}

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

/** The table's columns as it stands; empty when there is no such table. */
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
const sqliteValue = (
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
  db: BunSQLiteDatabase,
  /** db artifacts.ts `artifactEvents`'s `dropArtifacts`: the one way an artifact row goes, which tells its listeners. */
  dropArtifacts: (tx: Deleter, where: SQL | undefined) => void
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
      keep(rows);
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
      if (first(tx, sql`select 1 from ${name("projects")} where id = ${id}`)) {
        return { ok: false, why: "live" };
      }
      const held = placeHeld(tx, id, rows);
      if (held) {
        return held;
      }
      // Checked at the commit: rows go back in any order.
      tx.run(sql`pragma defer_foreign_keys = on`);
      const gone: Counts = {};
      const { inserted, taken } = putBack(tx, rows, gone);
      const relinked = relink(tx, rows);
      settleKeys(tx, inserted);
      if (!first(tx, sql`select 1 from ${name("projects")} where id = ${id}`)) {
        throw new Error(`project ${id}'s row did not go back`);
      }
      const back: Counts = {};
      for (const [table, ids] of inserted) {
        const stands = chunks([...ids]).reduce(
          (sum, part) =>
            sum +
            (first<{ n: number }>(
              tx,
              sql`select count(*) as n from ${name(table)} where rowid in (${list(part.map((one) => sql`${one}`))})`
            )?.n ?? 0),
          0
        );
        add(back, table, stands);
        add(gone, table, ids.size - stands);
      }
      return { ok: true, back, relinked, taken, gone };
    }),
});

/**
 * Every kept row inserted again, but one whose key a row made since holds
 * (`taken`) and one whose table went (`gone`): the rowids it went back
 * under, by table.
 */
const putBack = (tx: Tx, rows: ProjectRows, gone: Counts) => {
  const taken: Counts = {};
  const inserted = new Map<string, Set<number>>();
  for (const kept of rows.tables) {
    const now = new Set(columnsOf(tx, kept.table));
    if (now.size === 0) {
      add(gone, kept.table, kept.rows.length);
      continue;
    }
    const used = kept.columns.flatMap((column, at) =>
      now.has(column) ? [{ column, at }] : []
    );
    const ids = inserted.get(kept.table) ?? new Set<number>();
    inserted.set(kept.table, ids);
    for (const row of kept.rows) {
      const put = first<{ [ROWID]: number }>(
        tx,
        sql`insert into ${name(kept.table)} (${list(used.map((one) => name(one.column)))})
            values (${list(used.map((one) => sql`${sqliteValue(row[one.at])}`))})
            on conflict do nothing returning rowid as ${name(ROWID)}`
      );
      if (put) {
        ids.add(Number(put[ROWID]));
      } else {
        add(taken, kept.table);
      }
    }
  }
  return { inserted, taken };
};

/** Each cut link set again where its row still stands and still reads null: how many, by table. */
const relink = (tx: Tx, rows: ProjectRows): Counts => {
  const relinked: Counts = {};
  for (const cut of rows.unlinked) {
    const now = new Set(columnsOf(tx, cut.table));
    if (
      ![...cut.key, ...cut.columns].every(
        (one) => now.has(one) || one === "rowid"
      )
    ) {
      continue;
    }
    for (const row of cut.rows) {
      const keyed = cut.key.map(
        (column, at) => sql`${name(column)} = ${sqliteValue(row[at])}`
      );
      const set = cut.columns.map(
        (column, at) =>
          sql`${name(column)} = ${sqliteValue(row[cut.key.length + at])}`
      );
      const unset = cut.columns.map((column) => sql`${name(column)} is null`);
      add(
        relinked,
        cut.table,
        tx.all(
          sql`update ${name(cut.table)} set ${list(set)} where ${sql.join([...keyed, ...unset], sql` and `)} returning 1`
        ).length
      );
    }
  }
  return relinked;
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
 * Rows that broke a key before the restore are not its business.
 */
const settleKeys = (tx: Tx, inserted: Map<string, Set<number>>): void => {
  const edges = new Map(
    edgesOf(tx).map((edge) => [`${edge.child}\0${edge.id}`, edge])
  );
  // Each round settles at least one row, or ends: a delete can break no
  // row it does not take with it.
  for (;;) {
    let settled = 0;
    for (const [table, ids] of inserted) {
      if (ids.size === 0) {
        continue;
      }
      const broken = tx.all<{ fkid: number; rowid: number }>(
        sql`select * from pragma_foreign_key_check(${table})`
      );
      for (const one of broken) {
        if (!ids.has(Number(one.rowid))) {
          continue;
        }
        const edge = edges.get(`${table}\0${one.fkid}`);
        if (edge?.onDelete === "SET NULL") {
          tx.run(
            sql`update ${name(table)} set ${list(edge.from.map((column) => sql`${name(column)} = null`))} where rowid = ${one.rowid}`
          );
        } else {
          tx.run(sql`delete from ${name(table)} where rowid = ${one.rowid}`);
          ids.delete(Number(one.rowid));
        }
        settled += 1;
      }
    }
    if (settled === 0) {
      return;
    }
  }
};

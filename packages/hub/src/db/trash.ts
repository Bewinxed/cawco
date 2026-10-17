import type { Deleted } from "@cawco/core";
import { and, eq, gte, inArray, lt, type SQL, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  configTrash,
  connectionProjects,
  connections,
  fleetAgents,
  fleetHooks,
  fleetMcpOauth,
  fleetMcpSessions,
  fleetMemory,
  fleetMemoryDocProjects,
  fleetMemoryDocs,
  fleetMemoryDocTypes,
  marketplaces,
  mcpServers,
  plugins,
  ruleState,
  rules,
  skills,
  type TrashedRows,
  type TrashKind,
} from "./schema";

/**
 * How long a deleted config item can be brought back whole: past the life
 * of the dashboard's Undo toast (sonner's 4 s, paused while a pointer rests
 * on it or the tab is hidden), which closes when this runs out.
 */
export const UNDO_MS = 60_000;

/** What a config delete answers: core's {@link Deleted}, the entry the dashboard's Undo names. */
export interface Undoable extends Deleted {
  /** Always true: what every delete has answered since before the trash. */
  ok: boolean;
}

export const undoable = (restore: number): Undoable => ({
  ok: true,
  restore,
  restorableForMs: UNDO_MS,
});

/** What a delete names: the item, by its kind and key. */
export type TrashItem =
  | { kind: Exclude<TrashKind, "memory">; key: string }
  /** The main memory file, with the documents it links (`docs`), which go with it. */
  | { kind: "memory"; key: string; docs: readonly string[] };

/** What a restore came to. */
export type Untrashed =
  | { kind: TrashKind; key: string; ok: true }
  /** Its window passed, its project went, or it was never trashed. */
  | { ok: false; why: "gone" }
  /** Something of the same key was made while it waited; that one stays. */
  | { ok: false; why: "taken" };

export interface TrashDb {
  /**
   * Moves the item and every row that hangs off it out of the live tables
   * into the trash, in one transaction; what waited there past
   * {@link UNDO_MS} goes for good. Answers the trash entry's id, or
   * undefined when there is no such item.
   */
  readonly put: (item: TrashItem, at: number) => number | undefined;
  /**
   * Puts an item trashed at `at` − {@link UNDO_MS} or later back, every
   * column as it was. A row that hangs off it and can no longer stand (the
   * session or project it named went meanwhile) stays gone, as a cascade
   * would have taken it.
   */
  readonly take: (id: number, at: number) => Untrashed;
}

/** One table's share of an item, the rows `where` picks; `kept` false: deleted, not kept. */
interface Part {
  kept: boolean;
  table: string;
  where: SQL;
}

/** The rows of `table` that `where` picks, by the table's name in the database. */
const part = (table: string, where: SQL, kept = true): Part => ({
  kept,
  table,
  where,
});

type Tx = Parameters<Parameters<BunSQLiteDatabase["transaction"]>[0]>[0];

/** Each kind's parts, by its key: its own table first. */
const PARTS: Record<Exclude<TrashKind, "memory">, (key: string) => Part[]> = {
  rule: (key) => [
    part("rules", eq(rules.id, key)),
    part("rule_state", eq(ruleState.ruleId, key)),
  ],
  hook: (key) => [part("fleet_hooks", eq(fleetHooks.id, key))],
  skill: (key) => [part("skills", eq(skills.name, key))],
  plugin: (key) => [part("plugins", eq(plugins.id, key))],
  marketplace: (key) => [part("marketplaces", eq(marketplaces.name, key))],
  agent: (key) => [part("fleet_agents", eq(fleetAgents.name, key))],
  mcp: (key) => [
    part("mcp_servers", eq(mcpServers.name, key)),
    // Its sign-in comes back with it.
    part("fleet_mcp_oauth", eq(fleetMcpOauth.name, key)),
    // A relay session's upstream went with the server: a session opens a
    // new one.
    part("fleet_mcp_sessions", eq(fleetMcpSessions.server, key), false),
  ],
  // delegate-types.ts owns this table outside Drizzle's schema.
  delegateType: (key) => [
    part("delegate_types", sql`${sql.identifier("name")} = ${key}`),
  ],
  memoryDoc: (key) => docParts([key]),
  connection: (key) => [
    part("connections", eq(connections.name, key)),
    part(
      "connection_projects",
      sql`${connectionProjects.connectionId} in (select ${connections.id} from ${connections} where ${eq(connections.name, key)})`
    ),
  ],
};

/** The item's parts, its own table first. */
const partsOf = (item: TrashItem): Part[] =>
  item.kind === "memory"
    ? [
        part("fleet_memory", eq(fleetMemory.id, item.key)),
        ...(item.docs.length > 0 ? docParts(item.docs) : []),
      ]
    : PARTS[item.kind](item.key);

/**
 * The project an item is bound to, as its own row names it (a rule's
 * `scope_project_id`, a hook's, skill's or MCP server's `project_id`): its
 * trash entry goes with that project, as the item itself would have.
 */
const projectOf = (own: Record<string, string | number | null>) => {
  const bound = own.project_id ?? own.scope_project_id ?? null;
  return typeof bound === "string" ? bound : null;
};

/** Memory documents with their delegate types and projects. */
const docParts = (paths: readonly string[]): Part[] => [
  part("fleet_memory_docs", inArray(fleetMemoryDocs.path, [...paths])),
  part("fleet_memory_doc_types", inArray(fleetMemoryDocTypes.path, [...paths])),
  part(
    "fleet_memory_doc_projects",
    inArray(fleetMemoryDocProjects.path, [...paths])
  ),
];

/** A driver value the trash can keep as JSON; anything else is refused by name. */
const keepable = (
  table: string,
  row: Record<string, unknown>
): Record<string, string | number | null> => {
  for (const [column, value] of Object.entries(row)) {
    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number"
    ) {
      throw new Error(
        `${table}.${column} holds a ${typeof value}, which the trash cannot keep`
      );
    }
  }
  return row as Record<string, string | number | null>;
};

const insert = (
  tx: Tx,
  table: string,
  row: Record<string, string | number | null>
) => {
  const columns = Object.keys(row);
  tx.run(
    sql`insert into ${sql.identifier(table)} (${sql.join(
      columns.map((column) => sql.identifier(column)),
      sql`, `
    )}) values (${sql.join(
      columns.map((column) => sql`${row[column]}`),
      sql`, `
    )})`
  );
};

/** SQLite's codes for a key taken: the item's name or id is in use again. */
const TAKEN = new Set([
  "SQLITE_CONSTRAINT_PRIMARYKEY",
  "SQLITE_CONSTRAINT_UNIQUE",
]);

/**
 * Whether `error` is a key taken. Drizzle wraps the driver's error ("Failed
 * to run the query …"), so its code is looked for down the cause chain.
 */
const taken = (error: unknown): boolean => {
  for (let at: unknown = error; at instanceof Error; at = at.cause) {
    if (TAKEN.has((at as Error & { code?: string }).code ?? "")) {
      return true;
    }
  }
  return false;
};

export const trashDb = (db: BunSQLiteDatabase): TrashDb => ({
  put: (item, at) =>
    db.transaction((tx) => {
      tx.delete(configTrash)
        .where(lt(configTrash.deletedAt, new Date(at - UNDO_MS)))
        .run();
      const parts = partsOf(item);
      const kept: TrashedRows[] = parts
        .filter((each) => each.kept)
        .map((each) => ({
          table: each.table,
          rows: tx
            .all<Record<string, unknown>>(
              sql`select * from ${sql.identifier(each.table)} where ${each.where}`
            )
            .map((row) => keepable(each.table, row)),
        }));
      // No row of its own: there is no such item.
      const own = kept[0]?.rows[0];
      if (!own) {
        return;
      }
      // What hangs off the item goes first, so nothing is left pointing at
      // a row that is gone.
      for (const each of parts.toReversed()) {
        tx.run(
          sql`delete from ${sql.identifier(each.table)} where ${each.where}`
        );
      }
      return tx
        .insert(configTrash)
        .values({
          kind: item.kind,
          key: item.key,
          projectId: projectOf(own),
          rows: kept,
          deletedAt: new Date(at),
        })
        .returning({ id: configTrash.id })
        .get().id;
    }),

  take: (id, at) => {
    try {
      return db.transaction((tx): Untrashed => {
        const entry = tx
          .select()
          .from(configTrash)
          .where(
            and(
              eq(configTrash.id, id),
              gte(configTrash.deletedAt, new Date(at - UNDO_MS))
            )
          )
          .get();
        if (!entry) {
          return { ok: false, why: "gone" };
        }
        const [own, ...hanging] = entry.rows;
        // The item itself goes back whole or not at all.
        for (const row of own?.rows ?? []) {
          insert(tx, own.table, row);
        }
        for (const each of hanging) {
          for (const row of each.rows) {
            try {
              tx.transaction((inner) => insert(inner, each.table, row));
            } catch {
              // What it named went while it waited: it stays gone with it.
            }
          }
        }
        tx.delete(configTrash).where(eq(configTrash.id, id)).run();
        return { ok: true, kind: entry.kind, key: entry.key };
      });
    } catch (error) {
      if (taken(error)) {
        return { ok: false, why: "taken" };
      }
      throw error;
    }
  },
});

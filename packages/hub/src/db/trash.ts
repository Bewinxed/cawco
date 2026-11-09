import type { Deleted } from "@cawco/core/fleet";
import { and, eq, gte, inArray, lt, type SQL, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  configTrash,
  connectionAreas,
  connectionProjects,
  connections,
  fleetAgents,
  fleetHarnessConfig,
  fleetHooks,
  fleetMcpOauth,
  fleetMcpSessions,
  fleetMemory,
  fleetMemoryDocAreas,
  fleetMemoryDocProjects,
  fleetMemoryDocs,
  fleetMemoryDocTypes,
  githubPollCursors,
  githubPollers,
  marketplaces,
  mcpServers,
  plugins,
  ruleState,
  rules,
  skills,
  type TrashKind,
} from "./schema";
import type { TrashedRows } from "./stored-types";
import type { Tx } from "./tx";

/**
 * How long a deleted config item can be brought back whole: past the life
 * of the dashboard's Undo toast (sonner's 4 s, paused while a pointer rests
 * on it or the tab is hidden), which closes when this runs out.
 */
const UNDO_MS = 60_000;

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
type TrashItem =
  | { kind: Exclude<TrashKind, "memory">; key: string }
  /** The main memory file, with the documents it links (`docs`), which go with it. */
  | { kind: "memory"; key: string; docs: readonly string[] };

/** What a restore came to. */
type Untrashed =
  | { kind: TrashKind; key: string; ok: true }
  /** Its window passed, or it was never trashed. */
  | { ok: false; why: "gone" }
  /** Something of the same key was made while it waited; that one stays. */
  | { ok: false; why: "taken" }
  /**
   * The project or area that bound it went while it waited, so it cannot
   * come back as it was: nothing comes back bound to what is gone, or
   * wider than it went (a document whose projects all went would reach
   * every project).
   */
  | { ok: false; why: "unbound" };

/**
 * The tables whose rows narrow an item to some projects (a memory
 * document's projects and areas): an item that had some and gets none back
 * would come back reaching every project, so it does not come back.
 */
const NARROWING = new Set([
  "fleet_memory_doc_projects",
  "fleet_memory_doc_areas",
]);

/** The refusal a restore is rolled back with when what bound the item went. */
class Unbound extends Error {}

/** SQLite's code for a key naming a row that is not there. */
const FOREIGN_KEY = new Set(["SQLITE_CONSTRAINT_FOREIGNKEY"]);

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
   * would have taken it; but an item whose binding went (its own row names
   * a project or area gone since, or it was narrowed to some and none is
   * left) does not come back at all (`unbound`): it never widens.
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

/** Each kind's parts, by its key: its own table first. */
const PARTS: Record<Exclude<TrashKind, "memory">, (key: string) => Part[]> = {
  rule: (key) => [
    part("rules", eq(rules.id, key)),
    part("rule_state", eq(ruleState.ruleId, key)),
  ],
  hook: (key) => [part("fleet_hooks", eq(fleetHooks.id, key))],
  harnessConfig: (key) => [
    part("fleet_harness_config", eq(fleetHarnessConfig.id, key)),
  ],
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
  // db/delegate-types.ts owns this table outside Drizzle's schema.
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
    part(
      "connection_areas",
      sql`${connectionAreas.connectionId} in (select ${connections.id} from ${connections} where ${eq(connections.name, key)})`
    ),
    // The GitHub pollers it ran stop, and come back with it, cursors and
    // all, to a project that has named no other meanwhile.
    part("github_pollers", eq(githubPollers.connection, key)),
    part(
      "github_poll_cursors",
      sql`${githubPollCursors.projectId} in (select ${githubPollers.projectId} from ${githubPollers} where ${eq(githubPollers.connection, key)})`
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

/** Memory documents with their delegate types and projects. */
const docParts = (paths: readonly string[]): Part[] => [
  part("fleet_memory_docs", inArray(fleetMemoryDocs.path, [...paths])),
  part("fleet_memory_doc_types", inArray(fleetMemoryDocTypes.path, [...paths])),
  part(
    "fleet_memory_doc_projects",
    inArray(fleetMemoryDocProjects.path, [...paths])
  ),
  part("fleet_memory_doc_areas", inArray(fleetMemoryDocAreas.path, [...paths])),
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
 * Whether `error` carries one of `codes`. Drizzle wraps the driver's error
 * ("Failed to run the query …"), so its code is looked for down the cause
 * chain.
 */
const coded = (error: unknown, codes: ReadonlySet<string>): boolean => {
  for (let at: unknown = error; at instanceof Error; at = at.cause) {
    if (codes.has((at as Error & { code?: string }).code ?? "")) {
      return true;
    }
  }
  return false;
};

/** Whether `error` is a key taken: the item's name or id is in use again. */
const taken = (error: unknown): boolean => coded(error, TAKEN);

/**
 * The item's own rows back, whole or not at all: one naming a project or
 * area gone since is its binding gone (`Unbound`).
 */
const putOwnBack = (tx: Tx, own: TrashedRows): void => {
  for (const row of own.rows) {
    try {
      tx.transaction((inner) => insert(inner, own.table, row));
    } catch (error) {
      if (coded(error, FOREIGN_KEY)) {
        throw new Unbound(own.table, { cause: error });
      }
      throw error;
    }
  }
};

/**
 * What hangs off the item back, each row that can still stand; a row naming
 * something gone since stays gone with it. An item narrowed to some
 * projects that gets none of them back is unbound (`Unbound`).
 */
const putHangingBack = (tx: Tx, hanging: readonly TrashedRows[]): void => {
  let narrowed = 0;
  let narrowedBack = 0;
  for (const each of hanging) {
    const narrows = NARROWING.has(each.table);
    for (const row of each.rows) {
      narrowed += narrows ? 1 : 0;
      try {
        tx.transaction((inner) => insert(inner, each.table, row));
        narrowedBack += narrows ? 1 : 0;
      } catch {
        // What it named went while it waited: it stays gone with it.
      }
    }
  }
  if (narrowed > 0 && narrowedBack === 0) {
    throw new Unbound("every project it was narrowed to went");
  }
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
        if (own) {
          putOwnBack(tx, own);
        }
        putHangingBack(tx, hanging);
        tx.delete(configTrash).where(eq(configTrash.id, id)).run();
        return { ok: true, kind: entry.kind, key: entry.key };
      });
    } catch (error) {
      if (error instanceof Unbound) {
        return { ok: false, why: "unbound" };
      }
      if (taken(error)) {
        return { ok: false, why: "taken" };
      }
      throw error;
    }
  },
});

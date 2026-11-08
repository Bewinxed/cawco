import type { Area, OwnSettings } from "@cawco/core/areas";
import { asc, count, eq, max } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  areas,
  fleetHarnessConfig,
  fleetHooks,
  mcpServers,
  projects,
  rules,
  skills,
} from "./schema";

/** An area as the hub keeps it: core `Area`, its columns one for one. */
export type AreaRow = typeof areas.$inferSelect & Area;

/** What an area's settings write changes: any of its own settings, null clearing one. */
export type AreaSettingsChange = Partial<OwnSettings>;

/**
 * What a delete took: the projects it ungrouped, and how many rules and
 * fleet rows (skills, MCP servers, hooks, harness settings) bound to it went
 * with it.
 */
export interface AreaDeleted {
  /** The fleet rows bound to it, by kind. */
  fleetRows: { hooks: number; mcp: number; settings: number; skills: number };
  projects: string[];
  rules: number;
}

/**
 * The areas (core areas.ts) and which project sits in which. The routes
 * check every value before it reaches here (areas.ts); this keeps rows.
 */
export interface AreasDb {
  /** A new area, last in the order. */
  readonly create: (id: string, name: string) => AreaRow;
  /**
   * Deletes an area: its projects ungrouped (`ON DELETE SET NULL`), the
   * memory, connection and rule scopes naming it and the fleet rows bound to
   * it gone with it. Undefined: there was no such area.
   */
  readonly delete: (id: string) => AreaDeleted | undefined;
  readonly get: (id: string) => AreaRow | undefined;
  /** Every area, in its order. */
  readonly list: () => AreaRow[];
  /** Puts the areas in the order `ids` gives (every area once). */
  readonly order: (ids: readonly string[]) => void;
  /** Puts a project in an area, or in none (null). */
  readonly place: (projectId: string, areaId: string | null) => void;
  /** The projects in an area, oldest first. */
  readonly projectsIn: (id: string) => string[];
  readonly rename: (id: string, name: string) => void;
  readonly setSettings: (id: string, change: AreaSettingsChange) => void;
}

export const areasDb = (db: BunSQLiteDatabase): AreasDb => {
  const projectsIn = (id: string): string[] =>
    db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.areaId, id))
      .orderBy(asc(projects.createdAt), asc(projects.id))
      .all()
      .map((row) => row.id);
  const get = (id: string): AreaRow | undefined =>
    db.select().from(areas).where(eq(areas.id, id)).get();
  return {
    create: (id, name) => {
      const last =
        db
          .select({ at: max(areas.position) })
          .from(areas)
          .get()?.at ?? -1;
      db.insert(areas)
        .values({ id, name, position: last + 1 })
        .run();
      const made = get(id);
      if (!made) {
        throw new Error(`area ${id} was not stored`);
      }
      return made;
    },
    delete: (id) =>
      db.transaction((tx) => {
        if (
          !tx.select({ id: areas.id }).from(areas).where(eq(areas.id, id)).get()
        ) {
          return;
        }
        const ungrouped = projectsIn(id);
        const scoped =
          tx
            .select({ n: count() })
            .from(rules)
            .where(eq(rules.scopeAreaId, id))
            .get()?.n ?? 0;
        const bound = (
          table:
            | typeof skills
            | typeof mcpServers
            | typeof fleetHooks
            | typeof fleetHarnessConfig
        ) =>
          tx
            .select({ n: count() })
            .from(table)
            .where(eq(table.areaId, id))
            .get()?.n ?? 0;
        const fleetRows = {
          skills: bound(skills),
          mcp: bound(mcpServers),
          hooks: bound(fleetHooks),
          settings: bound(fleetHarnessConfig),
        };
        tx.delete(areas).where(eq(areas.id, id)).run();
        return { projects: ungrouped, rules: scoped, fleetRows };
      }),
    get,
    list: () =>
      db
        .select()
        .from(areas)
        .orderBy(asc(areas.position), asc(areas.createdAt), asc(areas.id))
        .all(),
    order: (ids) => {
      db.transaction((tx) => {
        ids.forEach((id, position) => {
          tx.update(areas).set({ position }).where(eq(areas.id, id)).run();
        });
      });
    },
    place: (projectId, areaId) => {
      db.update(projects)
        .set({ areaId })
        .where(eq(projects.id, projectId))
        .run();
    },
    projectsIn,
    rename: (id, name) => {
      db.update(areas).set({ name }).where(eq(areas.id, id)).run();
    },
    setSettings: (id, change) => {
      if (Object.keys(change).length > 0) {
        db.update(areas).set(change).where(eq(areas.id, id)).run();
      }
    },
  };
};

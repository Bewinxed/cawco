import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  connectionAreas,
  connectionProjects,
  connections,
  projects,
} from "./schema";

export type ConnectionRow = typeof connections.$inferSelect;

/** The rows connections.ts keeps; only that module reads `sealed`. */
export interface ConnectionsDb {
  /** The areas that grant a connection to every project in them, by its id. */
  readonly areasOf: (id: string) => string[];
  readonly byId: (id: string) => ConnectionRow | undefined;
  readonly byName: (name: string) => ConnectionRow | undefined;
  /** The row a sign-in's redirect names by its `state`. */
  readonly bySignInState: (state: string) => ConnectionRow | undefined;
  readonly insert: (row: ConnectionRow) => void;
  readonly list: () => ConnectionRow[];
  /**
   * The names of the connections a project grants its sessions: its own
   * grants and its area's, the area read as it stands now.
   */
  readonly namesForProject: (projectId: string) => string[];
  /** The projects that grant a connection, by its id. */
  readonly projectsOf: (id: string) => string[];
  /** The areas that grant it, all at once. */
  readonly setAreas: (id: string, areaIds: string[]) => void;
  /** The projects that grant it, all at once. */
  readonly setProjects: (id: string, projectIds: string[]) => void;
  readonly update: (
    id: string,
    patch: Partial<Omit<ConnectionRow, "id" | "createdAt">>
  ) => void;
}

export const connectionsDb = (db: BunSQLiteDatabase): ConnectionsDb => ({
  areasOf: (id) =>
    db
      .select({ areaId: connectionAreas.areaId })
      .from(connectionAreas)
      .where(eq(connectionAreas.connectionId, id))
      .all()
      .map((row) => row.areaId),
  byId: (id) =>
    db.select().from(connections).where(eq(connections.id, id)).get(),
  byName: (name) =>
    db.select().from(connections).where(eq(connections.name, name)).get(),
  bySignInState: (state) =>
    db
      .select()
      .from(connections)
      .where(eq(connections.signInState, state))
      .get(),
  insert: (row) => {
    db.insert(connections).values(row).run();
  },
  list: () => db.select().from(connections).orderBy(connections.name).all(),
  namesForProject: (projectId) => {
    const own = db
      .select({ name: connections.name })
      .from(connectionProjects)
      .innerJoin(
        connections,
        eq(connections.id, connectionProjects.connectionId)
      )
      .where(eq(connectionProjects.projectId, projectId))
      .all()
      .map((row) => row.name);
    const areaId = db
      .select({ areaId: projects.areaId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()?.areaId;
    const area = areaId
      ? db
          .select({ name: connections.name })
          .from(connectionAreas)
          .innerJoin(
            connections,
            eq(connections.id, connectionAreas.connectionId)
          )
          .where(eq(connectionAreas.areaId, areaId))
          .all()
          .map((row) => row.name)
      : [];
    return [...new Set([...own, ...area])];
  },
  projectsOf: (id) =>
    db
      .select({ projectId: connectionProjects.projectId })
      .from(connectionProjects)
      .where(eq(connectionProjects.connectionId, id))
      .all()
      .map((row) => row.projectId),
  setAreas: (id, areaIds) => {
    db.transaction((tx) => {
      tx.delete(connectionAreas)
        .where(eq(connectionAreas.connectionId, id))
        .run();
      for (const areaId of new Set(areaIds)) {
        tx.insert(connectionAreas).values({ connectionId: id, areaId }).run();
      }
    });
  },
  setProjects: (id, projectIds) => {
    db.transaction((tx) => {
      tx.delete(connectionProjects)
        .where(eq(connectionProjects.connectionId, id))
        .run();
      for (const projectId of new Set(projectIds)) {
        tx.insert(connectionProjects)
          .values({ connectionId: id, projectId })
          .run();
      }
    });
  },
  update: (id, patch) => {
    db.update(connections)
      .set({ ...patch, updatedAt: patch.updatedAt ?? new Date() })
      .where(eq(connections.id, id))
      .run();
  },
});

import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { connectionProjects, connections } from "./schema";

export type ConnectionRow = typeof connections.$inferSelect;

/** The rows connections.ts keeps; only that module reads `sealed`. */
export interface ConnectionsDb {
  readonly byId: (id: string) => ConnectionRow | undefined;
  readonly byName: (name: string) => ConnectionRow | undefined;
  /** The row a sign-in's redirect names by its `state`. */
  readonly bySignInState: (state: string) => ConnectionRow | undefined;
  readonly insert: (row: ConnectionRow) => void;
  readonly list: () => ConnectionRow[];
  /** The names of the connections a project grants its sessions. */
  readonly namesForProject: (projectId: string) => string[];
  /** The projects that grant a connection, by its id. */
  readonly projectsOf: (id: string) => string[];
  /** The projects that grant it, all at once. */
  readonly setProjects: (id: string, projectIds: string[]) => void;
  readonly update: (
    id: string,
    patch: Partial<Omit<ConnectionRow, "id" | "createdAt">>
  ) => void;
}

export const connectionsDb = (db: BunSQLiteDatabase): ConnectionsDb => ({
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
  namesForProject: (projectId) =>
    db
      .select({ name: connections.name })
      .from(connectionProjects)
      .innerJoin(
        connections,
        eq(connections.id, connectionProjects.connectionId)
      )
      .where(eq(connectionProjects.projectId, projectId))
      .all()
      .map((row) => row.name),
  projectsOf: (id) =>
    db
      .select({ projectId: connectionProjects.projectId })
      .from(connectionProjects)
      .where(eq(connectionProjects.connectionId, id))
      .all()
      .map((row) => row.projectId),
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

/**
 * What a project deleted for good leaves outside its own rows (project-delete.ts):
 * the sessions started from it and the workspaces its work items and its
 * places' stages were cut in, read so each can be removed on its machine,
 * then the work items and workspace rows themselves dropped once their
 * clones are gone. Its own rows go as a forget takes them (forget.ts).
 */
import { and, eq, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  instances,
  type WorkspaceState,
  workItems,
  workspaces,
} from "./schema";

/** A session of the project, as its removal needs it. */
export interface HeldSession {
  /** Whether it was asked to end already (a stop, a delete), and how. */
  endIntent: string | null;
  id: string;
  machineId: string;
}

/** A workspace of the project, as its removal needs it. */
export interface HeldWorkspace {
  carry: string | null;
  /** A host-scope delegate's: no clone of its own. */
  host: boolean;
  id: string;
  machineId: string;
  path: string;
  state: WorkspaceState;
}

export interface ProjectWorkDb {
  /** The project's work items, and each of `workspaceIds` no other work item names, gone. */
  readonly drop: (projectId: string, workspaceIds: readonly string[]) => void;
  /**
   * The sessions whose `project_id` is the project's, with `formerly`
   * (sessions a forget unlinked, still unlinked), and the workspaces its
   * work items or its places' stages (`placeIds`) were cut in.
   */
  readonly held: (
    projectId: string,
    placeIds: readonly string[],
    formerly: readonly string[]
  ) => { sessions: HeldSession[]; workspaces: HeldWorkspace[] };
}

export const projectWorkDb = (db: BunSQLiteDatabase): ProjectWorkDb => ({
  held: (projectId, placeIds, formerly) => {
    const sessions = db
      .select({
        id: instances.id,
        machineId: instances.machineId,
        endIntent: instances.endIntent,
      })
      .from(instances)
      .where(
        or(
          eq(instances.projectId, projectId),
          formerly.length > 0
            ? and(
                inArray(instances.id, [...formerly]),
                isNull(instances.projectId)
              )
            : undefined
        )
      )
      .all();
    const items = db
      .select({ id: workItems.workspaceId })
      .from(workItems)
      .where(eq(workItems.projectId, projectId));
    const rows = db
      .select()
      .from(workspaces)
      .where(
        or(
          inArray(workspaces.id, items),
          placeIds.length > 0
            ? inArray(workspaces.stageFor, [...placeIds])
            : undefined
        )
      )
      .all();
    return {
      sessions,
      workspaces: rows.map((row) => ({
        carry: row.carry,
        host: row.host,
        id: row.id,
        machineId: row.machineId,
        path: row.path,
        state: row.state,
      })),
    };
  },
  drop: (projectId, workspaceIds) => {
    db.transaction((tx) => {
      tx.delete(workItems).where(eq(workItems.projectId, projectId)).run();
      if (workspaceIds.length > 0) {
        tx.delete(workspaces)
          .where(
            and(
              inArray(workspaces.id, [...workspaceIds]),
              notExists(
                tx
                  .select({ one: sql`1` })
                  .from(workItems)
                  .where(eq(workItems.workspaceId, workspaces.id))
              )
            )
          )
          .run();
      }
    });
  },
});

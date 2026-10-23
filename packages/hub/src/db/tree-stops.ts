import { eq, inArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { treeStops } from "./schema";

export type TreeStopRow = typeof treeStops.$inferSelect;

/** The rows of the stops that walk a delegation tree (tree-stops.ts). */
export interface TreeStopsDb {
  /** Every row standing, oldest ask first. */
  readonly all: () => TreeStopRow[];
  /** Its session ended and its item took its final state: the row goes. */
  readonly drop: (instanceId: string) => void;
  /** Its own end was asked of its machine, at `at`. */
  readonly ended: (instanceId: string, at: Date) => void;
  /** The row of `instanceId`, if a stop holds it. */
  readonly get: (instanceId: string) => TreeStopRow | undefined;
  /** The rows of `ids` a stop holds. */
  readonly of: (ids: readonly string[]) => TreeStopRow[];
  /** Rows filed for one stop, each session once: one a stop already holds keeps its row. */
  readonly put: (rows: readonly Omit<TreeStopRow, "endedAt">[]) => void;
  /** Rows under `parentId`: the sessions its end waits on. */
  readonly under: (parentId: string) => TreeStopRow[];
}

export const treeStopsDb = (db: BunSQLiteDatabase): TreeStopsDb => ({
  all: () => db.select().from(treeStops).orderBy(treeStops.askedAt).all(),
  ended: (instanceId, at) => {
    db.update(treeStops)
      .set({ endedAt: at })
      .where(eq(treeStops.instanceId, instanceId))
      .run();
  },
  get: (instanceId) =>
    db
      .select()
      .from(treeStops)
      .where(eq(treeStops.instanceId, instanceId))
      .get(),
  of: (ids) =>
    ids.length === 0
      ? []
      : db
          .select()
          .from(treeStops)
          .where(inArray(treeStops.instanceId, [...ids]))
          .all(),
  drop: (instanceId) => {
    db.delete(treeStops).where(eq(treeStops.instanceId, instanceId)).run();
  },
  under: (parentId) =>
    db.select().from(treeStops).where(eq(treeStops.parentId, parentId)).all(),
  put: (rows) => {
    if (rows.length === 0) {
      return;
    }
    db.insert(treeStops)
      .values(rows.map((row) => ({ ...row, endedAt: null })))
      .onConflictDoNothing()
      .run();
  },
});

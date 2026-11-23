/** Folder moves' rows: a project's folder, files and all, on its way to another folder or machine (folder-moves.ts). */

import type { FolderMoveStage } from "@cawco/core/folder-move";
import { and, eq, inArray, or } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { folderMoves } from "./schema";
import type { FolderMoveState } from "./stored-types";

/** A folder move as folder-moves.ts reads it. */
export type FolderMoveRow = typeof folderMoves.$inferSelect;

/** The stages a folder move has settled in. */
const SETTLED: FolderMoveStage[] = ["done", "calledOff"];

export interface FolderMovesDb {
  /** Removes `id` once it has settled; whether it did. */
  readonly deleteSettled: (id: string) => boolean;
  readonly insert: (
    row: Omit<FolderMoveRow, "createdAt" | "updatedAt">
  ) => FolderMoveRow;
  readonly row: (id: string) => FolderMoveRow | undefined;
  /** Every folder move, oldest first. */
  readonly rows: () => FolderMoveRow[];
  /** The folder moves of a place. */
  readonly rowsOf: (placeId: string) => FolderMoveRow[];
  /** The folder moves whose steps run on or read from `machineId`. */
  readonly rowsOn: (machineId: string) => FolderMoveRow[];
  /** Moves one job; the row as it now is, or undefined when it is gone. */
  readonly update: (
    id: string,
    patch: { stage?: FolderMoveStage; state?: FolderMoveState }
  ) => FolderMoveRow | undefined;
}

export const folderMovesDb = (db: BunSQLiteDatabase): FolderMovesDb => ({
  insert: (row) => {
    const at = new Date();
    return db
      .insert(folderMoves)
      .values({ ...row, createdAt: at, updatedAt: at })
      .returning()
      .get();
  },
  row: (id) =>
    db.select().from(folderMoves).where(eq(folderMoves.id, id)).get(),
  rows: () =>
    db.select().from(folderMoves).orderBy(folderMoves.createdAt).all(),
  rowsOn: (machineId) =>
    db
      .select()
      .from(folderMoves)
      .where(
        or(
          eq(folderMoves.sourceMachineId, machineId),
          eq(folderMoves.targetMachineId, machineId)
        )
      )
      .orderBy(folderMoves.createdAt)
      .all(),
  rowsOf: (placeId) =>
    db
      .select()
      .from(folderMoves)
      .where(eq(folderMoves.placeId, placeId))
      .orderBy(folderMoves.createdAt)
      .all(),
  deleteSettled: (id) =>
    db
      .delete(folderMoves)
      .where(and(inArray(folderMoves.stage, SETTLED), eq(folderMoves.id, id)))
      .returning({ id: folderMoves.id })
      .all().length > 0,
  update: (id, patch) =>
    db
      .update(folderMoves)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(folderMoves.id, id))
      .returning()
      .get(),
});

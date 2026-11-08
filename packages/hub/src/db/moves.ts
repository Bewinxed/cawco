/** Move rows: a session or workspace on its way to another machine. */

import { eq, or } from "drizzle-orm";
import type { DbCore } from "./core";
import { moves, projects } from "./schema";
import type { MoveState } from "./stored-types";

/** A project move as moves.ts reads it: its state whole, the machines it names put back in it. */
export type MoveRow = Omit<
  typeof moves.$inferSelect,
  "state" | "sourceMachineId" | "targetMachineId" | "stopOn"
> & { state: MoveState };

/** A move's machines out of its state, as their columns keep them. */
const moveColumnsOf = ({
  sourceMachineId,
  targetMachineId,
  stopOn,
  ...state
}: MoveState) => ({
  state,
  sourceMachineId,
  targetMachineId,
  stopOn: stopOn ?? null,
});

/** A stored move with its machines back in its state. */
const moveOf = ({
  sourceMachineId,
  targetMachineId,
  stopOn,
  state,
  ...row
}: typeof moves.$inferSelect): MoveRow => ({
  ...row,
  state: {
    ...state,
    sourceMachineId,
    targetMachineId,
    ...(stopOn === null ? {} : { stopOn }),
  },
});

export interface MovesDb {
  readonly deleteMove: (id: string) => void;
  readonly insertMove: (
    row: Omit<MoveRow, "createdAt" | "updatedAt">
  ) => MoveRow;
  /** One project move's record (moves.ts). */
  readonly moveRow: (id: string) => MoveRow | undefined;
  /** Every project move, oldest first. */
  readonly moveRows: () => MoveRow[];
  /** The project moves that name a machine: a Cancel it has not heard, or a step on it or reading from it. */
  readonly moveRowsOn: (machineId: string) => MoveRow[];
  readonly setProjectMoveDeclined: (id: string, at: Date | null) => void;
  /** Moves one job; the row as it now is, or undefined when it is gone. */
  readonly updateMove: (
    id: string,
    patch: Partial<Pick<MoveRow, "stage" | "state">>
  ) => MoveRow | undefined;
}

export const movesDb = (core: DbCore): MovesDb => {
  const { db } = core;

  return {
    moveRows: () =>
      db.select().from(moves).orderBy(moves.createdAt).all().map(moveOf),
    moveRowsOn: (machineId) =>
      db
        .select()
        .from(moves)
        .where(
          or(
            eq(moves.stopOn, machineId),
            eq(moves.targetMachineId, machineId),
            eq(moves.sourceMachineId, machineId)
          )
        )
        .orderBy(moves.createdAt)
        .all()
        .map(moveOf),
    moveRow: (id) => {
      const row = db.select().from(moves).where(eq(moves.id, id)).get();
      return row && moveOf(row);
    },
    insertMove: ({ state, ...row }) => {
      const now = new Date();
      return moveOf(
        db
          .insert(moves)
          .values({
            ...row,
            ...moveColumnsOf(state),
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get()
      );
    },
    updateMove: (id, { state, ...patch }) => {
      const row = db
        .update(moves)
        .set({
          ...patch,
          ...(state ? moveColumnsOf(state) : {}),
          updatedAt: new Date(),
        })
        .where(eq(moves.id, id))
        .returning()
        .get();
      return row && moveOf(row);
    },
    deleteMove: (id) => {
      db.delete(moves).where(eq(moves.id, id)).run();
    },
    setProjectMoveDeclined: (id, at) => {
      db.update(projects)
        .set({ moveDeclinedAt: at })
        .where(eq(projects.id, id))
        .run();
    },
  };
};

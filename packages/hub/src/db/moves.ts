/** Move rows: a session or workspace on its way to another machine. */

import type { MoveStage } from "@cawco/core/move";
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
} from "drizzle-orm";
import type { DbCore } from "./core";
import { moves, projects } from "./schema";
import type { MoveState } from "./stored-types";

type StoredMove = typeof moves.$inferSelect;

/** A project move as moves.ts reads it: its state whole, what its columns hold put back in it. */
export type MoveRow = Omit<
  StoredMove,
  | "learned"
  | "sourceMachineId"
  | "targetMachineId"
  | "stopOn"
  | "targetInstanceId"
  | "askId"
  | "approved"
  | "stateUnread"
> & { state: MoveState };

/** What holds a session's row (moves.ts `holds`): a move the hub runs, or one whose state does not read. */
export type MoveHold = "move" | "unread";

/** A move's state into its columns: its machines, its session, its ask and its approval, and the rest as JSON. */
const moveColumnsOf = ({
  sourceMachineId,
  targetMachineId,
  stopOn,
  targetInstanceId,
  askId,
  approved,
  ...learned
}: MoveState) => ({
  learned,
  sourceMachineId,
  targetMachineId,
  stopOn: stopOn ?? null,
  targetInstanceId,
  askId: askId ?? null,
  approved: approved === true,
  stateUnread: null,
});

/** A stored move with what its columns hold back in its state; none when its state does not read. */
const moveOf = ({
  sourceMachineId,
  targetMachineId,
  stopOn,
  targetInstanceId,
  askId,
  approved,
  learned,
  stateUnread,
  ...row
}: StoredMove): MoveRow[] =>
  learned === null || targetInstanceId === null || stateUnread !== null
    ? []
    : [
        {
          ...row,
          state: {
            ...learned,
            sourceMachineId,
            targetMachineId,
            targetInstanceId,
            ...(stopOn === null ? {} : { stopOn }),
            ...(askId === null ? {} : { askId }),
            ...(approved ? { approved } : {}),
          },
        },
      ];

/** A move the hub reads as one: its state read whole. */
const READ = and(isNotNull(moves.learned), isNull(moves.stateUnread));

/** The stages a move has settled in: it started its session, or was cancelled. */
const SETTLED_STAGES: MoveStage[] = ["started", "cancelled"];

/** A move that has not settled: it still holds its session's row. */
const UNSETTLED = notInArray(moves.stage, SETTLED_STAGES);

/** A move that has settled, by its stage column: read whole or not. */
const SETTLED = inArray(moves.stage, SETTLED_STAGES);

/** A settled move as its removal reads it: by its columns alone, its state read or not. */
export interface SettledMove {
  id: string;
  updatedAt: Date;
}

/** A move whose state, as a hub before migration 0415 stored it, does not read, while it names the row it holds. */
interface UnreadMove {
  id: string;
  targetInstanceId: string;
  targetMachineId: string;
}

export interface MovesDb {
  /** Removes `id` when it has settled (by its stage, its state read or not); whether it did. */
  readonly deleteSettledMove: (id: string) => boolean;
  readonly insertMove: (
    row: Omit<MoveRow, "createdAt" | "updatedAt">
  ) => MoveRow;
  /** The move in its approval whose parked ask is `askId`, read whole. */
  readonly moveAwaiting: (askId: string) => MoveRow | undefined;
  /** What holds `instanceId`'s row: a move that has not settled and starts it, read whole or not; undefined when none. */
  readonly moveHolding: (instanceId: string) => MoveHold | undefined;
  /** One project move's record (moves.ts), when its state reads. */
  readonly moveRow: (id: string) => MoveRow | undefined;
  /** Every project move whose state reads, oldest first. */
  readonly moveRows: () => MoveRow[];
  /** The project moves that name a machine: a Cancel it has not heard, or a step on it or reading from it. */
  readonly moveRowsOn: (machineId: string) => MoveRow[];
  /** Every move that has settled, by its stage, whether its state reads or not. */
  readonly movesSettled: () => SettledMove[];
  /** The moves that have not settled whose state does not read, and the session row each names. */
  readonly movesUnread: () => UnreadMove[];
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
      db
        .select()
        .from(moves)
        .where(READ)
        .orderBy(moves.createdAt)
        .all()
        .flatMap(moveOf),
    moveRowsOn: (machineId) =>
      db
        .select()
        .from(moves)
        .where(
          and(
            READ,
            or(
              eq(moves.stopOn, machineId),
              eq(moves.targetMachineId, machineId),
              eq(moves.sourceMachineId, machineId)
            )
          )
        )
        .orderBy(moves.createdAt)
        .all()
        .flatMap(moveOf),
    moveRow: (id) => {
      const row = db
        .select()
        .from(moves)
        .where(and(eq(moves.id, id), READ))
        .get();
      return row && moveOf(row)[0];
    },
    moveAwaiting: (askId) => {
      const row = db
        .select()
        .from(moves)
        .where(and(eq(moves.askId, askId), eq(moves.stage, "approval"), READ))
        .get();
      return row && moveOf(row)[0];
    },
    moveHolding: (instanceId) => {
      const holding = db
        .select({ stateUnread: moves.stateUnread })
        .from(moves)
        .where(and(eq(moves.targetInstanceId, instanceId), UNSETTLED))
        .all();
      if (holding.length === 0) {
        return;
      }
      return holding.some((one) => one.stateUnread === null)
        ? "move"
        : "unread";
    },
    movesUnread: () =>
      db
        .select({
          id: moves.id,
          targetInstanceId: moves.targetInstanceId,
          targetMachineId: moves.targetMachineId,
        })
        .from(moves)
        .where(
          and(
            isNotNull(moves.stateUnread),
            isNotNull(moves.targetInstanceId),
            UNSETTLED
          )
        )
        .orderBy(moves.createdAt)
        .all()
        .flatMap(({ targetInstanceId, ...move }) =>
          targetInstanceId === null ? [] : [{ ...move, targetInstanceId }]
        ),
    insertMove: ({ state, ...row }) => {
      const now = new Date();
      db.insert(moves)
        .values({
          ...row,
          ...moveColumnsOf(state),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return { ...row, state, createdAt: now, updatedAt: now };
    },
    updateMove: (id, { state, ...patch }) => {
      const row = db
        .update(moves)
        .set({
          ...patch,
          ...(state ? moveColumnsOf(state) : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(moves.id, id), READ))
        .returning()
        .get();
      return row && moveOf(row)[0];
    },
    deleteSettledMove: (id) =>
      db
        .delete(moves)
        .where(and(eq(moves.id, id), SETTLED))
        .returning({ id: moves.id })
        .all().length > 0,
    movesSettled: () =>
      db
        .select({ id: moves.id, updatedAt: moves.updatedAt })
        .from(moves)
        .where(SETTLED)
        .all(),
    setProjectMoveDeclined: (id, at) => {
      db.update(projects)
        .set({ moveDeclinedAt: at })
        .where(eq(projects.id, id))
        .run();
    },
  };
};

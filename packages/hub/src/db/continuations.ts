/** Continuation rows: a session's prepared hand-over to a fresh conversation. */

import { eq } from "drizzle-orm";
import { unreachable } from "../unreachable";
import type { DbCore } from "./core";
import { continuations } from "./schema";
import type { ContinuationAsker } from "./stored-types";

type StoredContinuation = typeof continuations.$inferSelect;

/** A job's wait, while it waits (continuations.ts `waitStep`): since when, since when its work ran (null when not known), and why. */
export interface ContinuationWait {
  from: number;
  since: number | null;
  why: string;
}

/** The columns the row mapper reads into {@link ContinuationRow}'s `askedBy` and `waiting`. */
type AskerColumns =
  | "askedByKind"
  | "askedById"
  | "askedByMove"
  | "askedByUnread"
  | "waitingFrom"
  | "waitingSince"
  | "waitingWhy";

/**
 * A continuation job as continuations.ts reads it: who asked, null when
 * what a hub before migration 0414 stored of that does not read (the job
 * is then neither folded into its source nor its source's move, and fails
 * as the hub starts while open), and its wait, null when it does not wait.
 */
export type ContinuationRow = Omit<StoredContinuation, AskerColumns> & {
  askedBy: ContinuationAsker | null;
  waiting: ContinuationWait | null;
};

/** A new job as it is written: who asked always reads. */
type NewContinuation = Omit<
  ContinuationRow,
  "askedBy" | "createdAt" | "updatedAt" | "waitingUnread"
> & { askedBy: ContinuationAsker };

/**
 * A continuation job without its request, its prepared transcript and
 * prompt, its summary and its open items: what is read of every job on
 * every send and every board publish ({@link DbShape.continuationSlips}).
 * `prepared` runs to megabytes for a long session, and its column parses
 * and checks it whole on every read (hub stored-json.ts), so a read that
 * needs a job's session, stage and ids never selects it.
 */
export type ContinuationSlip = Pick<
  ContinuationRow,
  | "id"
  | "sourceInstanceId"
  | "summariserInstanceId"
  | "targetInstanceId"
  | "stage"
  | "error"
  | "askedBy"
  | "waiting"
  | "createdAt"
  | "updatedAt"
>;

/** Who asked, into its columns. */
const askerColumnsOf = (asker: ContinuationAsker) => {
  switch (asker.kind) {
    case "person":
      return { askedByKind: asker.kind, askedById: null, askedByMove: null };
    case "session":
    case "task":
      return {
        askedByKind: asker.kind,
        askedById: asker.id,
        askedByMove: null,
      };
    case "move": {
      const { kind, ...move } = asker;
      return { askedByKind: kind, askedById: null, askedByMove: move };
    }
    default:
      throw unreachable(asker);
  }
};

/** The wait, into its columns: a wait written replaces one kept as not read. */
const waitColumnsOf = (wait: ContinuationWait | null) => ({
  waitingFrom: wait?.from ?? null,
  waitingSince: wait?.since ?? null,
  waitingWhy: wait?.why ?? null,
  waitingUnread: null,
});

/** Who asked, out of its columns; null when what was stored of it does not read. */
const askerOf = (
  row: Pick<
    StoredContinuation,
    "askedByKind" | "askedById" | "askedByMove" | "askedByUnread"
  >
): ContinuationAsker | null => {
  if (row.askedByUnread !== null) {
    return null;
  }
  switch (row.askedByKind) {
    case "person":
      return { kind: "person" };
    case "session":
    case "task":
      return row.askedById === null
        ? null
        : { kind: row.askedByKind, id: row.askedById };
    case "move":
      return row.askedByMove === null
        ? null
        : { kind: "move", ...row.askedByMove };
    default:
      throw unreachable(row.askedByKind);
  }
};

/** The wait, out of its columns: none unless when it began and why are both there. */
const waitOf = (
  row: Pick<StoredContinuation, "waitingFrom" | "waitingSince" | "waitingWhy">
): ContinuationWait | null =>
  row.waitingFrom === null || row.waitingWhy === null
    ? null
    : { from: row.waitingFrom, since: row.waitingSince, why: row.waitingWhy };

/** A stored job, or a slip of one, with who asked and its wait read out of their columns. */
const rowOf = <Row extends Pick<StoredContinuation, AskerColumns>>({
  askedByKind,
  askedById,
  askedByMove,
  askedByUnread,
  waitingFrom,
  waitingSince,
  waitingWhy,
  ...row
}: Row) => ({
  ...row,
  askedBy: askerOf({ askedByKind, askedById, askedByMove, askedByUnread }),
  waiting: waitOf({ waitingFrom, waitingSince, waitingWhy }),
});

export interface ContinuationsDb {
  readonly continuationRow: (id: string) => ContinuationRow | undefined;
  /** Every continuation job, oldest first, as its slip: a job whole is {@link continuationRow}'s. */
  readonly continuationSlips: () => ContinuationSlip[];
  /** A job's stage alone, for the steps that look for a Cancel while they wait ({@link ContinuationSlip}). */
  readonly continuationStage: (
    id: string
  ) => ContinuationRow["stage"] | undefined;
  readonly deleteContinuation: (id: string) => void;
  readonly insertContinuation: (row: NewContinuation) => ContinuationRow;
  /** Moves one job; the row as it now is, or undefined when it is gone. */
  readonly updateContinuation: (
    id: string,
    patch: Partial<
      Pick<
        ContinuationRow,
        | "stage"
        | "error"
        | "summary"
        | "summariserInstanceId"
        | "prepared"
        | "openItems"
        | "waiting"
      >
    >
  ) => ContinuationRow | undefined;
}

export const continuationsDb = (core: DbCore): ContinuationsDb => {
  const { db } = core;

  return {
    continuationSlips: () =>
      db
        .select({
          id: continuations.id,
          sourceInstanceId: continuations.sourceInstanceId,
          summariserInstanceId: continuations.summariserInstanceId,
          targetInstanceId: continuations.targetInstanceId,
          stage: continuations.stage,
          error: continuations.error,
          askedByKind: continuations.askedByKind,
          askedById: continuations.askedById,
          askedByMove: continuations.askedByMove,
          askedByUnread: continuations.askedByUnread,
          waitingFrom: continuations.waitingFrom,
          waitingSince: continuations.waitingSince,
          waitingWhy: continuations.waitingWhy,
          createdAt: continuations.createdAt,
          updatedAt: continuations.updatedAt,
        })
        .from(continuations)
        .orderBy(continuations.createdAt)
        .all()
        .map(rowOf),
    continuationRow: (id) => {
      const row = db
        .select()
        .from(continuations)
        .where(eq(continuations.id, id))
        .get();
      return row && rowOf(row);
    },
    continuationStage: (id) =>
      db
        .select({ stage: continuations.stage })
        .from(continuations)
        .where(eq(continuations.id, id))
        .get()?.stage,
    deleteContinuation: (id) => {
      db.delete(continuations).where(eq(continuations.id, id)).run();
    },
    insertContinuation: ({ askedBy, waiting, ...row }) => {
      const now = new Date();
      return rowOf(
        db
          .insert(continuations)
          .values({
            ...row,
            ...askerColumnsOf(askedBy),
            ...waitColumnsOf(waiting),
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get()
      );
    },
    updateContinuation: (id, { waiting, ...patch }) => {
      const row = db
        .update(continuations)
        .set({
          ...patch,
          ...(waiting === undefined ? {} : waitColumnsOf(waiting)),
          updatedAt: new Date(),
        })
        .where(eq(continuations.id, id))
        .returning()
        .get();
      return row && rowOf(row);
    },
  };
};

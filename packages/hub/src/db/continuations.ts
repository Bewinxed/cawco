/** Continuation rows: a session's prepared hand-over to a fresh conversation. */

import { eq } from "drizzle-orm";
import type { DbCore } from "./core";
import { continuations } from "./schema";

export type ContinuationRow = typeof continuations.$inferSelect;

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

export interface ContinuationsDb {
  readonly continuationRow: (id: string) => ContinuationRow | undefined;
  /** Every continuation job, oldest first, as its slip: a job whole is {@link continuationRow}'s. */
  readonly continuationSlips: () => ContinuationSlip[];
  /** A job's stage alone, for the steps that look for a Cancel while they wait ({@link ContinuationSlip}). */
  readonly continuationStage: (
    id: string
  ) => ContinuationRow["stage"] | undefined;
  readonly deleteContinuation: (id: string) => void;
  readonly insertContinuation: (
    row: Omit<ContinuationRow, "createdAt" | "updatedAt">
  ) => ContinuationRow;
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
          askedBy: continuations.askedBy,
          waiting: continuations.waiting,
          createdAt: continuations.createdAt,
          updatedAt: continuations.updatedAt,
        })
        .from(continuations)
        .orderBy(continuations.createdAt)
        .all(),
    continuationRow: (id) =>
      db.select().from(continuations).where(eq(continuations.id, id)).get(),
    continuationStage: (id) =>
      db
        .select({ stage: continuations.stage })
        .from(continuations)
        .where(eq(continuations.id, id))
        .get()?.stage,
    deleteContinuation: (id) => {
      db.delete(continuations).where(eq(continuations.id, id)).run();
    },
    insertContinuation: (row) => {
      const now = new Date();
      return db
        .insert(continuations)
        .values({ ...row, createdAt: now, updatedAt: now })
        .returning()
        .get();
    },
    updateContinuation: (id, patch) =>
      db
        .update(continuations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(continuations.id, id))
        .returning()
        .get(),
  };
};

import { and, asc, eq, isNull } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { lfsRefusals } from "./schema";

export type LfsRefusalRow = typeof lfsRefusals.$inferSelect;

/** LFS servers a checkout named that the project never declared (schema `lfsRefusals`). */
export interface LfsRefusalsDb {
  /** Puts a refusal away from Needs you; false when none stands. */
  readonly dismiss: (projectId: string, endpoint: string) => boolean;
  /** Every refusal the person has not put away, oldest first: what Needs you lists. */
  readonly open: () => LfsRefusalRow[];
  /**
   * Records that git-lfs refused `endpoint` for project `projectId` in the
   * checkout `root` on `machineId`; false when it was raised already.
   */
  readonly refused: (refusal: {
    endpoint: string;
    machineId: string;
    projectId: string;
    root: string;
  }) => boolean;
}

export const lfsRefusalsDb = (db: BunSQLiteDatabase): LfsRefusalsDb => ({
  refused: ({ endpoint, machineId, projectId, root }) =>
    db
      .insert(lfsRefusals)
      .values({ projectId, endpoint, machineId, root, notedAt: new Date() })
      .onConflictDoNothing()
      .returning({ projectId: lfsRefusals.projectId })
      .all().length > 0,
  open: () =>
    db
      .select()
      .from(lfsRefusals)
      .where(isNull(lfsRefusals.dismissedAt))
      .orderBy(asc(lfsRefusals.notedAt))
      .all(),
  dismiss: (projectId, endpoint) =>
    db
      .update(lfsRefusals)
      .set({ dismissedAt: new Date() })
      .where(
        and(
          eq(lfsRefusals.projectId, projectId),
          eq(lfsRefusals.endpoint, endpoint),
          isNull(lfsRefusals.dismissedAt)
        )
      )
      .returning({ projectId: lfsRefusals.projectId })
      .all().length > 0,
});

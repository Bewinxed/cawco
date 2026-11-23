import { and, asc, eq, isNull } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { lfsOffers, lfsRefusals } from "./schema";

export type LfsOfferRow = typeof lfsOffers.$inferSelect;
export type LfsRefusalRow = typeof lfsRefusals.$inferSelect;

/** Git LFS offered for a place's left-out large files (schema `lfsOffers`). */
export interface LfsOffersDb {
  /** Records the answer: tracked with the commit that took them, or Not now. */
  readonly answer: (
    id: string,
    answer: "tracked" | "dismissed",
    commit?: string
  ) => void;
  /** Puts a refusal away from Needs you; false when none stands. */
  readonly dismissRefusal: (projectId: string, endpoint: string) => boolean;
  readonly of: (id: string) => LfsOfferRow | undefined;
  readonly offer: (
    offer: Omit<LfsOfferRow, "answer" | "answeredAt" | "commit">
  ) => void;
  /** Every offer not answered yet, oldest first: what Needs you lists. */
  readonly open: () => LfsOfferRow[];
  /** Every refusal the person has not put away, oldest first: what Needs you lists. */
  readonly refusals: () => LfsRefusalRow[];
  /**
   * Records that git-lfs refused `endpoint` for project `projectId` in the
   * checkout `root` on `machineId` (schema `lfsRefusals`); false when it was
   * raised already.
   */
  readonly refused: (refusal: {
    endpoint: string;
    machineId: string;
    projectId: string;
    root: string;
  }) => boolean;
}

export const lfsOffersDb = (db: BunSQLiteDatabase): LfsOffersDb => ({
  refused: ({ endpoint, machineId, projectId, root }) =>
    db
      .insert(lfsRefusals)
      .values({ projectId, endpoint, machineId, root, notedAt: new Date() })
      .onConflictDoNothing()
      .returning({ projectId: lfsRefusals.projectId })
      .all().length > 0,
  answer: (id, answer, commit) => {
    db.update(lfsOffers)
      .set({ answer, answeredAt: new Date(), commit: commit ?? null })
      .where(eq(lfsOffers.id, id))
      .run();
  },
  offer: (offer) => {
    db.insert(lfsOffers).values(offer).run();
  },
  of: (id) => db.select().from(lfsOffers).where(eq(lfsOffers.id, id)).get(),
  open: () =>
    db
      .select()
      .from(lfsOffers)
      .where(isNull(lfsOffers.answer))
      .orderBy(asc(lfsOffers.offeredAt))
      .all(),
  refusals: () =>
    db
      .select()
      .from(lfsRefusals)
      .where(isNull(lfsRefusals.dismissedAt))
      .orderBy(asc(lfsRefusals.notedAt))
      .all(),
  dismissRefusal: (projectId, endpoint) =>
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

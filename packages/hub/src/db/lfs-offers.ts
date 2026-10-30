import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { lfsOffers, lfsRefusals } from "./schema";

export type LfsOfferRow = typeof lfsOffers.$inferSelect;

/** Git LFS offered for a place's left-out large files (schema `lfsOffers`). */
export interface LfsOffersDb {
  /** Records the answer: tracked with the commit that took them, or Not now. */
  readonly answer: (
    id: string,
    answer: "tracked" | "dismissed",
    commit?: string
  ) => void;
  readonly of: (id: string) => LfsOfferRow | undefined;
  readonly offer: (
    offer: Omit<LfsOfferRow, "answer" | "answeredAt" | "commit">
  ) => void;
  /**
   * Records that project `projectId`'s conversation is told git-lfs refused
   * `endpoint` (schema `lfsRefusals`); false when it was told already.
   */
  readonly refused: (projectId: string, endpoint: string) => boolean;
}

export const lfsOffersDb = (db: BunSQLiteDatabase): LfsOffersDb => ({
  refused: (projectId, endpoint) =>
    db
      .insert(lfsRefusals)
      .values({ projectId, endpoint, notedAt: new Date() })
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
});

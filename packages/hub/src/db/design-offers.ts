import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { designOffers } from "./schema";

export type DesignOfferRow = typeof designOffers.$inferSelect;

/** Caw's one design-system offer per project (schema `designOffers`). */
export interface DesignOffersDb {
  /** Records the answer: Build with the task it filed, or Not now. */
  readonly answer: (
    projectId: string,
    answer: "built" | "dismissed",
    builtTaskId?: string
  ) => void;
  readonly of: (projectId: string) => DesignOfferRow | undefined;
  /** Files the offer; false when the project was offered already. */
  readonly offer: (offer: {
    projectId: string;
    taskId: string;
    threadId: string;
  }) => boolean;
}

export const designOffersDb = (db: BunSQLiteDatabase): DesignOffersDb => ({
  answer: (projectId, answer, builtTaskId) => {
    db.update(designOffers)
      .set({ answer, answeredAt: new Date(), builtTaskId: builtTaskId ?? null })
      .where(eq(designOffers.projectId, projectId))
      .run();
  },
  offer: ({ projectId, taskId, threadId }) =>
    db
      .insert(designOffers)
      .values({ projectId, taskId, threadId, offeredAt: new Date() })
      .onConflictDoNothing()
      .returning({ projectId: designOffers.projectId })
      .all().length > 0,
  of: (projectId) =>
    db
      .select()
      .from(designOffers)
      .where(eq(designOffers.projectId, projectId))
      .get(),
});

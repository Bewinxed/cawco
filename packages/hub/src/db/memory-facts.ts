import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { factUses } from "./schema";

/** When briefs last carried each of a project's knowledge lessons (schema `fact_uses`, memory.ts `contextFor`). */
export interface MemoryFactsDb {
  /** Every recorded use of a project's knowledge lessons, by lesson id. */
  readonly lessonUses: (projectId: string) => Map<string, Date>;
  /** A brief carried these lessons now. */
  readonly useLessons: (projectId: string, ids: string[], at: Date) => void;
}

export const memoryFactsDb = (db: BunSQLiteDatabase): MemoryFactsDb => ({
  lessonUses: (projectId) =>
    new Map(
      db
        .select()
        .from(factUses)
        .where(eq(factUses.projectId, projectId))
        .all()
        .map((row) => [row.key, row.usedAt])
    ),
  useLessons: (projectId, ids, at) => {
    if (ids.length === 0) {
      return;
    }
    db.insert(factUses)
      .values(ids.map((key) => ({ projectId, path: "", key, usedAt: at })))
      .onConflictDoUpdate({
        target: [factUses.projectId, factUses.path, factUses.key],
        set: { usedAt: at },
      })
      .run();
  },
});

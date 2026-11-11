import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { trimKept, trimOffers } from "./schema";

/** A skill or server a set lists, as the trim routine keeps it (schema `trimKept`). */
export interface KeptItem {
  kind: "skill" | "server";
  name: string;
}

/** The unused skills and servers routine's own rows (unused-trim.ts). */
export interface TrimDb {
  /** Records the answer, once: a later one leaves the first. */
  readonly answer: (projectId: string, answer: "on" | "dismissed") => void;
  /** The person's answer to Caw's suggestion in `projectId`; undefined while it stands. */
  readonly answerOf: (projectId: string) => "on" | "dismissed" | undefined;
  /** Records `items` as kept in `set`: no later run proposes them for it. */
  readonly keep: (set: string, items: readonly KeptItem[]) => void;
  /** What the person kept in `set`. */
  readonly kept: (set: string) => KeptItem[];
}

export const trimDb = (db: BunSQLiteDatabase): TrimDb => ({
  answerOf: (projectId) =>
    db
      .select({ answer: trimOffers.answer })
      .from(trimOffers)
      .where(eq(trimOffers.projectId, projectId))
      .get()?.answer,
  answer: (projectId, answer) => {
    db.insert(trimOffers)
      .values({ projectId, answer, answeredAt: new Date() })
      .onConflictDoNothing()
      .run();
  },
  keep: (set, items) => {
    const keptAt = new Date();
    for (const item of items) {
      db.insert(trimKept)
        .values({ set, kind: item.kind, name: item.name, keptAt })
        .onConflictDoNothing()
        .run();
    }
  },
  kept: (set) =>
    db
      .select({ kind: trimKept.kind, name: trimKept.name })
      .from(trimKept)
      .where(eq(trimKept.set, set))
      .all(),
});

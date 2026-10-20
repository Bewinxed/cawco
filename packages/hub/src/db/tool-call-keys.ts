import { and, eq, lte, ne } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { toolCallKeys } from "./schema";

export type ToolCallKeyRow = typeof toolCallKeys.$inferSelect;

/** A keyed call's answer as it was sent: replayed byte for byte. */
export interface KeptAnswer {
  body: Uint8Array;
  headers: [string, string][];
  status: number;
}

export interface ToolCallKeysDb {
  /** Its answer, kept with the key. */
  readonly answer: (id: string, answer: KeptAnswer, at: number) => void;
  /** The row a key has, if any. */
  readonly get: (id: string) => ToolCallKeyRow | undefined;
  /**
   * Every key the last process was running, marked `interrupted`: none of
   * them is running now. Called once, as the hub starts.
   */
  readonly interrupt: () => number;
  /** Drops every key not running, last changed at or before `before`; how many went. */
  readonly prune: (before: number) => number;
  /** A key never seen, taken as running; false when it has a row already. */
  readonly take: (id: string, at: number) => boolean;
}

export const toolCallKeysDb = (db: BunSQLiteDatabase): ToolCallKeysDb => ({
  answer: (id, { status, headers, body }, at) => {
    db.update(toolCallKeys)
      .set({
        state: "answered",
        status,
        headers,
        body: Buffer.from(body),
        at: new Date(at),
      })
      .where(eq(toolCallKeys.id, id))
      .run();
  },
  get: (id) =>
    db.select().from(toolCallKeys).where(eq(toolCallKeys.id, id)).get(),
  interrupt: () =>
    db
      .update(toolCallKeys)
      .set({ state: "interrupted" })
      .where(eq(toolCallKeys.state, "running"))
      .returning({ id: toolCallKeys.id })
      .all().length,
  prune: (before) =>
    db
      .delete(toolCallKeys)
      .where(
        and(
          lte(toolCallKeys.at, new Date(before)),
          ne(toolCallKeys.state, "running")
        )
      )
      .returning({ id: toolCallKeys.id })
      .all().length,
  take: (id, at) =>
    db
      .insert(toolCallKeys)
      .values({ id, state: "running", at: new Date(at) })
      .onConflictDoNothing()
      .returning({ id: toolCallKeys.id })
      .all().length === 1,
});

import type { AccountMove } from "@cawco/core";
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { owedMoves } from "./schema";

/**
 * A move a session owes to its next launch (schema `owedMoves`), read the
 * way server.ts takes it: `to` absent is a relaunch alone, its row already
 * naming the account.
 */
export interface OwedMove {
  /** A person asked for it ({@link OwedMovesDb}): the at-limit controller only carries it out. */
  byHand?: true;
  move: AccountMove | null;
  to?: string;
  /**
   * What it waits on: the session's turn's end; the work its process holds
   * for later (a background task) ending, or the restart bound; or its
   * machine connected again.
   */
  waits: "turn" | "work" | "machine";
}

/**
 * The moves sessions owe, one per session, kept in the database so a hub
 * restart carries each out (server.ts `owedMoves`). A put replaces the
 * session's move before it: the newer ask supersedes it. Its row goes with
 * the session's row (a cascade) and with its account's.
 */
export interface OwedMovesDb {
  /** True when it owed one. */
  readonly delete: (instanceId: string) => boolean;
  readonly get: (instanceId: string) => OwedMove | undefined;
  readonly has: (instanceId: string) => boolean;
  /** Every owed move, by session. */
  readonly list: () => [string, OwedMove][];
  readonly set: (instanceId: string, owed: OwedMove) => void;
}

type Row = typeof owedMoves.$inferSelect;

const toOwed = (row: Row): OwedMove => ({
  move: row.move ?? null,
  waits: row.waits,
  ...(row.toAccountId === null ? {} : { to: row.toAccountId }),
  ...(row.byHand ? { byHand: true as const } : {}),
});

export const owedMovesDb = (db: BunSQLiteDatabase): OwedMovesDb => {
  const get = (instanceId: string): OwedMove | undefined => {
    const row = db
      .select()
      .from(owedMoves)
      .where(eq(owedMoves.instanceId, instanceId))
      .get();
    return row ? toOwed(row) : undefined;
  };
  return {
    get,
    has: (instanceId) => get(instanceId) !== undefined,
    list: () =>
      db
        .select()
        .from(owedMoves)
        .all()
        .map((row) => [row.instanceId, toOwed(row)]),
    set: (instanceId, owed) => {
      const values = {
        toAccountId: owed.to ?? null,
        byHand: owed.byHand === true,
        move: owed.move,
        waits: owed.waits,
        createdAt: new Date(),
      };
      db.insert(owedMoves)
        .values({ instanceId, ...values })
        .onConflictDoUpdate({ target: owedMoves.instanceId, set: values })
        .run();
    },
    delete: (instanceId) =>
      db
        .delete(owedMoves)
        .where(eq(owedMoves.instanceId, instanceId))
        .returning({ instanceId: owedMoves.instanceId })
        .all().length > 0,
  };
};

import type { TurnCut } from "@cawco/core/turn-cuts";
import { asc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { turnCuts } from "./schema";

/** The turns the hub cut, and why (schema.ts `turnCuts`). */
export interface TurnCutsDb {
  /** A cut of `instanceId`'s turn, sent at `at`. */
  readonly add: (instanceId: string, cut: TurnCut) => void;
  /** Every cut of the session, oldest first. */
  readonly of: (instanceId: string) => TurnCut[];
}

export const turnCutsDb = (db: BunSQLiteDatabase): TurnCutsDb => ({
  add: (instanceId, { at, calls, cause }) => {
    db.insert(turnCuts)
      .values({ instanceId, at: new Date(at), cause, calls: [...calls] })
      .run();
  },
  of: (instanceId) =>
    db
      .select({ at: turnCuts.at, calls: turnCuts.calls, cause: turnCuts.cause })
      .from(turnCuts)
      .where(eq(turnCuts.instanceId, instanceId))
      .orderBy(asc(turnCuts.at))
      .all()
      .map((row) => ({
        at: row.at.getTime(),
        calls: row.calls,
        cause: row.cause,
      })),
});
